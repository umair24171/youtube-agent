// youtube_index.js — Main Pipeline Entry
// Runs automatically via GitHub Actions | Manual: npm run short/longform/recap
import 'dotenv/config';
import { TopicAgent }      from './TopicAgent.js';
import { ScriptAgent }     from './ScriptAgent.js';
import { VoiceAgent }      from './VoiceAgent.js';
import { VideoAgent }      from './VideoAgent.js';
import { ThumbnailAgent }  from './ThumbnailAgent.js';
import { UploadAgent }     from './UploadAgent.js';
import { CrossPostAgent }  from './CrossPostAgent.js';
import { DiscordNotifier } from './DiscordNotifier.js';

const MODE     = process.env.MODE      || 'short';   // short | longform | recap
const DRY_RUN  = process.env.DRY_RUN   === 'true';   // skip upload if testing

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runPipeline() {
  const notifier = new DiscordNotifier(process.env.DISCORD_WEBHOOK_YOUTUBE);

  console.log('╔══════════════════════════════════════╗');
  console.log(`║  YouTube Pipeline  |  MODE: ${MODE.padEnd(9)}║`);
  console.log(`║  DRY RUN: ${String(DRY_RUN).padEnd(27)}║`);
  console.log('╚══════════════════════════════════════╝');

  await notifier.send(`🎬 **YouTube Pipeline Started**\nMode: \`${MODE}\` | Dry Run: \`${DRY_RUN}\``);

  try {
    // ── STEP 1: Get Topic ───────────────────────────────────────────
    console.log('\n[1/7] Finding topic...');
    const topicAgent = new TopicAgent();
    const topic = await topicAgent.getTopic(MODE);
    console.log(`  ✅ Topic: ${topic.title}`);

    // ── STEP 2: Generate Script ─────────────────────────────────────
    console.log('\n[2/7] Writing script...');
    const scriptAgent = new ScriptAgent();
    const script = await scriptAgent.generate(topic, MODE);
    console.log(`  ✅ Title: ${script.title}`);
    console.log(`  ✅ Script length: ${script.voiceoverText.length} chars`);

    // ── STEP 3: Voiceover ───────────────────────────────────────────
    console.log('\n[3/7] Generating voiceover...');
    const voiceAgent = new VoiceAgent();
    const audioPath = await voiceAgent.generate(script.voiceoverText);
    console.log(`  ✅ Audio: ${audioPath}`);

    // ── STEP 4: Assemble Video ──────────────────────────────────────
    console.log('\n[4/7] Assembling video...');
    const videoAgent = new VideoAgent();
    const videoPath = await videoAgent.assemble(audioPath, script, MODE);
    console.log(`  ✅ Video: ${videoPath}`);

    // ── STEP 5: Thumbnail ───────────────────────────────────────────
    console.log('\n[5/7] Generating thumbnail...');
    const thumbnailAgent = new ThumbnailAgent();
    const thumbnailPath = await thumbnailAgent.generate(script.title, topic.hook);
    console.log(`  ✅ Thumbnail: ${thumbnailPath}`);

    // ── STEP 6: Upload ──────────────────────────────────────────────
    let videoUrl = 'https://youtube.com/dry-run';

    if (!DRY_RUN) {
      console.log('\n[6/7] Uploading to YouTube...');
      const uploadAgent = new UploadAgent();
      videoUrl = await uploadAgent.upload({
        videoPath,
        thumbnailPath,
        title:       script.title,
        description: script.description,
        tags:        script.tags,
        mode:        MODE,
      });
      console.log(`  ✅ Live: ${videoUrl}`);
    } else {
      console.log('\n[6/7] SKIPPED (dry run)');
    }

    // ── STEP 7: Cross Post ──────────────────────────────────────────
    if (!DRY_RUN) {
      console.log('\n[7/7] Cross-posting...');
      const crossPost = new CrossPostAgent();
      await crossPost.post(script.title, videoUrl, script.linkedInCaption);
      console.log('  ✅ Posted to LinkedIn');
    } else {
      console.log('\n[7/7] SKIPPED (dry run)');
    }

    // ── DONE ────────────────────────────────────────────────────────
    await notifier.send(
      `✅ **Video Published!**\n` +
      `📹 ${script.title}\n` +
      `🔗 ${videoUrl}\n` +
      `📊 Mode: \`${MODE}\``
    );

    console.log('\n✅ Pipeline complete!\n');

  } catch (err) {
    console.error('\n❌ Pipeline failed:', err.message);
    await notifier.send(`❌ **Pipeline Failed** (${MODE})\n\`\`\`${err.message}\`\`\``);
    process.exit(1);
  }
}

runPipeline();
