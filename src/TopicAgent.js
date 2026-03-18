// TopicAgent.js — Finds trending topics for AI Automation & SaaS niche
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

const CHANNEL_IDENTITY = `
CHANNEL: "Umair Bilal" — Pakistani dev who builds real AI systems, trading bots, and SaaS apps.
NICHE: AI Automation + SaaS Building (targeting US/UK/Australia devs and indie hackers)
PROOF POINTS:
- Built live AI gold trading system (5 agents on Render, 1.44M candles backtested)
- Shipped 15+ production apps with 5,100+ users across 70 countries
- Apps: FarahGPT (AI Islamic habit app), Muslifie (Muslim travel marketplace), MyAiPal, Voisbe
- Stack: Flutter, Node.js, Firebase, MongoDB, Stripe, RevenueCat, GitHub Actions
TONE: Casual, direct, zero fluff — shows real code, real results, real failures
AUDIENCE: Developers, indie hackers, SaaS builders — English speaking, Tier 1 countries
`;

const SHORT_TOPIC_IDEAS = [
  'AI agent that runs automatically on GitHub Actions',
  'How I use Gemini API for free to power my apps',
  'Node.js automation trick most devs dont know',
  'My Flutter app hit 5000 users — what I did differently',
  'Building a SaaS solo from Pakistan — what nobody tells you',
  'My AI trading bot fired 15 signals today automatically',
  'RevenueCat vs Stripe for mobile apps — real comparison',
  'Firebase free tier limits that will surprise you',
  'How I automated my entire content pipeline',
  'The automation stack I use for all my products',
  'How I deploy 5 AI agents for free on Render',
  'Flutter tip that saved me 3 hours of debugging',
  'Why I switched from Firebase to MongoDB for this feature',
  'GitHub Actions is basically a free server — here is how',
  'My app earned money while I slept — here is the setup',
  'One line of Node.js that changed how I build APIs',
  'How I get US users from Pakistan with zero ads',
  'The ElevenLabs trick I use for realistic AI voiceovers',
  'How I backtested a trading strategy on 1.4 million candles',
  'Why indie devs should build SaaS not apps',
];

const LONGFORM_TOPIC_IDEAS = [
  'I built an AI trading signal agent from scratch — full walkthrough',
  'How I launched a Flutter app to 5000 users with zero marketing budget',
  'Building 5 AI agents that run 24/7 on Render for free',
  'The complete stack I use to build and ship SaaS apps solo',
  'I automated my YouTube channel with AI — here is how it works',
  'FarahGPT: from idea to 5100 users — full story',
  'How I backtested a trading system on 1.4 million candles',
  'GitHub Actions as your free backend automation server',
  'Building Muslifie: a marketplace with 200+ companies registered',
  'How to go from freelancer to indie hacker — my real story',
  'Node.js multi-agent system architecture explained with real code',
  'How I use RevenueCat to monetize Flutter apps — full setup',
  'Building a real-time chat with Flutter + Firestore from scratch',
  'Stripe Connect for marketplaces — how I built autopayouts in Muslifie',
  'My complete Flutter + Firebase + MongoDB backend architecture',
];

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

export class TopicAgent {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  getSeedIdea(ideas, mode) {
    // Use timestamp-based index for better variety (changes hourly)
    const hourSlot = Math.floor(Date.now() / (60 * 60 * 1000));
    const dayIndex = new Date().getDay();
    return ideas[(dayIndex + hourSlot) % ideas.length];
  }

  async getTopic(mode) {
    if (mode === 'recap') {
      const recapData = process.env.RECAP_DATA || 'Weekly trading and dev recap';
      return {
        title: 'Weekly Recap',
        hook: recapData.substring(0, 100),
        angle: 'Real results from a real developer',
        context: recapData,
        isRecap: true,
      };
    }

    const ideas = mode === 'short' ? SHORT_TOPIC_IDEAS : LONGFORM_TOPIC_IDEAS;
    const seedIdea = this.getSeedIdea(ideas, mode);

    const prompt = `You are a YouTube growth strategist specializing in the AI/dev niche.

${CHANNEL_IDENTITY}

SEED IDEA: "${seedIdea}"

Based on this seed idea, generate a fresh and specific ${mode === 'short' ? 'YouTube Short (45-60s)' : 'YouTube video (8-12 min)'} topic.

Respond ONLY in valid JSON (no markdown, no explanation):
{
  "title": "compelling topic title",
  "hook": "first 3 second hook sentence",
  "angle": "what makes this unique",
  "searchKeyword": "main keyword",
  "context": "2-3 sentences of background info"
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

        // Deduplication: if this title was used in the last 30 runs, throw so withRetry regenerates
        const isDuplicate = usedTopics.some(
          t => t.toLowerCase() === (parsed.title || '').toLowerCase()
        );
        if (isDuplicate) {
          throw new Error(`Duplicate topic detected: "${parsed.title}" — regenerating`);
        }

        return parsed;
      });

      // Persist the new title (cap list at MAX_USED_TOPICS)
      usedTopics.unshift(result.title);
      if (usedTopics.length > MAX_USED_TOPICS) usedTopics.length = MAX_USED_TOPICS;
      saveUsedTopics(usedTopics);

      console.log(`  ✅ Topic from Gemini: "${result.title}"`);
      return result;
    } catch (err) {
      console.warn('  ⚠️  TopicAgent fell back to seed idea:', err.message);
      return {
        title: seedIdea,
        hook: 'Here is something most developers never think about...',
        angle: 'Real developer showing real results',
        searchKeyword: 'AI automation developer',
        context: seedIdea,
      };
    }
  }
}