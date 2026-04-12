// TopicAgent.js — Finds FINANCE BENDING topics via Gemini knowledge
// Niche: Personal finance hacks bent for specific target audiences
// v3 — Weighted audience selection based on performance data
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// ── Used-topics deduplication ─────────────────────────────────────────────────
const USED_TOPICS_FILE        = './data/used_topics.json';
const AUDIENCE_PERFORMANCE_FILE = './data/audience_performance.json';
const MAX_USED_TOPICS         = 50;

// ── Target audiences — occupation-first only (broad demographics removed) ─────
// Removed: 'Millennials in Debt', 'Remote Workers', '9-to-5 Employees'
// These have no community identity on YouTube — algorithm can't target them
const TARGET_AUDIENCES = [
  'Nurses',
  'Teachers',
  'Introverts',
  'Freelancers',
  'Single Moms',
  'College Students',
  'Side Hustlers',
  'Retail Workers',
  'Truck Drivers',
  'Real Estate Agents',
  'Uber Drivers',
  'New Parents',
];

// ── Performance weight loader ─────────────────────────────────────────────────
// Manual JSON: { "Nurses": 171, "Freelancers": 131, "Single Moms": 45 }
// Audiences not in the file get DEFAULT_WEIGHT so new ones still get picked
const DEFAULT_WEIGHT = 10;

