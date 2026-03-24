// TopicAgent.js — Finds TRENDING AI/tech topics via Gemini knowledge
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// ── Used-topics deduplication ─────────────────────────────────────────────────
const USED_TOPICS_FILE = './data/used_topics.json';
const MAX_USED_TOPICS  = 30;

function loadUsedTopics() {
  try {
    if (fs.existsSync(USED_TOPICS_FILE)) {
      return JSON.parse(fs.readFileSync(USED_TOPICS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveUsedTopics(topics) {
  try {
    fs.mkdirSync(path.dirname(USED_TOPICS_FILE), { recursive: true });
    fs.writeFileSync(USED_TOPICS_FILE, JSON.stringify(topics, null, 2));
  } catch (err) {
    console.warn('  ⚠️  Could not save used_topics.json:', err.message);
  }
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────
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

export class TopicAgent {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async getTopic(mode) {
    if (mode === 'recap') {
      return {
        title: 'Weekly AI News Recap',
        hook: 'Here is everything that happened in AI this week that actually matters.',
        angle: 'Dev perspective on the week in AI',
        context: 'Weekly recap of biggest AI and tech news',
        isRecap: true,
      };
    }

    console.log('  🔍 Searching for trending AI topics...');

    const prompt = `Today is ${new Date().toDateString()}.

Search your knowledge for the MOST trending and talked-about AI/tech topics RIGHT NOW in the last few days. Think about:
- New model releases (Claude, GPT, Gemini, Llama, Mistral, etc.)
- Big AI product launches or updates
- Viral AI tools developers are using
- Controversial AI news or drama
- New coding tools, agents, or automation breakthroughs
- AI startup funding, acquisitions, or shutdowns
- Developer tools going viral on X/Twitter or HackerNews

Pick the single HOTTEST topic that developers and indie hackers are actively discussing right now.

Generate a ${mode === 'short' ? 'YouTube Short (45-55s)' : 'YouTube video (8-12 min)'} topic about it.

Respond ONLY in valid JSON (no markdown, no explanation):
{
  "trendingEvent": "what exactly is trending (1 sentence)",
  "title": "punchy topic title referencing the trend",
  "hook": "first 3 second hook — shocking or provocative statement about the trend",
  "angle": "developer/builder angle on why this matters",
  "context": "3-4 sentences of background on the trending topic with specific facts",
  "searchKeyword": "main keyword"
}`;

    const usedTopics = loadUsedTopics();

    try {
      const result = await withRetry(async () => {
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        const text = response.text.trim().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        if (!parsed.title || !parsed.context) throw new Error('Missing fields');

        // Deduplication check
        const isDuplicate = usedTopics.some(
          t => t.toLowerCase() === (parsed.title || '').toLowerCase()
        );
        if (isDuplicate) {
          throw new Error(`Duplicate topic detected: "${parsed.title}" — regenerating`);
        }

        return parsed;
      });

      // Persist used topic
      usedTopics.unshift(result.title);
      if (usedTopics.length > MAX_USED_TOPICS) usedTopics.length = MAX_USED_TOPICS;
      saveUsedTopics(usedTopics);

      console.log(`  🔥 Trending: ${result.trendingEvent}`);
      return result;
    } catch (err) {
      console.warn('  ⚠️  TopicAgent fell back to seed idea:', err.message);

      // Fallback seeds — all about AI trends, not about Umair
      const seeds = [
        { title: 'Claude 4 Just Dropped — Is GPT-4 Dead?', hook: 'Anthropic just changed everything.', context: 'Claude 4 released with major capability jumps. Developers are switching from GPT-4 in droves.' },
        { title: 'Every Developer Is Using This AI Tool Now', hook: 'This tool went from 0 to 1M users in 2 weeks.', context: 'A new AI coding tool is going viral across developer communities on X and HackerNews.' },
        { title: 'OpenAI Just Released Something Huge', hook: 'OpenAI dropped a new model and nobody is talking about it enough.', context: 'OpenAI latest release is changing how developers build AI applications.' },
        { title: 'Google Gemini vs Claude vs GPT — 2025 Real Comparison', hook: 'I tested all three for a week. Here is what actually matters.', context: 'Developers are trying to pick the best AI API for their apps. Real comparison with code.' },
        { title: 'This AI Agent Framework Is Taking Over GitHub', hook: 'This repo got 50k stars in one week.', context: 'A new AI agent framework is going viral on GitHub with developers using it to build autonomous systems.' },
        { title: 'Cursor AI Is Replacing Junior Devs — Here Is Proof', hook: 'I built a full app in 2 hours using only Cursor.', context: 'AI coding assistants are getting so good that entire apps are being built without writing code manually.' },
        { title: 'The AI Startup That Just Raised $1B', hook: 'A startup nobody heard of just raised a billion dollars for AI.', context: 'Major AI funding rounds are happening weekly. Here is what it means for developers building in the space.' },
      ];
      const pick = seeds[new Date().getDay() % seeds.length];
      return { ...pick, angle: 'Developer perspective', searchKeyword: 'AI news', trendingEvent: pick.hook };
    }
  }
}
