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

  getAudioDuration(audioPath) {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
    ).toString().trim();
    return parseFloat(output);
  }

  // Split script into caption chunks (max 5 words per line)
  buildCaptions(voiceoverText, duration) {
    const words = voiceoverText.replace(/[^\w\s',.!?]/g, '').split(/\s+/).filter(Boolean);
    const chunks = [];
    const wordsPerChunk = 5;
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

  async assemble(audioPath, script, mode) {
    const isShort  = mode === 'short';
    const bgVideo  = await this.fetchBackground(script.visualNotes || '');
    const rawDuration = this.getAudioDuration(audioPath);
    const duration = (isShort && rawDuration > 58) ? 58 : rawDuration;
    const output   = `/tmp/final_${Date.now()}.mp4`;
    const channelName = process.env.CHANNEL_HANDLE || '@DevUmair';

    console.log(`  🎬 Assembling ${isShort ? 'Short (9:16)' : 'Long-form (16:9)'} | Duration: ${duration.toFixed(1)}s`);

    const fontFile = resolveFont();
    const drawtextAvailable = this.checkDrawtext();

    // Base video filter — crop to vertical 9:16 for Shorts
    const baseVf = isShort
      ? `crop=ih*9/16:ih,scale=1080:1920,setsar=1`
      : `scale=1920:1080,setsar=1`;

    // Dark overlay for better text readability
    const darkOverlay = `colorchannelmixer=rr=0.5:gg=0.5:bb=0.5`;

    // Build caption drawtext filters (only if drawtext compiled into ffmpeg)
    const captions = this.buildCaptions(script.voiceoverText || script.title, duration);

    const captionFilters = drawtextAvailable ? captions.map(cap => {
      // Strip single quotes (ffmpeg filter delimiter) and unsafe chars; keep readable text
      const safe = cap.text.replace(/'/g, '').replace(/[^A-Z0-9 .,!?]/g, '').trim();
      if (!safe) return null;
      // fontfile wrapped in single quotes — ffmpeg filter parser handles spaces in path correctly
      // borderw=5 + bordercolor=black gives bold-like outline; box adds dark backing for contrast
      return `drawtext=text='${safe}':fontsize=72:fontcolor=white:borderw=5:bordercolor=black:box=1:boxcolor=black@0.4:boxborderw=8:x=(w-text_w)/2:y=h*0.72:fontfile='${fontFile}':enable='between(t\\,${cap.start.toFixed(2)}\\,${cap.end.toFixed(2)})'`;
    }).filter(Boolean).join(',') : null;

    // Channel name watermark
    const watermark = drawtextAvailable
      ? `drawtext=text='${channelName}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black:x=30:y=60:fontfile='${fontFile}'`
      : null;

    const fadeIn  = `fade=t=in:st=0:d=0.5`;
    const fadeOut = `fade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

    const vfParts = [baseVf, darkOverlay, fadeIn, fadeOut, captionFilters, watermark].filter(Boolean);
    const vfFull = vfParts.join(',');
    const afFull = `afade=t=in:st=0:d=0.5,afade=t=out:st=${(duration - 0.8).toFixed(2)}:d=0.8`;

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

    const sizeMB = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Video assembled (${sizeMB} MB)`);

    try { fs.unlinkSync(bgVideo); } catch {}
    return output;
  }
}