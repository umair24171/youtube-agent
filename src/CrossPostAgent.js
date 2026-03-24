// CrossPostAgent.js — Posts to LinkedIn after YouTube upload
import fetch from 'node-fetch';

export class CrossPostAgent {
  constructor() {
    this.linkedInToken = process.env.LINKEDIN_ACCESS_TOKEN;
    this.linkedInUrn   = process.env.LINKEDIN_PERSON_URN; // urn:li:person:XXXXXXXX
  }

  async post(title, videoUrl, linkedInCaption = '') {
    if (!this.linkedInToken || !this.linkedInUrn) {
      console.warn('  ⚠️  LinkedIn tokens not set — skipping cross-post');
      return;
    }

    const caption = linkedInCaption
      ? linkedInCaption.replace('[VIDEO_URL]', videoUrl)
      : `Just published a new video: ${title}\n\nWatch here: ${videoUrl}\n\n#AI #SaaS #IndieHacker #Developer #BuildInPublic`;

    const body = {
      author:     this.linkedInUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: 'ARTICLE',
          media: [{
            status: 'READY',
            description:   { text: title },
            originalUrl:   videoUrl,
            title:         { text: title },
          }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${this.linkedInToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`  ⚠️  LinkedIn post failed: ${res.status} — ${err}`);
      return;
    }

    console.log('  ✅ Posted to LinkedIn');
  }
}
