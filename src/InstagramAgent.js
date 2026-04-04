// InstagramAgent.js — Posts video as an Instagram Reel
//
// PRIMARY:  Official Instagram Graph API (Content Publishing API)
//   Requires: INSTAGRAM_GRAPH_TOKEN  — long-lived access token
//             INSTAGRAM_GRAPH_USER_ID — numeric IG user ID
//   Setup guide: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
//
// FALLBACK: instagram-private-api (unofficial — unreliable on cloud IPs)
//   Requires: INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD

import fs   from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const GRAPH_BASE        = 'https://graph.instagram.com/v21.0';
const POLL_INTERVAL_MS  = 4000;
const POLL_MAX_ATTEMPTS = 25;   // 100 seconds max before giving up
const COVER_PATH        = '/tmp/ig_cover.jpg';

export class InstagramAgent {
  constructor() {
    // Graph API creds (preferred)
    this.graphToken  = process.env.INSTAGRAM_GRAPH_TOKEN;
    this.graphUserId = process.env.INSTAGRAM_GRAPH_USER_ID;

    // Private API creds (fallback)
    this.username = process.env.INSTAGRAM_USERNAME;
    this.password = process.env.INSTAGRAM_PASSWORD;
  }

  // ── Hashtag generator (finance-focused) ────────────────────────────────────
  generateHashtags(script) {
    const combined = [
      script.title        || '',
      script.visualNotes  || '',
      script.description  || '',
      (script.tags || []).join(' '),
    ].join(' ').toLowerCase();

    const tags = new Set([
      '#financebending', '#personalfinance', '#moneytips', '#financialfreedom', '#investing',
    ]);

    if (/\b(invest|stock|etf|dividend|portfolio|market|s&p|index)\b/.test(combined)) {
      ['#investing', '#stockmarket', '#wealthbuilding', '#dividends', '#etf']
        .forEach(t => tags.add(t));
    }

    if (/\b(budget|sav(e|ing|ings)|spend|expense|frugal)\b/.test(combined)) {
      ['#budgeting', '#savemoney', '#frugalliving', '#moneysaving', '#debtfree']
        .forEach(t => tags.add(t));
    }

    if (/\b(freelanc|side.hustle|gig|self.employ|solopreneur|passive.income)\b/.test(combined)) {
      ['#sidehustle', '#freelancer', '#passiveincome', '#solopreneur', '#gigeconomy']
        .forEach(t => tags.add(t));
    }

    if (/\b(hysa|savings.account|apy|interest.rate|cd |certificate)\b/.test(combined)) {
      ['#hysa', '#savingsaccount', '#highyield', '#interestrates', '#moneymarket']
        .forEach(t => tags.add(t));
    }

    if (/\b(tax|irs|deduct|write.off|1099|w2|roth|401k|ira)\b/.test(combined)) {
      ['#taxes', '#taxhacks', '#rothira', '#401k', '#taxdeductions']
        .forEach(t => tags.add(t));
    }

    // Always-append
    ['#reels', '#moneyreels', '#financetips', '#wealthmindset', '#buildwealth']
      .forEach(t => tags.add(t));

    return [...tags].slice(0, 20).join(' ');
  }

  // ── Upload local video to a temporary public CDN (needed by Graph API) ─────
  // Uses 0x0.st — no API key needed, files auto-expire after a few days
  async _uploadToTempCDN(videoPath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(videoPath), {
      filename:    'reel.mp4',
      contentType: 'video/mp4',
    });

    const res = await fetch('https://0x0.st', {
      method:  'POST',
      body:    form,
      headers: form.getHeaders(),
      timeout: 60000,
    });

