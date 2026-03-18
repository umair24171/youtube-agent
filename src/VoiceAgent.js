import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';

export class VoiceAgent {
  constructor() {
    this.client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  }

  async generate(text) {
    const audio = await this.client.textToSpeech.convert(this.voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });

    const outputPath = `/tmp/voiceover_${Date.now()}.mp3`;
    // audio is a readable stream — pipe to file
    const chunks = [];
    for await (const chunk of audio) chunks.push(chunk);
    fs.writeFileSync(outputPath, Buffer.concat(chunks));
    return outputPath;
  }
}