function loadAudienceWeights() {
  try {
    if (fs.existsSync(AUDIENCE_PERFORMANCE_FILE)) {
      return JSON.parse(fs.readFileSync(AUDIENCE_PERFORMANCE_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

// Weighted random pick — higher view count = higher probability
// Weight = total views for that audience (or DEFAULT_WEIGHT if untracked)
function weightedAudiencePick(audiences, weights) {
  const total = audiences.reduce((sum, a) => sum + (weights[a] || DEFAULT_WEIGHT), 0);
  let rand = Math.random() * total;
  for (const a of audiences) {
    rand -= (weights[a] || DEFAULT_WEIGHT);
    if (rand <= 0) return a;
  }
  return audiences[audiences.length - 1];
}

// ── Used-topics helpers ───────────────────────────────────────────────────────
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

// ── Retry wrapper with model fallback ─────────────────────────────────────────
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function withRetry(fn, retriesPerModel = 2, delayMs = 5000) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= retriesPerModel; attempt++) {
      try {
        return await fn(model);
      } catch (err) {
        lastErr = err;
        const is503 = err.message && err.message.includes('503');
        console.warn(`  ⚠️  Gemini [${model}] attempt ${attempt}/${retriesPerModel} failed: ${err.message}`);
        if (attempt < retriesPerModel) {
          const delay = delayMs * attempt;
          console.warn(`  ⏳ Retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else if (!is503) {
          throw err;
        }
      }
    }
    const nextModel = GEMINI_MODELS[GEMINI_MODELS.indexOf(model) + 1];
    if (nextModel) console.warn(`  🔄 Switching to fallback model: ${nextModel}`);
  }
  throw lastErr;
}

export class TopicAgent {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async getTopic(mode) {
    if (mode === 'recap') {
      return {
        title: 'Weekly Finance Hacks Recap',
        hook: 'Here are the 5 money moves that actually worked this week — broken down for your life.',
        angle: 'Finance bending — personal money tactics built for specific people',
        context: 'Weekly recap of the best personal finance hacks, savings tactics, and money moves curated for real working people.',
        targetAudience: 'General Audience',
        isRecap: true,
      };
    }

    const usedTopics       = loadUsedTopics();
    const audienceWeights  = loadAudienceWeights();

    // Log current weights so you can see what's driving selection
    console.log('  📊 Audience weights loaded:', JSON.stringify(audienceWeights));

    // Weighted pick — avoid back-to-back repeat of same audience
    let targetAudience;
    let attempts = 0;
    do {
      targetAudience = weightedAudiencePick(TARGET_AUDIENCES, audienceWeights);
      attempts++;
      const lastTopic = usedTopics.length > 0 ? usedTopics[0].toLowerCase() : '';
      if (!lastTopic.includes(targetAudience.toLowerCase()) || attempts > 5) break;
    } while (true);

    console.log(`  🔍 Finding Finance Bending topic for: ${targetAudience} (weight: ${audienceWeights[targetAudience] || DEFAULT_WEIGHT})...`);

    const prompt = `Today is ${new Date().toDateString()}.

You are generating content for a YouTube channel called "Finance Bending" — personal finance advice SPECIFICALLY BENT for a target audience: ${targetAudience}.

The format is NOT generic finance advice. It takes a finance concept and shows exactly how it applies to ${targetAudience}'s specific lifestyle, schedule, income patterns, and challenges.

GOOD examples:
- "Nurses: How to Invest $200/Month on a 3-Day Shift Schedule"
- "Why Introverts Are Actually Wired to Build Wealth Faster"
- "The Side Hustle That Works for Teachers Without Burning Out"
- "How Single Moms Pay Off Debt in 12 Months on One Salary"
- "Freelancers: The HYSA Trick That Makes Irregular Income Work"

Think about TRENDING finance topics RIGHT NOW:
- High-yield savings accounts, CD rates
- Debt payoff strategies (avalanche vs snowball)
- Side hustle income optimization
- Budgeting for irregular income
- Tax optimization for workers
- Emergency fund building
- Investing basics (ETFs, index funds)
- FIRE movement adapted for real constraints

Pick the MOST compelling and specific topic for ${targetAudience} right now.
Generate a ${mode === 'short' ? 'YouTube Short (45-55s)' : 'YouTube video (8-12 min)'} topic.

Respond ONLY in valid JSON (no markdown, no explanation):
{
  "targetAudience": "${targetAudience}",
  "trendingEvent": "the core finance concept being addressed (1 sentence)",
  "title": "punchy, specific title that calls out the target audience",
  "hook": "first 3 second hook — specific to ${targetAudience}'s pain point or win",
  "angle": "the finance bending angle — how this is uniquely applicable to ${targetAudience}",
  "context": "3-4 sentences of background on this finance topic with specific facts and numbers",
  "searchKeyword": "main keyword"
}`;

    try {
      const result = await withRetry(async (model) => {
        const response = await this.ai.models.generateContent({
          model,
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

      console.log(`  🎯 Audience: ${result.targetAudience}`);
      console.log(`  💡 Topic: ${result.title}`);
      return result;
    } catch (err) {
      console.warn('  ⚠️  TopicAgent fell back to seed idea:', err.message);

      const seeds = [
        { targetAudience: 'Nurses', title: 'Nurses: Build a $10k Emergency Fund in 6 Months on 3-Day Shifts', hook: 'You work 3 days, have 4 off — here is how nurses use that gap to build wealth.', context: 'Nurses have unique scheduling that creates powerful windows for saving and side income. A 3-day on, 4-day off schedule means 208 free days per year. With the right system, nurses can build a $10k emergency fund in under 6 months.' },
        { targetAudience: 'Teachers', title: 'Teachers: How to Retire 10 Years Early on a Teaching Salary', hook: 'Everyone says teachers cannot retire early. They are wrong.', context: 'Teachers have access to pension plans, summers off for side income, and strong job security — three assets most people overlook. With the right strategy, early retirement is more achievable for teachers than almost any other career.' },
        { targetAudience: 'Introverts', title: 'Introverts Build Wealth Faster — Here Is the Data', hook: 'Introverts are quietly winning at personal finance and nobody is talking about it.', context: 'Studies show introverts spend less on social activities, impulse purchases, and lifestyle inflation. Their natural tendency to research before buying and avoid peer pressure spending creates a powerful wealth-building advantage.' },
        { targetAudience: 'Freelancers', title: 'Freelancers: The Tax Strategy That Saves You $3k Every Year', hook: 'Every freelancer is overpaying taxes. Here is the fix.', context: 'Freelancers can legally deduct home office, equipment, software, health insurance, and retirement contributions. Most leave thousands on the table every year by not tracking these correctly.' },
        { targetAudience: 'Single Moms', title: 'Single Moms: 5 Money Moves That Actually Work on One Income', hook: 'You are doing the work of two people on one paycheck. These moves change the math.', context: 'Single mothers face unique financial pressure with one income supporting a household. But specific strategies around tax credits, childcare deductions, and automated saving can dramatically change the financial trajectory even on a tight budget.' },
        { targetAudience: 'Side Hustlers', title: 'Side Hustlers: Stop Losing 30% of Your Income to Taxes', hook: 'Your side hustle income is being eaten alive. Here is how to stop it.', context: 'Side hustle income is taxed as self-employment — meaning 15.3% SE tax on top of income tax. But quarterly estimated payments, home office deductions, and a SEP-IRA can cut that bill dramatically.' },
        { targetAudience: 'College Students', title: 'College Students: Start Investing With $50 and Crush Your Peers at 40', hook: 'The gap between starting at 20 vs 30 is worth $300,000. Not a typo.', context: 'Compound interest makes early investing wildly disproportionate. A college student investing $50/month starting at 20 will have significantly more at retirement than someone investing $500/month starting at 30.' },
      ];
      const pick = seeds[Math.floor(Math.random() * seeds.length)];
      return { ...pick, angle: 'Finance bending for real people', searchKeyword: 'personal finance', trendingEvent: pick.hook };
    }
  }
}