// UploadAgent.js — Uploads video + thumbnail to YouTube via Data API v3
// OAuth2 with refresh token (one-time setup, then runs forever)
import { google } from 'googleapis';
import fs         from 'fs';

// Category IDs
// 28 = Science & Technology
// 22 = People & Blogs
// 27 = Education
const CATEGORY_ID = '28';

export class UploadAgent {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    this.oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    });
  }

  // ── Build description with timestamps ──────────────────────────
  buildDescription(description, mode, tags) {
    const disclaimer = `\n\n⚠️ Disclaimer: This channel documents real development work. Trading content is for educational purposes only — not financial advice.\n`;
    const tagLine    = `\n\n#${tags.slice(0, 5).join(' #')}`;
    const links      = `\n\n🔗 Links:\n• GitHub: https://github.com/umair24171\n• Portfolio: https://devumair.vercel.app\n• FarahGPT: https://apps.apple.com/app/id6746275409`;

    return `${description}${mode !== 'short' ? links : ''}${disclaimer}${tagLine}`;
  }

  // ── Upload video ────────────────────────────────────────────────
  async upload({ videoPath, thumbnailPath, title, description, tags, mode }) {
    const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

    console.log(`  ⬆️  Uploading video: ${title}`);

    // For Shorts: YouTube auto-detects if video is ≤60s + vertical (9:16)
    const fullDescription = this.buildDescription(description, mode, tags);

    // Resumable upload for large files
    const fileSize = fs.statSync(videoPath).size;
    console.log(`  📦 File size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

    const videoRes = await youtube.videos.insert({
      part:  ['snippet', 'status'],
      requestBody: {
        snippet: {
          title:           title,
          description:     fullDescription,
          tags:            tags,
          categoryId:      CATEGORY_ID,
          defaultLanguage: 'en',
          defaultAudioLanguage: 'en',
        },
        status: {
          privacyStatus:            'public',
          selfDeclaredMadeForKids:  false,
          madeForKids:              false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body:     fs.createReadStream(videoPath),
      },
    });

    const videoId = videoRes.data.id;
    console.log(`  ✅ Video uploaded: ${videoId}`);

    // Upload thumbnail (requires verified account OR 1K+ subscribers)
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: 'image/png',
          body:     fs.createReadStream(thumbnailPath),
        },
      });
      console.log(`  ✅ Thumbnail uploaded`);
    } catch (thumbErr) {
      // Thumbnail upload fails if channel isn't verified — non-fatal
      console.warn(`  ⚠️  Thumbnail upload failed (channel may need verification): ${thumbErr.message}`);
    }

    // NOTE: files are intentionally NOT deleted here.
    // The pipeline cleans them up after all cross-posting steps (Instagram, LinkedIn, etc.) are done.

    return `https://youtu.be/${videoId}`;
  }
}
