// VideoAgent.js — Assembles final video using ffmpeg + Pexels stock footage
// Shorts: 9:16 vertical (1080x1920) | Long-form: 16:9 (1920x1080)
import { execSync, execFileSync } from 'child_process';
import fetch        from 'node-fetch';
import fs           from 'fs';

const VISUAL_QUERIES = {
  default:    'abstract dark technology background',
  trading:    'stock market charts finance dark',
  code:       'abstract dark blue technology background',
  ai:         'abstract neural network dark background',
  mobile:     'abstract dark app technology',
  saas:       'abstract dark dashboard technology',
  automation: 'abstract dark technology circuit',
  server:     'abstract data center dark background',
  flutter:    'abstract dark mobile app development',
  firebase:   'abstract dark cloud database technology',
};

// Font paths — bold variants first, TTF only (.ttc collections don't work with ffmpeg drawtext)
// We use execFileSync so spaces in paths are handled by ffmpeg's own parser (via single-quoted fontfile)
const FONT_PATHS = [
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',              // macOS bold (preferred)
  '/System/Library/Fonts/Supplemental/Arial.ttf',                   // macOS regular fallback
  '/Library/Fonts/Arial Bold.ttf',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',   // Linux bold
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
];

// Returns the raw font path — single-quoted in the filter string so spaces are safe
function resolveFont() {
  const found = FONT_PATHS.find(p => fs.existsSync(p));
  if (!found) throw new Error('No TTF font found. Install fonts-liberation or fonts-dejavu.');
  console.log(`  🔤 Using font: ${found}`);
  return found; // raw path — wrapped in single quotes inside ffmpeg filter (execFileSync, no shell)
}

export class VideoAgent {

  // ─────────────────────────────────────────────────────────────
  // Feature detection helpers
  // ─────────────────────────────────────────────────────────────

  // Check once at startup if drawtext filter is available
  checkDrawtext() {
    try {
      const filters = execSync('ffmpeg -filters 2>/dev/null', { stdio: 'pipe' }).toString();
      if (!filters.includes('drawtext')) {
        console.warn('  ⚠️  ffmpeg drawtext filter NOT available (libfreetype missing).');
        console.warn('  👉 Fix: brew reinstall ffmpeg   (macOS) or apt install ffmpeg (Linux)');
        return false;
      }
      return true;
    } catch { return false; }
  }

  checkZoompan() {
    try {
      const filters = execSync('ffmpeg -filters 2>/dev/null', { stdio: 'pipe' }).toString();
      return filters.includes('zoompan');
    } catch { return false; }
  }

  checkXfade() {
    try {
      const filters = execSync('ffmpeg -filters 2>/dev/null', { stdio: 'pipe' }).toString();
      return filters.includes('xfade');
    } catch { return false; }
  }

  // ─────────────────────────────────────────────────────────────
  // Background fetching
  // ─────────────────────────────────────────────────────────────

  async fetchBackground(visualNotes = '') {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) throw new Error('PEXELS_API_KEY not set');

    let query = VISUAL_QUERIES.default;
    const notes = visualNotes.toLowerCase();
    for (const [key, q] of Object.entries(VISUAL_QUERIES)) {
      if (notes.includes(key)) { query = q; break; }
    }

