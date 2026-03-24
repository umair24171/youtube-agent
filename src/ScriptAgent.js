// ScriptAgent.js — Writes scripts about TRENDING AI topics, dev commentary style
import { GoogleGenAI } from '@google/genai';

const CHANNEL_VOICE = `
You are writing scripts for a YouTube channel by a dev who comments on AI/tech trends.

CHANNEL STYLE:
- Reacts to and explains trending AI news from a DEVELOPER'S perspective
- Casual, direct, zero corporate speak
- Gets to the point immediately — no "Hey guys welcome back"
- Explains WHY it matters for developers and builders
- Gives actual technical context, not just hype
- Occasionally drops real dev credibility: "I've shipped 15 apps", "I use this in production"
- Ends with opinion or hot take, not a generic CTA

THE TOPIC IS ALWAYS THE TRENDING EVENT — not about the host's personal projects.
`;

// Retry wrapper for Gemini API calls — retries on ANY error, fixed 5 s delay
async function withRetry(fn, retries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`  ⚠️  Gemini attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt < retries) {
        console.warn(`  ⏳ Retrying in ${delayMs / 1000}s...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

export class ScriptAgent {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generate(topic, mode) {
    const isShort = mode === 'short';
    const isRecap = topic.isRecap === true;

    const formatInstructions = isRecap ? `
FORMAT: Weekly AI News Recap (3-5 min)
- Hook: "Here is everything that happened in AI this week"
- Cover 3-5 biggest AI events with brief commentary on each
- End with: hot take on where AI is heading
` : isShort ? `
FORMAT: YouTube Short (35-45 seconds MAX — voiceoverText MUST be under 60 words, NO EXCEPTIONS)
- Line 1 (0-3s): HOOK — one punchy statement about the trending topic. No intro.
- Lines 2-5 (3-35s): Fast explanation of what happened and why devs care. One idea per line. Be ruthlessly brief.
- Final line: Hot take or opinion — "This changes everything" / "Nobody's talking about this" etc.
- Sound like a dev reacting to news in real time. Raw, not polished.
` : `
FORMAT: Long-form video (8-12 minutes)
- Hook (0-30s): What happened and why it's a big deal — with specifics
- Context (30s-2min): Background on the company/product/trend
- What it means for developers (2-7min): Practical implications, code examples, API changes
- Hot take (7-9min): Opinion — is this good or bad for the dev ecosystem?
- CTA (last 30s): "Subscribe for weekly AI news from a developer's perspective"
`;

    const prompt = `${CHANNEL_VOICE}

TRENDING TOPIC: ${topic.title}
TRENDING EVENT: ${topic.trendingEvent || topic.context}
HOOK: ${topic.hook}
CONTEXT: ${topic.context}
ANGLE: ${topic.angle}

${formatInstructions}

Write a script about THIS TRENDING TOPIC. The content is about the trend, not about the host.
The host is just the developer voice reacting to and explaining the news.

Respond ONLY in valid JSON (no markdown):
{
  "title": "SEO YouTube title about the trending topic (under 65 chars)",
  "voiceoverText": "complete script for TTS — natural speech, reacting to the trend",
  "description": "YouTube description about the trending topic, max 400 chars",
  "tags": ["ai","artificial intelligence","tag3","tag4","tag5","tag6","tag7","tag8"],
  "linkedInCaption": "LinkedIn take on this AI trend, 3 short paragraphs, ends with [VIDEO_URL]",
  "visualNotes": "2-3 words describing visuals (e.g. AI robot screen, dark tech)"
}`;

    const script = await withRetry(async () => {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text.trim().replace(/```json|```/g, '').trim();

      try {
        const parsed = JSON.parse(text);
        if (!parsed.voiceoverText || !parsed.title) {
          throw new Error('Missing required fields in script response');
        }
        return parsed;
      } catch (parseErr) {
        throw new Error(`Script JSON parse failed: ${parseErr.message}\nRaw: ${text.substring(0, 200)}`);
      }
    });

    return script;
  }
}
