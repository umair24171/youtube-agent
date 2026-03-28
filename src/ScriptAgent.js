// ScriptAgent.js — Writes VIRAL scripts about TRENDING AI topics
import { GoogleGenAI } from '@google/genai';

const CHANNEL_VOICE = `
You are writing scripts for a YouTube Shorts channel covering AI/tech news from a developer's perspective.

CHANNEL STYLE:
- Raw, fast, zero fluff — like a dev reacting to breaking news
- No "Hey guys welcome back" — ever
- Gets to the point in the first 2 seconds
- Casual language: "bro", "nobody's talking about this", "this is insane"
- Ends with a hot take or opinion, never a generic "like and subscribe"
`;

// ── Hook formula bank (from proven viral patterns) ────────────────────────────
const HOOK_FORMULAS = `
HOOK FORMULAS — pick the one that fits the topic best:

CURIOSITY HOOKS (make them wonder what happens next):
- "I was wrong about [belief] — and it cost me [consequence]."
- "The real reason [X] is happening isn't what anyone is telling you."
- "[Company] just did something and nobody noticed."
- "This changes everything about [topic] — and it dropped yesterday."

CONTRARIAN HOOKS (disagree with popular opinion):
- "Unpopular opinion: [bold statement about the trend]"
- "Everyone is wrong about [AI topic]. Here's the truth."
- "Stop using [popular tool]. This is better and free."
- "[Common belief] is dead. I have proof."

STORY HOOKS (create immediate tension):
- "Yesterday [X happened] and I haven't stopped thinking about it."
- "I tested [new AI tool] for 48 hours. Here's what they don't show you."
- "[Company] just [action] and developers are furious."

VALUE HOOKS (promise immediate payoff):
- "How to [desirable outcome] using [new AI thing] — in under 5 minutes."
- "[Number] things [new AI release] can do that GPT-4 still can't."
- "This one [AI tool/feature] will save you [X hours] every week."

SHOCK HOOKS (pure pattern interrupt):
- "[Big company] just got destroyed by a [small thing] nobody saw coming."
- "A [small team/solo dev] just [did something] that [big company] spent years on."
- "[New AI] just passed [benchmark] that experts said was 5 years away."
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

    const formatInstructions = isRecap
      ? `
FORMAT: Weekly AI News Recap (3-5 min)
- Hook: shocking one-liner about the biggest story of the week
- Cover 3-5 biggest AI events with brief dev commentary on each
- End with: one strong hot take on where AI is heading
`
      : isShort
      ? `
FORMAT: YouTube Short (35-45 seconds MAX)
CRITICAL: voiceoverText MUST be under 65 words. Count them. No exceptions.

STRUCTURE:
- Line 1 (0-3s): HOOK — use one of the hook formulas. Make it impossible to scroll past.
- Lines 2-4 (3-35s): What happened, why devs care, one key fact or number. Ruthlessly brief.
- Last line: Hot take — strong opinion, no "like and subscribe"

TONE: Like a dev texting their friend about breaking news. Raw, fast, zero polish.
`
      : `
FORMAT: Long-form video (8-12 minutes)
- Hook (0-30s): Shocking statement about the trend — with a specific number or fact
- Context (30s-2min): What happened, who's involved, timeline
- Dev implications (2-7min): What this means for developers building right now
- Hot take (7-9min): Strong opinion — is this good or bad for the ecosystem?
- CTA (last 30s): "Follow for AI news from a dev who actually ships"
`;

    const prompt = `${CHANNEL_VOICE}

TRENDING TOPIC: ${topic.title}
TRENDING EVENT: ${topic.trendingEvent || topic.context}
HOOK IDEA: ${topic.hook}
CONTEXT: ${topic.context}
ANGLE: ${topic.angle}

${HOOK_FORMULAS}

${formatInstructions}

RULES:
1. The hook must stop someone mid-scroll. Use the formulas above — do not write a boring opener.
2. Every sentence must earn its place. If it doesn't add info or tension, cut it.
3. Never start with "In today's video", "Hey everyone", or any greeting.
4. Use specific numbers and facts when possible — vague claims don't go viral.
5. The topic is the trending event — not about the host's background.

Respond ONLY in valid JSON (no markdown, no backticks):
{
  "title": "YouTube title — punchy, SEO, under 65 chars, includes main keyword",
  "voiceoverText": "complete script — natural speech, under 65 words for shorts",
  "description": "YouTube description about the topic, max 400 chars, includes keywords",
  "tags": ["ai","tag2","tag3","tag4","tag5","tag6","tag7","tag8"],
  "linkedInCaption": "LinkedIn hot take on this trend — 3 punchy paragraphs, ends with [VIDEO_URL]",
  "visualNotes": "2-3 words describing best visuals (e.g. robot screen dark, code terminal)"
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
          if (wordCount > 80) {
            throw new Error(`Script too long: ${wordCount} words (max 65) — regenerating`);
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