    if (!res.ok) throw new Error(`CDN upload failed: ${res.status} ${res.statusText}`);
    const url = (await res.text()).trim();
    if (!url.startsWith('http')) throw new Error(`CDN returned invalid URL: ${url}`);
    return url;
  }

  // ── Official Graph API posting ──────────────────────────────────────────────
  async _postViaGraphAPI(videoPath, caption) {
    const token  = this.graphToken;
    const userId = this.graphUserId;

    // 1. Upload video to a publicly accessible URL (Instagram fetches it from here)
    console.log('  📤 Uploading video to temp CDN...');
    const videoUrl = await this._uploadToTempCDN(videoPath);
    console.log(`  🔗 CDN URL ready`);

    // 2. Create Reel media container
    const containerParams = new URLSearchParams({
      media_type:    'REELS',
      video_url:     videoUrl,
      caption,
      share_to_feed: 'true',
      access_token:  token,
    });

    const containerRes = await fetch(
      `${GRAPH_BASE}/${userId}/media`,
      { method: 'POST', body: containerParams }
    );
    const container = await containerRes.json();
    if (!container.id) {
      throw new Error(`Container creation failed: ${JSON.stringify(container)}`);
    }
    const containerId = container.id;
    console.log(`  📦 Container created: ${containerId}`);

    // 3. Poll until Instagram finishes processing the video
    let lastStatus = '';
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const statusRes = await fetch(
        `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${token}`
      );
      const { status_code } = await statusRes.json();

      if (status_code !== lastStatus) {
        console.log(`  ⏳ Processing: ${status_code}`);
        lastStatus = status_code;
      }

      if (status_code === 'FINISHED') break;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') {
        throw new Error(`Container processing failed: ${status_code}`);
      }
      if (i === POLL_MAX_ATTEMPTS - 1) {
        throw new Error('Container processing timed out after 100s');
      }
    }

    // 4. Publish
    const publishParams = new URLSearchParams({
      creation_id:  containerId,
      access_token: token,
    });

    const publishRes = await fetch(
      `${GRAPH_BASE}/${userId}/media_publish`,
      { method: 'POST', body: publishParams }
    );
    const publish = await publishRes.json();
    if (!publish.id) {
      throw new Error(`Publish failed: ${JSON.stringify(publish)}`);
    }

    const postUrl = `https://www.instagram.com/p/${publish.id}/`;
    console.log(`  ✅ Posted to Instagram: ${postUrl}`);
    return postUrl;
  }

  // ── Fallback: unofficial private API ───────────────────────────────────────
  // NOTE: Instagram blocks cloud/CI IPs — this will fail on GitHub Actions.
  // Only reliable for local runs from a trusted home/office IP.
  async _postViaPrivateAPI(videoPath, caption) {
    const { IgApiClient } = require('instagram-private-api');
    const ig = new IgApiClient();
    ig.state.generateDevice(this.username);
    await ig.account.login(this.username, this.password);

    // Extract cover frame
    let coverBuffer;
    try {
      execSync(`ffmpeg -y -i "${videoPath}" -frames:v 1 -q:v 2 "${COVER_PATH}" 2>/dev/null`, { stdio: 'pipe' });
      coverBuffer = fs.readFileSync(COVER_PATH);
    } catch {
      throw new Error('Could not extract cover frame');
    }

    const result = await ig.publish.video({
      video:      fs.readFileSync(videoPath),
      coverImage: coverBuffer,
      caption,
    });

    const code = result?.media?.code || '';
    return code ? `https://www.instagram.com/reel/${code}/` : 'https://www.instagram.com/';
  }

  // ── Public entry point ─────────────────────────────────────────────────────
  async post(videoPath, script) {
    if (!fs.existsSync(videoPath)) {
      console.warn(`  ⚠️  Video file not found: ${videoPath} — skipping Instagram`);
      return null;
    }

    const caption   = `${script.title}\n\n${this.generateHashtags(script)}`;
    const hasGraph  = this.graphToken && this.graphUserId;
    const hasPrivate = this.username && this.password;

    if (!hasGraph && !hasPrivate) {
      console.warn('  ⚠️  No Instagram credentials set — skipping');
      return null;
    }

    // ── Try Graph API first (official, reliable on CI) ──────────────────────
    if (hasGraph) {
      try {
        return await this._postViaGraphAPI(videoPath, caption);
      } catch (err) {
        console.warn(`  ⚠️  Graph API failed: ${err.message}`);
        if (!hasPrivate) return null;
        console.warn('  ↩️  Falling back to private API...');
      }
    }

    // ── Fallback: private API ────────────────────────────────────────────────
    if (hasPrivate) {
      try {
        const url = await this._postViaPrivateAPI(videoPath, caption);
        console.log(`  ✅ Posted to Instagram (private API): ${url}`);
        return url;
      } catch (err) {
        console.warn(`  ⚠️  Instagram post failed: ${err.message}`);
        if (/incorrect|bad.request|checkpoint|challenge/i.test(err.message)) {
          console.warn('  💡 Fix: set INSTAGRAM_GRAPH_TOKEN + INSTAGRAM_GRAPH_USER_ID for reliable CI posting');
        }
        return null;
      }
    }

    return null;
  }
}
