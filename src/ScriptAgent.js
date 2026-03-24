// ScriptAgent.js — Writes full YouTube scripts via Gemini 2.0 Flash
import { GoogleGenAI } from '@google/genai';

const CHANNEL_VOICE = `
You are writing for Umair Bilal — a Pakistani indie developer with a casual, direct, zero-fluff style.

KEY FACTS TO INJECT NATURALLY (pick the most relevant ones):
- Built live AI gold trading system: 5 agents on Render, backtested on 1.44M candles (2021-2026)
- FarahGPT: AI Islamic habit app, 5,100+ users, $7.99-$12.99/mo subscriptions via RevenueCat
- Muslifie: Muslim travel marketplace, 200+ international companies registered
- Shipped 15+ production apps across iOS and Android
- Stack: Flutter/Dart, Node.js, Firebase, MongoDB, Stripe, RevenueCat, GitHub Actions, Render
- Building from Multan, Pakistan — users across 70+ countries

VOICE RULES:
- Casual and direct. No corporate speak. No "In today's video..."
- Uses specific numbers always (not "many users" — "5,100 users")
- Admits failures and what didn't work — authenticity beats polish
- Ends with real CTA: "Subscribe if you're building something real"
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
FORMAT: Weekly Recap (3-5 min)
- Hook with biggest result from the week
- Trading agent results — signals, win/loss
- What I built or shipped this week  
- One lesson learned
- CTA: "Follow along — I post every week"
` : isShort ? `
FORMAT: YouTube Short (40-50 seconds MAX — keep voiceoverText under 120 words)
- Line 1 (0-3s): HOOK — one shocking statement or number. No intro.
- Lines 2-6 (3-40s): Fast value. One idea per line. Max 10 words per line.
- Final line: CTA — "Follow for more"
- NO filler. Sound like a real dev texting a friend.
` : `
FORMAT: Long-form Tutorial (8-12 minutes)
- Intro (0-30s): Hook with real numbers. Skip the fluff.
- Problem (30s-90s): Specific pain point.
- Build/Demo (90s-7min): Step by step. Real code. Real decisions.
- Results (7-9min): Actual numbers. What worked, what failed.
- CTA (last 30s): Subscribe + what's next
`;

    const prompt = `${CHANNEL_VOICE}

TOPIC: ${topic.title}
HOOK: ${topic.hook}
CONTEXT: ${topic.context}

${formatInstructions}

Respond ONLY in valid JSON (no markdown):
{
  "title": "SEO-optimized YouTube title (under 65 chars)",
  "voiceoverText": "complete script for TTS — natural speech, no stage directions",
  "description": "YouTube description max 400 chars",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"],
  "linkedInCaption": "LinkedIn version 3 short paragraphs ending with [VIDEO_URL]",
  "visualNotes": "2-3 words for background (e.g. dark code editor)"
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