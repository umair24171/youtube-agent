import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';

export class VoiceAgent {
  constructor() {
    this.client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  }

  /**
   * Strips [VISUAL CUE: ...] tags from voiceover text before sending to TTS.
   * Returns the clean string so callers can also use it independently.
   */
  cleanForTTS(text) {
    return text.replace(/\[VISUAL CUE:[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Extracts all [VISUAL CUE] tags in order with their position index in the clean script.
   * Useful for the VideoAgent to know exactly when to trigger each visual change.
   * Returns: [{ cue: "red background", wordIndex: 12 }, ...]
   */
  extractVisualCues(text) {
    const cues = [];
    const cueRegex = /\[VISUAL CUE:\s*([^\]]+)\]/g;
    let match;
    let cleanUpTo = 0;
    let wordIndex = 0;

    while ((match = cueRegex.exec(text)) !== null) {
      const before = text.slice(cleanUpTo, match.index);
      wordIndex += before.trim().split(/\s+/).filter(Boolean).length;
      cues.push({ cue: match[1].trim(), wordIndex });
      cleanUpTo = match.index + match[0].length;
    }

    return cues;
  }

  /**
   * Main generate method.
   * @param {string} rawText - Full voiceoverText from ScriptAgent (may contain [VISUAL CUE] tags)
   * @returns {{ audioPath: string, ttsText: string, visualCues: Array }}
   *   - audioPath   → path to the .mp3 file (pass to VideoAgent)
   *   - ttsText     → clean text (no tags) — what was actually spoken
   *   - visualCues  → ordered list of cues with word positions (pass to VideoAgent)
   */
  async generate(rawText) {
    const ttsText   = this.cleanForTTS(rawText);
    const visualCues = this.extractVisualCues(rawText);

    console.log(`  🎙️  TTS input (${ttsText.split(/\s+/).length} words):`, ttsText.slice(0, 80) + '...');
    console.log(`  🎬  Visual cues extracted: ${visualCues.length}`);
    visualCues.forEach((v, i) => console.log(`       ${i + 1}. [~word ${v.wordIndex}] ${v.cue}`));

    const outputPath = `/tmp/voiceover_${Date.now()}.mp3`;
    let wordTimestamps = null;

    try {
      // Use timestamps endpoint — returns audio + exact per-character timing for caption sync
      const result = await this.client.textToSpeech.convertWithTimestamps(this.voiceId, {
        text: ttsText,
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
      });

      fs.writeFileSync(outputPath, Buffer.from(result.audioBase64, 'base64'));

      if (result.alignment) {
        wordTimestamps = this._buildWordTimestamps(result.alignment);
        console.log(`  ⏱️  Word timestamps: ${wordTimestamps.length} words synced`);
      }
    } catch (err) {
      // Fallback: stream without timestamps (captions use uniform timing)
      console.warn(`  ⚠️  Timestamps API failed (${err.message.slice(0, 60)}), falling back to stream`);
      const audio = await this.client.textToSpeech.convert(this.voiceId, {
        text: ttsText,
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
      });
      const chunks = [];
      for await (const chunk of audio) chunks.push(chunk);
      fs.writeFileSync(outputPath, Buffer.concat(chunks));
    }

    console.log(`  ✅  Audio saved: ${outputPath}`);

    return {
      audioPath: outputPath,
      ttsText,          // clean spoken text
      visualCues,       // [{ cue, wordIndex }] — for VideoAgent timing
      wordTimestamps,   // [{ text, start, end }] in seconds — null if unavailable
    };
  }

  /**
   * Converts ElevenLabs character-level alignment into word-level timestamps.
   * @param {object} alignment - { characters, characterStartTimesSeconds, characterEndTimesSeconds }
   * @returns {Array<{ text: string, start: number, end: number }>}
   */
  _buildWordTimestamps(alignment) {
    const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = alignment;

    const words = [];
    let wordText = '';
    let wordStart = null;
    let wordEnd   = null;

    for (let i = 0; i < characters.length; i++) {
      const ch = characters[i];
      if (ch === ' ' || ch === '\n' || ch === '\t') {
        if (wordText.trim()) {
          words.push({ raw: wordText.trim(), start: wordStart, end: wordEnd });
          wordText = '';
          wordStart = null;
        }
      } else {
        if (wordStart === null) wordStart = characterStartTimesSeconds[i];
        wordEnd   = characterEndTimesSeconds[i];
        wordText += ch;
      }
    }
    if (wordText.trim()) {
      words.push({ raw: wordText.trim(), start: wordStart, end: wordEnd });
    }

    return words
      .map(w => ({
        text: w.raw.toUpperCase().replace(/'/g, '').replace(/[^A-Z0-9.,!?]/g, '').trim(),
        start: w.start,
        end:   w.end,
      }))
      .filter(w => w.text);
  }
}