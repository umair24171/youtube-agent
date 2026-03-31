// ScriptAgent.js — Writes VIRAL finance bending scripts for specific target audiences
import { GoogleGenAI } from '@google/genai';

const CHANNEL_VOICE = `
You are writing scripts for a YouTube channel called "Finance Bending" — personal finance advice SPECIFICALLY BENT for target audiences like Nurses, Teachers, Introverts, Freelancers, Single Moms, and others.

CHANNEL STYLE:
- Speaks directly to ONE specific group — their lifestyle, schedule, and challenges
- No "Hey guys welcome back" — ever
- Opens with the pain point or win specific to that audience
- Casual but credible: "Here's the thing nobody tells nurses about investing..."
- Uses real numbers, real scenarios, real tactics
- Ends with a bold financial truth or call-to-action, never a generic "like and subscribe"
`;

// ── Hook formula bank (finance-specific viral patterns) ──────────────────────
const HOOK_FORMULAS = `
HOOK FORMULAS — pick the one that fits the topic best:

AUDIENCE-SPECIFIC HOOKS (call out the viewer directly):
- "If you're a [audience], you're probably making this money mistake."
- "Nobody tells [audience] about this — and it's costing you [amount]."
- "[Audience] have one financial advantage most people ignore completely."
- "Why [audience] are quietly building more wealth than almost anyone else."

CONTRARIAN HOOKS (flip the conventional wisdom):
- "Unpopular opinion: [audience] are actually in a better financial position than they think."
- "Everyone says [audience] can't [financial goal]. The data says otherwise."
- "Stop [common bad advice]. Here's what actually works for [audience]."
- "The [finance concept] advice online is wrong — especially if you're [audience]."

STORY HOOKS (create immediate tension):
- "I broke down the math for [audience] and the results were shocking."
- "A [audience member] paid off $30k in 18 months. Here's the exact system."
- "[Common scenario for audience]. Here's what to do instead."

VALUE HOOKS (promise immediate, specific payoff):
- "How [audience] can save $[amount] this month without changing their lifestyle."
- "[Number] money moves every [audience] should make before [timeframe]."
- "The [finance tactic] that saved one [audience member] $[amount] in [timeframe]."

SHOCK HOOKS (pure pattern interrupt):
- "[Audience]'s [unique schedule/trait] is actually a wealth-building superpower."
- "The reason [audience] stay broke isn't income — it's [specific overlooked reason]."
- "[Audience] have access to [financial tool/benefit] most people don't even know exists."
`;

// Retry wrapper
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
    const isShort  = mode === 'short';
    const isRecap  = topic.isRecap === true;
    const audience = topic.targetAudience || 'General Audience';

    const formatInstructions = isRecap
      ? `
FORMAT: Weekly Finance Bending Recap (3-5 min)
- Hook: one-liner about the biggest money move of the week
- Cover 3-5 best finance hacks or tips from the week, each with a specific number or result
- End with: one strong money truth the audience needs to hear
`
      : isShort
      ? `
FORMAT: YouTube Short (35-45 seconds MAX)
CRITICAL: voiceoverText MUST be under 55 words. Count them. No exceptions.

STRUCTURE:
- Line 1 (0-3s): HOOK — call out the specific audience, use one of the hook formulas. Impossible to scroll past.
- Lines 2-4 (3-35s): The finance tactic, why it works for this specific audience, one key number or result. Ruthlessly brief.
- Last line: Bold financial truth — specific, opinionated, no "like and subscribe"

TONE: Like a finance-savvy friend texting you a money tip. Direct, specific, zero fluff.
`
      : `
FORMAT: Long-form video (8-12 minutes)
- Hook (0-30s): Call out the target audience + their specific pain point — with a real number
- Context (30s-2min): The finance concept, why it matters, who it's helped
- The Bend (2-7min): How this finance principle applies SPECIFICALLY to ${audience}'s life — schedule, income patterns, unique advantages
- Real numbers (7-9min): Actual math showing what's possible — conservative, realistic projections
- CTA (last 30s): "Follow for finance tactics built around YOUR life"
`;

    const prompt = `${CHANNEL_VOICE}

TARGET AUDIENCE: ${audience}
TOPIC: ${topic.title}
FINANCE CONCEPT: ${topic.trendingEvent || topic.context}
HOOK IDEA: ${topic.hook}
CONTEXT: ${topic.context}
ANGLE: ${topic.angle}

${HOOK_FORMULAS}

${formatInstructions}

RULES:
1. Speak directly to ${audience} — use their specific context, not generic finance advice.
2. Every sentence must earn its place. If it doesn't add info or tension, cut it.
3. Never start with "In today's video", "Hey everyone", or any greeting.
4. Use specific numbers and realistic scenarios — vague claims don't go viral.
5. The content is about ${audience}'s money journey, not about the host.

Respond ONLY in valid JSON (no markdown, no backticks):
{
  "title": "YouTube title — calls out audience, punchy, SEO, under 65 chars",
  "voiceoverText": "complete script — natural speech, under 65 words for shorts",
  "description": "YouTube description about the finance topic, max 400 chars, includes keywords",
  "tags": ["personal finance","money","finance tips","wealth building","budgeting","saving money","financial freedom","money hacks"],
  "linkedInCaption": "LinkedIn finance insight for ${audience} — 3 punchy paragraphs, ends with [VIDEO_URL]",
  "visualNotes": "2-3 words describing best visuals (e.g. money wealth dark, luxury lifestyle finance)"
}`;

    const script = await withRetry(async () => {
      const response = await this.ai.models.generateContent({
        model  : 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text.trim().replace(/```json|```/g, '').trim();

      try {
        const parsed = JSON.parse(text);
        if (!parsed.voiceoverText || !parsed.title) {
          throw new Error('Missing required fields in script response');
        }

        // Enforce word count for Shorts
        if (isShort) {
          const wordCount = parsed.voiceoverText.split(/\s+/).length;
          if (wordCount > 55) {
            throw new Error(`Script too long: ${wordCount} words (max 55) — regenerating`);
          }
        }

        return parsed;
      } catch (parseErr) {
        throw new Error(`Script parse failed: ${parseErr.message}\nRaw: ${text.substring(0, 200)}`);
      }
    });

    return script;
  }
}
