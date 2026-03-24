// DiscordNotifier.js — Same pattern as your trading agents
import fetch from 'node-fetch';

export class DiscordNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async send(message) {
    if (!this.webhookUrl) {
      console.log('  [Discord] No webhook set — skipping notification');
      return;
    }

    try {
      const res = await fetch(this.webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          content:  message,
          username: '🎬 YouTube Agent',
        }),
      });

      if (!res.ok) {
        console.warn(`  ⚠️  Discord notify failed: ${res.status}`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Discord notify error: ${err.message}`);
    }
  }
}