    console.log(`  🎥 Fetching background: "${query}"`);

    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );

    if (!res.ok) throw new Error(`Pexels API error: ${res.status}`);
    const data = await res.json();

    // Fallback to landscape if no portrait results
    let videos = data.videos || [];
    if (!videos.length) {
      const res2 = await fetch(
        `https://api.pexels.com/videos/search?query=dark+technology+abstract&per_page=10`,
        { headers: { Authorization: apiKey } }
      );
      const data2 = await res2.json();
      videos = data2.videos || [];
    }

    if (!videos.length) throw new Error('No Pexels videos found');

    // Randomize pick so same topic doesn't get same background each time
    const pick  = videos[Math.floor(Math.random() * Math.min(videos.length, 5))];
    const files = pick.video_files.filter(f => f.link && f.file_type === 'video/mp4');
    if (!files.length) throw new Error('No suitable video file found');

    const fileUrl = (files.find(f => f.quality === 'hd') || files[0]).link;
    const bgPath  = `/tmp/bg_${Date.now()}.mp4`;
    const dlRes   = await fetch(fileUrl);
    const buffer  = await dlRes.arrayBuffer();
    fs.writeFileSync(bgPath, Buffer.from(buffer));

    console.log(`  ✅ Background downloaded (${(fs.statSync(bgPath).size / 1024 / 1024).toFixed(1)} MB)`);
    return bgPath;
  }

  // Fetch count distinct Pexels clips in parallel — used for Shorts B-roll
  async fetchMultipleBackgrounds(visualNotes = '', count = 4) {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) throw new Error('PEXELS_API_KEY not set');

    let query = VISUAL_QUERIES.default;
    const notes = visualNotes.toLowerCase();
    for (const [key, q] of Object.entries(VISUAL_QUERIES)) {
      if (notes.includes(key)) { query = q; break; }
    }

    console.log(`  🎥 Fetching ${count} B-roll clips: "${query}"`);

    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) throw new Error(`Pexels API error: ${res.status}`);
    const data = await res.json();

    let videos = data.videos || [];

    // Supplement with generic fallback if not enough variety
    if (videos.length < count) {
      const res2 = await fetch(
        `https://api.pexels.com/videos/search?query=dark+technology+abstract&per_page=15`,
        { headers: { Authorization: apiKey } }
      );
      const data2 = await res2.json();
      videos = [...videos, ...(data2.videos || [])];
    }

    if (!videos.length) throw new Error('No Pexels videos found');

    // Shuffle pool and pick `count` distinct videos
    const pool     = videos.slice(0, Math.min(videos.length, 15));
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    const ts = Date.now();
    const downloadPaths = await Promise.all(selected.map(async (pick, i) => {
      const files = pick.video_files.filter(f => f.link && f.file_type === 'video/mp4');
      if (!files.length) return null;
      const fileUrl = (files.find(f => f.quality === 'hd') || files[0]).link;
      const bgPath  = `/tmp/bg_${ts}_${i}.mp4`;
      const dlRes   = await fetch(fileUrl);
      const buffer  = await dlRes.arrayBuffer();
      fs.writeFileSync(bgPath, Buffer.from(buffer));
      return bgPath;
    }));

    let paths = downloadPaths.filter(Boolean);
    if (!paths.length) throw new Error('No B-roll clips downloaded');

    // Pad by repeating first clip if we got fewer than requested
    while (paths.length < count) paths.push(paths[0]);

    console.log(`  ✅ B-roll downloaded: ${paths.length} clips`);
    return paths.slice(0, count);
  }

  // ─────────────────────────────────────────────────────────────
  // Audio utilities
  // ─────────────────────────────────────────────────────────────

  getAudioDuration(audioPath) {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
    ).toString().trim();
    return parseFloat(output);
  }

  // ─────────────────────────────────────────────────────────────
  // Caption builders
  // ─────────────────────────────────────────────────────────────

  // Original 3-word chunk captions — kept for longform and Tier 4 fallback
  buildCaptions(voiceoverText, duration) {
    const words = voiceoverText.replace(/[^\w\s',.!?]/g, '').split(/\s+/).filter(Boolean);
    const chunks = [];
    const wordsPerChunk = 3;
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    const chunkDuration = duration / chunks.length;
    return chunks.map((text, i) => ({
      text: text.toUpperCase(),
      start: i * chunkDuration,
      end: (i + 1) * chunkDuration,
    }));
  }

  // Word-by-word captions with proportional timing — used for Shorts
  buildWordCaptions(voiceoverText, duration) {
    const words = voiceoverText
      .replace(/[^\w\s',.!?]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return [];
    const wordDuration = duration / words.length;
    return words.map((word, i) => ({
      text: word.toUpperCase().replace(/'/g, '').replace(/[^A-Z0-9 .,!?]/g, '').trim(),
      start: i * wordDuration,
      end:   (i + 1) * wordDuration,
    }));
  }

  // Returns array of drawtext filter strings for word-level captions (Shorts)
  buildWordCaptionFilters(words, fontFile, fontSize = 68) {
    return words.map(w => {
      if (!w.text) return null;
      const s = w.start.toFixed(2);
      const e = w.end.toFixed(2);
      // Yellow pop-on word, bold box, centered horizontally, 70% down the frame
      return (
        `drawtext=text='${w.text}':fontsize=${fontSize}:fontcolor=#FFD700:` +
        `borderw=5:bordercolor=black:` +
        `box=1:boxcolor=black@0.55:boxborderw=12:` +
        `x=(w-text_w)/2:y=h*0.70:` +
        `fontfile='${fontFile}':fix_bounds=1:` +
        `enable='between(t\\,${s}\\,${e})'`
      );
    }).filter(Boolean);
  }

  // ─────────────────────────────────────────────────────────────
  // Ken Burns — returns a zoompan filter string for a given clip slot
  // ─────────────────────────────────────────────────────────────

  _buildKenBurnsFilter(clipIndex, segFrames) {
    const presets = [
      // 0: Slow zoom-in, center anchor
      { z: `min(zoom+0.0005,1.1)`, x: `iw/2-(iw/zoom/2)`, y: `ih/2-(ih/zoom/2)` },
      // 1: Slow zoom-in, top-left anchor
      { z: `min(zoom+0.0005,1.1)`, x: `0`,                 y: `0`                },
      // 2: Slow zoom-in, bottom-right anchor
      { z: `min(zoom+0.0005,1.1)`, x: `iw-iw/zoom`,        y: `ih-ih/zoom`       },
      // 3: Slow pan right at fixed zoom (px = previous frame x, increments 0.3px/frame)
      { z: `1.05`,                 x: `min(px+0.3,iw-iw/zoom)`, y: `ih/2-(ih/zoom/2)` },
    ];
    const p = presets[clipIndex % presets.length];
    return `zoompan=z='${p.z}':x='${p.x}':y='${p.y}':d=${segFrames}:s=1080x1920:fps=25`;
  }

  // ─────────────────────────────────────────────────────────────
  // filter_complex builders for Shorts (3 tiers)
  // Each builds a semicolon-delimited string for -filter_complex
  // ─────────────────────────────────────────────────────────────

  // Tier 1: Ken Burns (zoompan) + xfade crossfades + word captions + watermark
  _buildFullShortFilterComplex({ clipCount, segDur, segFrames, transDur, fps, wordCapFilters, buildznWatermark, duration }) {
    const chains = [];

    // Stage 1: per-clip — reset PTS → portrait crop → scale → darken → lock fps → Ken Burns
    // setpts=PTS-STARTPTS normalises stream_loop timestamps so zoompan/xfade don't see non-zero PTS
    for (let i = 0; i < clipCount; i++) {
      const kb = this._buildKenBurnsFilter(i, segFrames);
      chains.push(
        `[${i}:v]` +
        `setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,` +
        `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5,` +
        `fps=${fps},${kb}` +
        `[c${i}]`
      );
    }

    // Stage 2: xfade chain  [c0][c1]→[v01]  [v01][c2]→[v012]  ...→[vbase]
    let prevLabel = 'c0';
    for (let i = 1; i < clipCount; i++) {
      const offset   = (i * (segDur - transDur)).toFixed(2);
      const outLabel = i < clipCount - 1 ? `v0${i + 1}` : 'vbase';
      chains.push(`[${prevLabel}][c${i}]xfade=transition=fade:duration=${transDur}:offset=${offset}[${outLabel}]`);
      prevLabel = outLabel;
    }

    return this._appendCaptionStages({ chains, wordCapFilters, buildznWatermark, duration });
  }

  // Tier 2: xfade crossfades + word captions + watermark (no Ken Burns / zoompan)
  _buildXfadeShortFilterComplex({ clipCount, segDur, transDur, fps, wordCapFilters, buildznWatermark, duration }) {
    const chains = [];

    // Stage 1: per-clip — reset PTS → portrait crop → scale → darken → lock fps
    for (let i = 0; i < clipCount; i++) {
      chains.push(
        `[${i}:v]` +
        `setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,` +
        `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5,` +
        `fps=${fps}` +
        `[c${i}]`
      );
    }

    // Stage 2: xfade chain
    let prevLabel = 'c0';
    for (let i = 1; i < clipCount; i++) {
      const offset   = (i * (segDur - transDur)).toFixed(2);
      const outLabel = i < clipCount - 1 ? `v0${i + 1}` : 'vbase';
      chains.push(`[${prevLabel}][c${i}]xfade=transition=fade:duration=${transDur}:offset=${offset}[${outLabel}]`);
      prevLabel = outLabel;
    }

    return this._appendCaptionStages({ chains, wordCapFilters, buildznWatermark, duration });
  }

  // Tier 3: concat hard cuts + word captions + watermark
  _buildConcatShortFilterComplex({ clipCount, fps, wordCapFilters, buildznWatermark, duration }) {
    const chains = [];

    // Stage 1: per-clip — reset PTS → portrait crop → scale → darken → lock fps
    for (let i = 0; i < clipCount; i++) {
      chains.push(
        `[${i}:v]` +
        `setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,` +
        `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5,` +
        `fps=${fps}` +
        `[c${i}]`
      );
    }

    // Stage 2: concat filter (hard cuts)
    const inputLabels = Array.from({ length: clipCount }, (_, i) => `[c${i}]`).join('');
    chains.push(`${inputLabels}concat=n=${clipCount}:v=1:a=0[vbase]`);

    return this._appendCaptionStages({ chains, wordCapFilters, buildznWatermark, duration });
  }

  // Shared stages 3-5: fade → word captions → BuildZn watermark → [vout]
  _appendCaptionStages({ chains, wordCapFilters, buildznWatermark, duration }) {
    const fadeIn  = `fade=t=in:st=0:d=0.5`;
    const fadeOut = `fade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

    // Stage 3: fade in/out on concatenated stream
    chains.push(`[vbase]${fadeIn},${fadeOut}[vfaded]`);

    // Stage 4: word captions
    if (wordCapFilters && wordCapFilters.length) {
      chains.push(`[vfaded]${wordCapFilters.join(',')}[vcapped]`);
    } else {
      chains.push(`[vfaded]null[vcapped]`);
    }

    // Stage 5: BuildZn watermark (bottom-right, semi-transparent)
    if (buildznWatermark) {
      chains.push(`[vcapped]${buildznWatermark}[vout]`);
    } else {
      chains.push(`[vcapped]null[vout]`);
    }

    return chains.join(';\n');
  }

  // ─────────────────────────────────────────────────────────────
  // Main assembly — signature unchanged: assemble(audioPath, script, mode)
  // ─────────────────────────────────────────────────────────────

  async assemble(audioPath, script, mode) {
    const isShort     = mode === 'short';
    const rawDuration = this.getAudioDuration(audioPath);
    const duration    = (isShort && rawDuration > 58) ? 58 : rawDuration;
    const output      = `/tmp/final_${Date.now()}.mp4`;
    const channelName = process.env.CHANNEL_HANDLE || '@DevUmair';

    console.log(`  🎬 Assembling ${isShort ? 'Short (9:16)' : 'Long-form (16:9)'} | Duration: ${duration.toFixed(1)}s`);

    const fontFile          = resolveFont();
    const drawtextAvailable = this.checkDrawtext();
    const afFull = `afade=t=in:st=0:d=0.5,afade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

    // ══════════════════════════════════════════════════════════
    // SHORTS PIPELINE — professional multi-clip assembly
    // ══════════════════════════════════════════════════════════
    if (isShort) {
      const CLIP_COUNT = 4;
      const TRANS_DUR  = 0.8;   // seconds per crossfade
      const FPS        = 25;

      // Each clip must cover segDur seconds so the output fills the full duration after overlaps:
      //   total = N*segDur - (N-1)*TRANS_DUR  →  segDur = (total + (N-1)*TRANS_DUR) / N
      const segDur    = (duration + (CLIP_COUNT - 1) * TRANS_DUR) / CLIP_COUNT;
      const segFrames = Math.ceil(segDur * FPS);

      let bgVideos;
      try {
        bgVideos = await this.fetchMultipleBackgrounds(script.visualNotes || '', CLIP_COUNT);
      } catch (err) {
        console.warn('  ⚠️  Multi-clip fetch failed, falling back to single clip:', err.message);
        bgVideos = [await this.fetchBackground(script.visualNotes || '')];
      }

      const wordCaps       = this.buildWordCaptions(script.voiceoverText || script.title, duration);
      const wordCapFilters = drawtextAvailable ? this.buildWordCaptionFilters(wordCaps, fontFile) : [];

      // BuildZn watermark: bottom-right, semi-transparent
      const buildznWatermark = drawtextAvailable
        ? `drawtext=text='BuildZn':fontsize=28:fontcolor=white@0.65:borderw=1:bordercolor=black@0.5:x=w-text_w-30:y=h-text_h-45:fontfile='${fontFile}'`
        : null;

      // Build looped input args: each clip trimmed to segDur+1.5s, then audio
      const inputArgs = [];
      bgVideos.forEach(clipPath => {
        inputArgs.push('-stream_loop', '-1', '-t', (segDur + 1.5).toFixed(2), '-i', clipPath);
      });
      inputArgs.push('-i', audioPath);
      const audioIdx = bgVideos.length;

      const zoompanAvailable = this.checkZoompan();
      const xfadeAvailable   = this.checkXfade();

      const multiClipArgs = (filterComplex) => [
        '-y', ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', `${audioIdx}:a`,
        '-t', duration.toFixed(2),
        '-af', afFull,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        output,
      ];

      let assembled = false;

      // ── Tier 1: Ken Burns (zoompan) + xfade crossfades + word captions + watermark ──
      if (!assembled && zoompanAvailable && xfadeAvailable && bgVideos.length === CLIP_COUNT) {
        try {
          const fc = this._buildFullShortFilterComplex({
            clipCount: bgVideos.length, segDur, segFrames, transDur: TRANS_DUR, fps: FPS,
            wordCapFilters, buildznWatermark, duration,
          });
          execFileSync('ffmpeg', multiClipArgs(fc), { stdio: 'pipe' });
          assembled = true;
          console.log('  ✨ Assembled with Ken Burns + crossfade + word captions');
        } catch (err) {
          console.warn('  ⚠️  Tier 1 (zoompan+xfade) failed:', (err.stderr?.toString() || err.message).slice(-200));
        }
      }

      // ── Tier 2: xfade crossfades + word captions + watermark (no Ken Burns) ──
      if (!assembled && xfadeAvailable && bgVideos.length === CLIP_COUNT) {
        try {
          const fc = this._buildXfadeShortFilterComplex({
            clipCount: bgVideos.length, segDur, transDur: TRANS_DUR, fps: FPS,
            wordCapFilters, buildznWatermark, duration,
          });
          execFileSync('ffmpeg', multiClipArgs(fc), { stdio: 'pipe' });
          assembled = true;
          console.log('  ✨ Assembled with crossfade + word captions (no Ken Burns)');
        } catch (err) {
          console.warn('  ⚠️  Tier 2 (xfade) failed:', err.message.slice(-100));
        }
      }

      // ── Tier 3: B-roll hard cuts + word captions + watermark ──
      if (!assembled && bgVideos.length >= 2) {
        try {
          const fc = this._buildConcatShortFilterComplex({
            clipCount: bgVideos.length, fps: FPS,
            wordCapFilters, buildznWatermark, duration,
          });
          execFileSync('ffmpeg', multiClipArgs(fc), { stdio: 'pipe' });
          assembled = true;
          console.log('  ✨ Assembled with B-roll cuts + word captions (no crossfade)');
        } catch (err) {
          console.warn('  ⚠️  Tier 3 (concat) failed:', err.message.slice(-100));
        }
      }

      // ── Tier 4: single clip, -vf — mirrors original behavior exactly ──
      if (!assembled) {
        console.warn('  Falling back to single-clip Short (Tier 4)');
        const simpleCaptions   = this.buildCaptions(script.voiceoverText || script.title, duration);
        const simpleCapFilters = drawtextAvailable ? simpleCaptions.map(cap => {
          const safe = cap.text.replace(/'/g, '').replace(/[^A-Z0-9 .,!?]/g, '').trim();
          if (!safe) return null;
          return `drawtext=text='${safe}':fontsize=58:fontcolor=white:borderw=4:bordercolor=black:box=1:boxcolor=black@0.4:boxborderw=8:x=(w-text_w)/2:y=h*0.72:fontfile='${fontFile}':fix_bounds=1:enable='between(t\\,${cap.start.toFixed(2)}\\,${cap.end.toFixed(2)})'`;
        }).filter(Boolean).join(',') : null;

        const fadeIn  = `fade=t=in:st=0:d=0.5`;
        const fadeOut = `fade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;
        const vfParts = [
          `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1`,
          `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5`,
          fadeIn, fadeOut, simpleCapFilters,
        ].filter(Boolean);

        execFileSync('ffmpeg', [
          '-y',
          '-stream_loop', '-1', '-i', bgVideos[0],
          '-i', audioPath,
          '-t', duration.toFixed(2),
          '-vf', vfParts.join(','),
          '-af', afFull,
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '28',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          '-shortest',
          output,
        ], { stdio: 'pipe' });
      }

      // Cleanup all downloaded clips
      for (const p of bgVideos) { try { fs.unlinkSync(p); } catch {} }

    // ══════════════════════════════════════════════════════════
    // LONGFORM PIPELINE — unchanged from original
    // ══════════════════════════════════════════════════════════
    } else {
      const bgVideo = await this.fetchBackground(script.visualNotes || '');

      // Base video filter — scale to 16:9 for long-form
      const baseVf      = `scale=1920:1080,setsar=1`;
      const darkOverlay = `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5`;

      // Build caption drawtext filters (only if drawtext compiled into ffmpeg)
      const captions = this.buildCaptions(script.voiceoverText || script.title, duration);

      const captionFilters = drawtextAvailable ? captions.map(cap => {
        // Strip single quotes (ffmpeg filter delimiter) and unsafe chars; keep readable text
        const safe = cap.text.replace(/'/g, '').replace(/[^A-Z0-9 .,!?]/g, '').trim();
        if (!safe) return null;
        // fontfile wrapped in single quotes — ffmpeg filter parser handles spaces in path correctly
        // borderw=5 + bordercolor=black gives bold-like outline; box adds dark backing for contrast
        const fontSize = 52;
        return `drawtext=text='${safe}':fontsize=${fontSize}:fontcolor=white:borderw=4:bordercolor=black:box=1:boxcolor=black@0.4:boxborderw=8:x=(w-text_w)/2:y=h*0.72:fontfile='${fontFile}':fix_bounds=1:enable='between(t\\,${cap.start.toFixed(2)}\\,${cap.end.toFixed(2)})'`;
      }).filter(Boolean).join(',') : null;

      // Channel name watermark
      const watermark = drawtextAvailable
        ? `drawtext=text='${channelName}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black:x=30:y=60:fontfile='${fontFile}'`
        : null;

      const fadeIn  = `fade=t=in:st=0:d=0.5`;
      const fadeOut = `fade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

      const vfParts = [baseVf, darkOverlay, fadeIn, fadeOut, captionFilters, watermark].filter(Boolean);
      const vfFull  = vfParts.join(',');

      // Use execFileSync (args array) — avoids all shell escaping issues with font paths + filter strings
      const ffmpegArgs = [
        '-y',
        '-stream_loop', '-1', '-i', bgVideo,
        '-i', audioPath,
        '-t', duration.toFixed(2),
        '-vf', vfFull,
        '-af', afFull,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '28',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        '-shortest',
        output,
      ];

      try {
        execFileSync('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
      } catch (err) {
        const fullErr = err.stderr?.toString() || err.message;
        console.warn('  ⚠️  Caption encoding failed, falling back to plain video');
        console.warn('  Full error:\n' + fullErr.slice(-800));
        const simpleFallbackVf = [baseVf, darkOverlay, fadeIn, fadeOut].join(',');
        execFileSync('ffmpeg', [
          '-y',
          '-stream_loop', '-1', '-i', bgVideo,
          '-i', audioPath,
          '-t', duration.toFixed(2),
          '-vf', simpleFallbackVf,
          '-af', afFull,
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '28',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          '-shortest',
          output,
        ], { stdio: 'pipe' });
      }

      try { fs.unlinkSync(bgVideo); } catch {}
    }

    const sizeMB = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Video assembled (${sizeMB} MB)`);
    return output;
  }
}
