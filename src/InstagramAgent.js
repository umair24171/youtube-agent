// InstagramAgent.js — Posts video as an Instagram Reel
// Uses instagram-private-api (CommonJS) loaded via createRequire for ES module compat.
// Session is cached to /tmp/ig_session.json to avoid repeated logins.

import { createRequire } from 'module';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const require = createRequire(import.meta.url);

const SESSION_PATH = '/tmp/ig_session.json';
const COVER_PATH   = '/tmp/ig_cover.jpg';

export class InstagramAgent {
  constructor() {
    this.username = process.env.INSTAGRAM_USERNAME;
    this.password = process.env.INSTAGRAM_PASSWORD;
  }

  // ── Hashtag generator ───────────────────────────────────────────────────────
  generateHashtags(script) {
    const combined = [
      script.title        || '',
      script.visualNotes  || '',
      script.description  || '',
      (script.tags || []).join(' '),
    ].join(' ').toLowerCase();

    const tags = new Set([
      '#buildzn', '#coding', '#developer', '#programming', '#ai',
    ]);

    // AI / agent / LLM
    if (/\b(ai|agent|llm|gpt|claude|gemini|openai|anthropic|chatgpt|copilot)\b/.test(combined)) {
      ['#aiagents', '#artificialintelligence', '#machinelearning', '#chatgpt', '#llm']
        .forEach(t => tags.add(t));
    }

    // Flutter / mobile
    if (/\b(flutter|mobile|dart|ios|android|swiftui)\b/.test(combined)) {
      ['#flutter', '#mobiledev', '#flutterdeveloper', '#dart']
        .forEach(t => tags.add(t));
    }

    // Trading / algo
    if (/\b(trading|forex|gold|xauusd|algo|signal|market|stock)\b/.test(combined)) {
      ['#trading', '#algotrading', '#forex', '#gold', '#xauusd']
        .forEach(t => tags.add(t));
    }

    // Automation / DevOps
    if (/\b(automat|workflow|pipeline|github.?action|devops|no.?code|zapier|make)\b/.test(combined)) {
      ['#automation', '#nocode', '#githubactions', '#devops']
        .forEach(t => tags.add(t));
    }

    // Always-append closers
    ['#shorts', '#reels', '#techcontent', '#indiedev', '#solofounder']
      .forEach(t => tags.add(t));

    return [...tags].slice(0, 20).join(' ');
  }

  // ── Session-aware login ─────────────────────────────────────────────────────
  async _login(ig) {
    // 1. Always generate a consistent device fingerprint from the username
    ig.state.generateDevice(this.username);

    // 2. Try to restore a cached session first
    if (fs.existsSync(SESSION_PATH)) {
      try {
        const saved = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
        await ig.state.deserialize(saved);
        console.log('  ✅ Instagram session restored from cache');
        return;
      } catch {
        console.warn('  ⚠️  Cached session invalid — logging in fresh');
      }
    }

    // 3. Fresh login
    await ig.account.login(this.username, this.password);

    // 4. Persist session (omit immutable constants to keep the file lean)
    const state = await ig.state.serialize();
    delete state.constants;
    fs.writeFileSync(SESSION_PATH, JSON.stringify(state), 'utf8');
    console.log('  ✅ Instagram logged in and session saved');
  }

  // ── Extract a JPEG cover frame from the video via ffmpeg ───────────────────
  _extractCover(videoPath) {
    try {
      execSync(
        `ffmpeg -y -i "${videoPath}" -frames:v 1 -q:v 2 "${COVER_PATH}" 2>/dev/null`,
        { stdio: 'pipe' }
      );
      return fs.readFileSync(COVER_PATH);
    } catch (err) {
      console.warn(`  ⚠️  Could not extract cover frame: ${err.message}`);
      return null;
    }
  }

  // ── Public entry point ─────────────────────────────────────────────────────
  /**
   * Post a video as an Instagram Reel.
   * @param {string} videoPath  - Absolute path to the mp4 file
   * @param {object} script     - Script object: { title, visualNotes, description, tags }
   * @returns {string|null}     - Post URL on success, null on failure (never throws)
   */
  async post(videoPath, script) {
    // Guard: skip gracefully if credentials are missing
    if (!this.username || !this.password) {
      console.warn('  ⚠️  INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD not set — skipping Instagram post');
      return null;
    }

    if (!fs.existsSync(videoPath)) {
      console.warn(`  ⚠️  Video file not found at ${videoPath} — skipping Instagram post`);
      return null;
    }

    try {
      // Load the CJS package inside the method (avoids top-level import issues)
      const { IgApiClient } = require('instagram-private-api');
      const ig = new IgApiClient();

      await this._login(ig);

      // Build caption from title + auto-generated hashtags
      const hashtags = this.generateHashtags(script);
      const caption   = `${script.title}\n\n${hashtags}`;

      const videoBuffer = fs.readFileSync(videoPath);
      const coverBuffer = this._extractCover(videoPath);

      if (!coverBuffer) {
        console.warn('  ⚠️  No cover image — Instagram post skipped');
        return null;
      }

      // Publish to feed — Instagram automatically flags short vertical videos as Reels
      const result = await ig.publish.video({
        video:      videoBuffer,
        coverImage: coverBuffer,
        caption,
      });

      const code    = result?.media?.code || '';
      const postUrl = code ? `https://www.instagram.com/reel/${code}/` : 'https://www.instagram.com/';
      console.log(`  ✅ Posted to Instagram: ${postUrl}`);
      return postUrl;

    } catch (err) {
      // NEVER crash the main pipeline — log and move on
      console.warn(`  ⚠️  Instagram post failed: ${err.message}`);
      return null;
    }
  }
}
