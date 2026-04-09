// VideoAgent.js — Assembles final video using ffmpeg + Pexels stock footage
// v3 — ctaText overlay in last 4 seconds (screen text, not spoken)
// Shorts: 9:16 vertical (1080x1920) | Long-form: 16:9 (1920x1080)
import { execSync, execFileSync } from 'child_process';
import fetch        from 'node-fetch';
import fs           from 'fs';

// Audience-specific Pexels queries — checked before VISUAL_QUERIES keyword matching
const AUDIENCE_QUERIES = [
  { match: ['nurse', 'nurses'],                    query: 'nurse hospital scrubs working' },
  { match: ['freelancer', 'freelancers'],           query: 'freelancer laptop coffee shop home office' },
  { match: ['teacher', 'teachers'],                query: 'teacher classroom education' },
  { match: ['9-to-5', 'employee', 'employees'],    query: 'office worker commute city' },
  { match: ['college student', 'college students'], query: 'student studying campus laptop' },
  { match: ['single mom', 'single moms'],           query: 'mother working home family' },
  { match: ['side hustler', 'side hustlers'],       query: 'entrepreneur working night city lights' },
  { match: ['retail worker', 'retail workers'],     query: 'retail store cashier shopping' },
  { match: ['truck driver', 'truck drivers'],       query: 'truck driver highway road' },
  { match: ['real estate', 'real estate agent'],    query: 'real estate agent house keys' },
  { match: ['uber driver', 'uber drivers'],         query: 'rideshare driver car city' },
  { match: ['new parent', 'new parents'],           query: 'parent baby home family' },
];

function resolveAudienceQuery(targetAudience) {
  if (!targetAudience) return null;
  const lower = targetAudience.toLowerCase();
  for (const { match, query } of AUDIENCE_QUERIES) {
    if (match.some(m => lower.includes(m))) return query;
  }
  return null;
}

const VISUAL_QUERIES = {
  default:    'luxury lifestyle cinematic dark',
  money:      'money wealth dark aesthetic',
  finance:    'city financial district night',
  trading:    'person on phone trading stocks',
  wealth:     'luxury car mansion wealth cinematic',
  budget:     'person working laptop coffee money',
  debt:       'credit card bills money stress dark',
  invest:     'stock market graphs wealth dark',
  savings:    'piggy bank coins saving money',
  hustle:     'entrepreneur working night city lights',
};

// Font paths — bold variants first, TTF only (.ttc collections don't work with ffmpeg drawtext)
const FONT_PATHS = [
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial Bold.ttf',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
];

function resolveFont() {
  const found = FONT_PATHS.find(p => fs.existsSync(p));
  if (!found) throw new Error('No TTF font found. Install fonts-liberation or fonts-dejavu.');
  console.log(`  🔤 Using font: ${found}`);
  return found;
}

export class VideoAgent {

  // ─────────────────────────────────────────────────────────────
  // Feature detection helpers
  // ─────────────────────────────────────────────────────────────

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
  // CTA overlay filter builder
  // Renders ctaText as a centered screen overlay for the last 4 seconds
  // Distinct from word captions: larger, boxed, higher contrast, lower position
  // ─────────────────────────────────────────────────────────────

