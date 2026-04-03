// ScriptAgent.js — Writes VIRAL finance bending scripts for specific target audiences
// v2 — Retention-optimized: fixes 11s drop-off, targets 70%+ APV for Shorts push
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

// ── Retention rules — fixes the 11s drop-off ────────────────────────────────
const RETENTION_RULES = `
RETENTION RULES — these are NON-NEGOTIABLE for Shorts (target APV: 70%+):

THE 11-SECOND DROP-OFF PROBLEM:
Analytics show viewers are staying for the hook (0–3s) but swiping away around second 10–11.
This means the middle of the script feels slow, generic, or wordy. Fix it like this:

RULE 1 — STACCATO MIDDLE SENTENCES:
The "meat" (seconds 3–30) must be punchy, single-idea sentences. No compound sentences.
❌ BAD:  "As a freelancer, you can deduct your home office expenses and your education costs."
✅ GOOD: "Write off your WiFi. Write off your laptop. Write off your coffee shop tab."

Every sentence in the middle must be 5 words or fewer OR a standalone money fact.
Think: text message, not paragraph. Punch, pause, punch.

RULE 2 — VISUAL CUE MARKERS:
Every 3 seconds of voiceover needs a [VISUAL CUE] tag. These tell the editor/publisher
exactly when to cut or change the background so the viewer's brain resets at second 10.

Format: [VISUAL CUE: describe the exact visual change in 3 words]

Examples:
- [VISUAL CUE: new background color]
- [VISUAL CUE: zoom in text]
- [VISUAL CUE: dollar amount slams in]
- [VISUAL CUE: emoji explosion]
- [VISUAL CUE: cut to new angle]

Place a [VISUAL CUE] tag after every 2–3 lines of voiceover.

RULE 3 — THE SECOND-10 RESET:
Around the 10-second mark, you MUST have one of these pattern interrupts:
- A shocking number slammed in with no setup ("$4,200. Gone. Every year.")
- A direct question to the viewer ("Are you doing this?")
- A bold single-word or two-word statement ("Stop. Listen.")
- A complete tone shift (go from calm to urgent, or vice versa)

RULE 4 — NO FILLER ANYWHERE:
Cut every word that doesn't add a number, a name, or a tension. Ruthless.
❌ "And that's actually really important because..."
✅ [delete it entirely]

RULE 5 — END WITH A TRUTH, NOT A REQUEST:
The last line must be a bold, opinionated money statement specific to the audience.
❌ "Follow for more tips!"
✅ "Most [audience] will ignore this. The ones who don't? They retire early."
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
- Line 1 (0-3s): HOOK — call out the specific audience, use one of the hook formulas.
  Impossible to scroll past. Must end with a specific number or shocking claim.

- [VISUAL CUE: opening background]

- Lines 2-3 (3-10s): First finance fact — SHORT sentences, 5 words max each.
  One idea per line. No conjunctions connecting two facts.

- [VISUAL CUE: zoom or color shift]  ← THIS IS THE SECOND-10 RESET. REQUIRED.

- THE SECOND-10 RESET (exactly at second 10): One of these pattern interrupts:
  → Shocking number with no setup: "$4,200. Gone. Every year."
  → Direct question: "Are you doing this?"
  → Bold statement: "Stop. Listen."

- [VISUAL CUE: dollar amount or key stat slams in]

- Lines 4-6 (10-35s): The tactic broken into staccato sentences.
  Each line = one action or one number. No filler. No transitions.

- [VISUAL CUE: final visual before outro]

- Last line (35-45s): Bold financial truth specific to this audience.
  NOT a request. NOT "like and subscribe." A statement they'll screenshot.

TONE: Like a finance-savvy friend sending you a voice memo. Direct. Punchy. Zero fluff.

REMEMBER THE RETENTION RULES — apply all 5 without exception.
`
      : `
FORMAT: Long-form video (8-12 minutes)
- Hook (0-30s): Call out the target audience + their specific pain point — with a real number
- Context (30s-2min): The finance concept, why it matters, who it's helped
- The Bend (2-7min): How this finance principle applies SPECIFICALLY to ${audience}'s life
  Use staccato sentences throughout the middle — same rule as Shorts, just more of them.
  Insert [VISUAL CUE] tags every 30 seconds to guide editing.
- Real numbers (7-9min): Actual math showing what's possible — conservative, realistic projections
- CTA (last 30s): "Follow for finance tactics built around YOUR life"

Apply the RETENTION RULES to every section, especially The Bend.
`;

    const prompt = `${CHANNEL_VOICE}

TARGET AUDIENCE: ${audience}
TOPIC: ${topic.title}
FINANCE CONCEPT: ${topic.trendingEvent || topic.context}
HOOK IDEA: ${topic.hook}
CONTEXT: ${topic.context}
ANGLE: ${topic.angle}

${HOOK_FORMULAS}

${RETENTION_RULES}

${formatInstructions}

FINAL RULES:
1. Speak directly to ${audience} — use their specific context, not generic finance advice.
2. Every sentence must earn its place. If it doesn't add info or tension, cut it.
3. Never start with "In today's video", "Hey everyone", or any greeting.
4. Use specific numbers and realistic scenarios — vague claims don't go viral.
5. The content is about ${audience}'s money journey, not about the host.
6. Include ALL [VISUAL CUE] tags in the voiceoverText — they are part of the output.
7. The second-10 pattern interrupt is MANDATORY in every Short.

Respond ONLY in valid JSON (no markdown, no backticks):
{
  "title": "YouTube title — calls out audience, punchy, SEO, under 65 chars",
  "voiceoverText": "complete script with [VISUAL CUE] tags inline — under 55 words of actual speech for Shorts",
  "wordCount": "exact word count of voiceoverText excluding [VISUAL CUE] tags",
  "retentionNotes": "1-sentence summary of where the second-10 reset appears and what pattern interrupt was used",
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

        // Enforce word count for Shorts — exclude [VISUAL CUE] tags from count
        if (isShort) {
          const cleanText = parsed.voiceoverText.replace(/\[VISUAL CUE:[^\]]*\]/g, '').trim();
          const wordCount = cleanText.split(/\s+/).length;
          if (wordCount > 55) {
            throw new Error(`Script too long: ${wordCount} words (max 55) — regenerating`);
          }
          // Warn if no visual cues present
          const cueTags = (parsed.voiceoverText.match(/\[VISUAL CUE:/g) || []).length;
          if (cueTags < 3) {
            throw new Error(`Not enough [VISUAL CUE] tags: found ${cueTags}, need at least 3 — regenerating`);
          }
          // Warn if no second-10 reset detected
          if (!parsed.retentionNotes || parsed.retentionNotes.length < 20) {
            throw new Error('Missing retentionNotes — second-10 reset not confirmed — regenerating');
          }
        }

        return { ...parsed, wordCount: parsed.wordCount || 'N/A' };
      } catch (parseErr) {
        throw new Error(`Script parse failed: ${parseErr.message}\nRaw: ${text.substring(0, 200)}`);
      }
    });

    return script;
  }
}