  buildCtaOverlayFilter(ctaText, fontFile, duration) {
    if (!ctaText) return null;

    // Sanitize: remove single quotes and unsafe chars for ffmpeg drawtext
    const safe = ctaText
      .replace(/'/g, '')
      .replace(/[^A-Za-z0-9 .,!?:@#\-]/g, '')
      .trim();

    if (!safe) return null;

    const ctaStart = Math.max(0, (duration - 4)).toFixed(2);

    // Styled differently from word captions (which sit at h*0.70):
    // - Larger font (52px vs 68px captions)
    // - Cyan/white color to visually distinguish from yellow captions
    // - Darker semi-opaque box for readability
    // - Positioned at h*0.86 — below caption zone, above bottom edge
    return (
      `drawtext=text='${safe}':fontsize=46:fontcolor=#00E5FF:` +
      `borderw=4:bordercolor=black:` +
      `box=1:boxcolor=black@0.75:boxborderw=20:` +
      `x=(w-text_w)/2:y=h*0.86:` +
      `fontfile='${fontFile}':fix_bounds=1:` +
      `enable='between(t\\,${ctaStart}\\,${duration.toFixed(2)})'`
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Background fetching
  // ─────────────────────────────────────────────────────────────

  async fetchBackground(visualNotes = '', targetAudience = '') {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) throw new Error('PEXELS_API_KEY not set');

    let query = resolveAudienceQuery(targetAudience);
    if (!query) {
      query = VISUAL_QUERIES.default;
      const notes = visualNotes.toLowerCase();
      for (const [key, q] of Object.entries(VISUAL_QUERIES)) {
        if (notes.includes(key)) { query = q; break; }
      }
    }

    console.log(`  🎥 Fetching background: "${query}"`);

    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );

    if (!res.ok) throw new Error(`Pexels API error: ${res.status}`);
    const data = await res.json();

    let videos = data.videos || [];
    if (!videos.length) {
      const res2 = await fetch(
        `https://api.pexels.com/videos/search?query=luxury+lifestyle+cinematic+dark&per_page=10`,
        { headers: { Authorization: apiKey } }
      );
      const data2 = await res2.json();
      videos = data2.videos || [];
    }

    if (!videos.length) throw new Error('No Pexels videos found');

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

  async fetchMultipleBackgrounds(visualNotes = '', count = 4, targetAudience = '') {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) throw new Error('PEXELS_API_KEY not set');

    let query = resolveAudienceQuery(targetAudience);
    if (!query) {
      query = VISUAL_QUERIES.default;
      const notes = visualNotes.toLowerCase();
      for (const [key, q] of Object.entries(VISUAL_QUERIES)) {
        if (notes.includes(key)) { query = q; break; }
      }
    }

    console.log(`  🎥 Fetching ${count} B-roll clips: "${query}"`);

    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) throw new Error(`Pexels API error: ${res.status}`);
    const data = await res.json();

    let videos = data.videos || [];

    if (videos.length < count) {
      const res2 = await fetch(
        `https://api.pexels.com/videos/search?query=luxury+lifestyle+cinematic+dark&per_page=15`,
        { headers: { Authorization: apiKey } }
      );
      const data2 = await res2.json();
      videos = [...videos, ...(data2.videos || [])];
    }

    if (!videos.length) throw new Error('No Pexels videos found');

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

  buildWordCaptionFilters(words, fontFile, fontSize = 68) {
    return words.map(w => {
      if (!w.text) return null;
      const s = w.start.toFixed(2);
      const e = w.end.toFixed(2);
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
  // Ken Burns
  // ─────────────────────────────────────────────────────────────

  _buildKenBurnsFilter(clipIndex, segFrames) {
    const presets = [
      { z: `min(zoom+0.0005,1.1)`, x: `iw/2-(iw/zoom/2)`, y: `ih/2-(ih/zoom/2)` },
      { z: `min(zoom+0.0005,1.1)`, x: `0`,                 y: `0`                },
      { z: `min(zoom+0.0005,1.1)`, x: `iw-iw/zoom`,        y: `ih-ih/zoom`       },
      { z: `1.05`,                 x: `min(px+0.3,iw-iw/zoom)`, y: `ih/2-(ih/zoom/2)` },
    ];
    const p = presets[clipIndex % presets.length];
    return `zoompan=z='${p.z}':x='${p.x}':y='${p.y}':d=${segFrames}:s=1080x1920:fps=25`;
  }

  // ─────────────────────────────────────────────────────────────
  // filter_complex builders for Shorts (3 tiers)
  // ─────────────────────────────────────────────────────────────

  _buildFullShortFilterComplex({ clipCount, segDur, segFrames, transDur, fps, wordCapFilters, buildznWatermark, ctaOverlayFilter, duration }) {
    const chains = [];

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

    let prevLabel = 'c0';
    for (let i = 1; i < clipCount; i++) {
      const offset   = (i * (segDur - transDur)).toFixed(2);
      const outLabel = i < clipCount - 1 ? `v0${i + 1}` : 'vbase';
      chains.push(`[${prevLabel}][c${i}]xfade=transition=fade:duration=${transDur}:offset=${offset}[${outLabel}]`);
      prevLabel = outLabel;
    }

    return this._appendCaptionStages({ chains, wordCapFilters, buildznWatermark, ctaOverlayFilter, duration });
  }

  _buildXfadeShortFilterComplex({ clipCount, segDur, transDur, fps, wordCapFilters, buildznWatermark, ctaOverlayFilter, duration }) {
    const chains = [];

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

    let prevLabel = 'c0';
    for (let i = 1; i < clipCount; i++) {
      const offset   = (i * (segDur - transDur)).toFixed(2);
      const outLabel = i < clipCount - 1 ? `v0${i + 1}` : 'vbase';
      chains.push(`[${prevLabel}][c${i}]xfade=transition=fade:duration=${transDur}:offset=${offset}[${outLabel}]`);
      prevLabel = outLabel;
    }

    return this._appendCaptionStages({ chains, wordCapFilters, buildznWatermark, ctaOverlayFilter, duration });
  }

  _buildConcatShortFilterComplex({ clipCount, fps, wordCapFilters, buildznWatermark, ctaOverlayFilter, duration }) {
    const chains = [];

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

    const inputLabels = Array.from({ length: clipCount }, (_, i) => `[c${i}]`).join('');
    chains.push(`${inputLabels}concat=n=${clipCount}:v=1:a=0[vbase]`);

    return this._appendCaptionStages({ chains, wordCapFilters, buildznWatermark, ctaOverlayFilter, duration });
  }

  // Shared stages: fade → word captions → watermark → CTA overlay → [vout]
  // Stage order matters: CTA renders ON TOP of everything else
  _appendCaptionStages({ chains, wordCapFilters, buildznWatermark, ctaOverlayFilter, duration }) {
    const fadeIn  = `fade=t=in:st=0:d=0.5`;
    const fadeOut = `fade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

    // Stage 3: fade in/out
    chains.push(`[vbase]${fadeIn},${fadeOut}[vfaded]`);

    // Stage 4: word captions
    if (wordCapFilters && wordCapFilters.length) {
      chains.push(`[vfaded]${wordCapFilters.join(',')}[vcapped]`);
    } else {
      chains.push(`[vfaded]null[vcapped]`);
    }

    // Stage 5: BuildZn watermark
    if (buildznWatermark) {
      chains.push(`[vcapped]${buildznWatermark}[vwatermarked]`);
    } else {
      chains.push(`[vcapped]null[vwatermarked]`);
    }

    // Stage 6: CTA overlay (last 4 seconds, cyan text, above bottom edge)
    if (ctaOverlayFilter) {
      chains.push(`[vwatermarked]${ctaOverlayFilter}[vout]`);
    } else {
      chains.push(`[vwatermarked]null[vout]`);
    }

    return chains.join(';\n');
  }

  // ─────────────────────────────────────────────────────────────
  // Main assembly — assemble(audioPath, script, mode, targetAudience, opts)
  // script.ctaText is now read and rendered as a screen overlay
  // ─────────────────────────────────────────────────────────────

  async assemble(audioPath, script, mode, targetAudience = '', opts = {}) {
    const isShort     = mode === 'short';
    const rawDuration = this.getAudioDuration(audioPath);
    const duration    = (isShort && rawDuration > 58) ? 58 : rawDuration;
    const output      = `/tmp/final_${Date.now()}.mp4`;
    const channelName = process.env.CHANNEL_HANDLE || '@BuildZn';

    console.log(`  🎬 Assembling ${isShort ? 'Short (9:16)' : 'Long-form (16:9)'} | Duration: ${duration.toFixed(1)}s`);

    const fontFile          = resolveFont();
    const drawtextAvailable = this.checkDrawtext();
    const afFull = `afade=t=in:st=0:d=0.5,afade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

    // ── Build CTA overlay filter from script.ctaText ──────────────────────────
    const ctaOverlayFilter = (drawtextAvailable && script.ctaText)
      ? this.buildCtaOverlayFilter(script.ctaText, fontFile, duration)
      : null;

    if (ctaOverlayFilter) {
      console.log(`  📣 CTA overlay: "${script.ctaText}"`);
    } else if (isShort) {
      console.warn('  ⚠️  No ctaText in script — CTA overlay skipped');
    }

    // ══════════════════════════════════════════════════════════
    // SHORTS PIPELINE
    // ══════════════════════════════════════════════════════════
    if (isShort) {
      const CLIP_COUNT = 4;
      const TRANS_DUR  = 0.8;
      const FPS        = 25;

      const segDur    = (duration + (CLIP_COUNT - 1) * TRANS_DUR) / CLIP_COUNT;
      const segFrames = Math.ceil(segDur * FPS);

      let bgVideos;
      try {
        bgVideos = await this.fetchMultipleBackgrounds(script.visualNotes || '', CLIP_COUNT, targetAudience);
      } catch (err) {
        console.warn('  ⚠️  Multi-clip fetch failed, falling back to single clip:', err.message);
        bgVideos = [await this.fetchBackground(script.visualNotes || '', targetAudience)];
      }

      const { wordTimestamps } = opts;
      const wordCaps = (wordTimestamps && wordTimestamps.length)
        ? wordTimestamps
        : this.buildWordCaptions(script.voiceoverText || script.title, duration);
      const wordCapFilters = drawtextAvailable ? this.buildWordCaptionFilters(wordCaps, fontFile) : [];

      // BuildZn watermark
      const buildznWatermark = drawtextAvailable
        ? `drawtext=text='BuildZn':fontsize=28:fontcolor=white@0.65:borderw=1:bordercolor=black@0.5:x=w-text_w-30:y=h-text_h-45:fontfile='${fontFile}'`
        : null;

      // Build looped input args
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

      // ── Tier 1: Ken Burns + xfade + word captions + watermark + CTA ──
      if (!assembled && zoompanAvailable && xfadeAvailable && bgVideos.length === CLIP_COUNT) {
        try {
          const fc = this._buildFullShortFilterComplex({
            clipCount: bgVideos.length, segDur, segFrames, transDur: TRANS_DUR, fps: FPS,
            wordCapFilters, buildznWatermark, ctaOverlayFilter, duration,
          });
          execFileSync('ffmpeg', multiClipArgs(fc), { stdio: 'pipe' });
          assembled = true;
          console.log('  ✨ Assembled: Ken Burns + crossfade + word captions + CTA overlay');
        } catch (err) {
          console.warn('  ⚠️  Tier 1 (zoompan+xfade) failed:', (err.stderr?.toString() || err.message).slice(-200));
        }
      }

      // ── Tier 2: xfade + word captions + watermark + CTA ──
      if (!assembled && xfadeAvailable && bgVideos.length === CLIP_COUNT) {
        try {
          const fc = this._buildXfadeShortFilterComplex({
            clipCount: bgVideos.length, segDur, transDur: TRANS_DUR, fps: FPS,
            wordCapFilters, buildznWatermark, ctaOverlayFilter, duration,
          });
          execFileSync('ffmpeg', multiClipArgs(fc), { stdio: 'pipe' });
          assembled = true;
          console.log('  ✨ Assembled: crossfade + word captions + CTA overlay (no Ken Burns)');
        } catch (err) {
          console.warn('  ⚠️  Tier 2 (xfade) failed:', err.message.slice(-100));
        }
      }

      // ── Tier 3: B-roll hard cuts + word captions + watermark + CTA ──
      if (!assembled && bgVideos.length >= 2) {
        try {
          const fc = this._buildConcatShortFilterComplex({
            clipCount: bgVideos.length, fps: FPS,
            wordCapFilters, buildznWatermark, ctaOverlayFilter, duration,
          });
          execFileSync('ffmpeg', multiClipArgs(fc), { stdio: 'pipe' });
          assembled = true;
          console.log('  ✨ Assembled: B-roll cuts + word captions + CTA overlay (no crossfade)');
        } catch (err) {
          console.warn('  ⚠️  Tier 3 (concat) failed:', err.message.slice(-100));
        }
      }

      // ── Tier 4: single clip fallback — includes CTA via -vf ──
      if (!assembled) {
        console.warn('  Falling back to single-clip Short (Tier 4)');
        const simpleCaptions   = this.buildCaptions(script.voiceoverText || script.title, duration);
        const simpleCapFilters = drawtextAvailable ? simpleCaptions.map(cap => {
          const safe = cap.text.replace(/'/g, '').replace(/[^A-Z0-9 .,!?]/g, '').trim();
          if (!safe) return null;
          return `drawtext=text='${safe}':fontsize=58:fontcolor=white:borderw=4:bordercolor=black:box=1:boxcolor=black@0.4:boxborderw=8:x=(w-text_w)/2:y=h*0.72:fontfile='${fontFile}':fix_bounds=1:enable='between(t\\,${cap.start.toFixed(2)}\\,${cap.end.toFixed(2)})'`;
        }).filter(Boolean) : [];

        const fadeIn  = `fade=t=in:st=0:d=0.5`;
        const fadeOut = `fade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

        // Include CTA overlay in tier 4 -vf chain
        const vfParts = [
          `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1`,
          `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5`,
          fadeIn, fadeOut,
          ...simpleCapFilters,
          ctaOverlayFilter,
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

      for (const p of bgVideos) { try { fs.unlinkSync(p); } catch {} }

    // ══════════════════════════════════════════════════════════
    // LONGFORM PIPELINE — unchanged, no CTA overlay for long-form
    // ══════════════════════════════════════════════════════════
    } else {
      const bgVideo = await this.fetchBackground(script.visualNotes || '', targetAudience);

      const baseVf      = `scale=1920:1080,setsar=1`;
      const darkOverlay = `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5`;

      const captions = this.buildCaptions(script.voiceoverText || script.title, duration);

      const captionFilters = drawtextAvailable ? captions.map(cap => {
        const safe = cap.text.replace(/'/g, '').replace(/[^A-Z0-9 .,!?]/g, '').trim();
        if (!safe) return null;
        const fontSize = 52;
        return `drawtext=text='${safe}':fontsize=${fontSize}:fontcolor=white:borderw=4:bordercolor=black:box=1:boxcolor=black@0.4:boxborderw=8:x=(w-text_w)/2:y=h*0.72:fontfile='${fontFile}':fix_bounds=1:enable='between(t\\,${cap.start.toFixed(2)}\\,${cap.end.toFixed(2)})'`;
      }).filter(Boolean).join(',') : null;

      const watermark = drawtextAvailable
        ? `drawtext=text='${channelName}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black:x=30:y=60:fontfile='${fontFile}'`
        : null;

      const fadeIn  = `fade=t=in:st=0:d=0.5`;
      const fadeOut = `fade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

      const vfParts = [baseVf, darkOverlay, fadeIn, fadeOut, captionFilters, watermark].filter(Boolean);
      const vfFull  = vfParts.join(',');

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