// ThumbnailAgent.js — Generates thumbnails using ffmpeg drawtext
// Zero extra dependencies — ffmpeg is already installed
import { execSync, execFileSync } from 'child_process';
import fs from 'fs';

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
  return found; // raw path — wrapped in single quotes inside ffmpeg filter (execFileSync, no shell)
}

export class ThumbnailAgent {

  checkDrawtext() {
    try {
      const filters = execSync('ffmpeg -filters 2>/dev/null', { stdio: 'pipe' }).toString();
      if (!filters.includes('drawtext')) {
        console.warn('  ⚠️  ffmpeg drawtext not available. Run: brew reinstall ffmpeg');
        return false;
      }
      return true;
    } catch { return false; }
  }

  async generate(title, hook = '') {
    const outputPath = `/tmp/thumbnail_${Date.now()}.png`;
    const drawtextAvailable = this.checkDrawtext();
    const fontFile = drawtextAvailable ? resolveFont() : null;
    if (fontFile) console.log(`  🔤 Thumbnail font: ${fontFile.replace(/\\ /g, ' ')}`);

    // Clean text for ffmpeg (escape special chars)
    const cleanTitle = title.toUpperCase()
      .replace(/'/g, '')
      .replace(/:/g, '-')
      .replace(/[^A-Z0-9 \-!?]/g, '')
      .substring(0, 60);

    const cleanHook = hook
      .replace(/'/g, '')
      .replace(/:/g, '-')
      .replace(/[^a-zA-Z0-9 \-!?]/g, '')
      .substring(0, 65);

    // Word wrap title manually (max ~20 chars per line for large font)
    const words = cleanTitle.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > 22 && current) {
        lines.push(current.trim());
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) lines.push(current.trim());

    // Build drawtext filters for each title line — fontfile in single quotes handles spaces in path
    // borderw=4 + bordercolor=black gives the white-on-dark bold look
    const titleFilters = drawtextAvailable ? lines.map((line, i) => {
      const y = 140 + (i * 90);
      return `drawtext=text='${line}':fontsize=72:fontcolor=white:borderw=4:bordercolor=black:x=40:y=${y}:fontfile='${fontFile}'`;
    }).join(',') : null;

    // Hook text
    const hookFilter = (drawtextAvailable && cleanHook)
      ? `drawtext=text='${cleanHook}':fontsize=34:fontcolor=#FFD700:borderw=2:bordercolor=black:x=40:y=560:fontfile='${fontFile}'`
      : null;

    // Channel name
    const channelName = (process.env.CHANNEL_HANDLE || '@DevUmair').replace('@', '').toUpperCase();
    const nameFilter = drawtextAvailable
      ? `drawtext=text='${channelName}':fontsize=30:fontcolor=#FFD700:borderw=2:bordercolor=black:x=40:y=672:fontfile='${fontFile}'`
      : null;

    // Badge
    const badgeFilter = drawtextAvailable
      ? `drawtext=text='FINANCE HACKS':fontsize=22:fontcolor=white:borderw=1:bordercolor=black:x=1060:y=32:fontfile='${fontFile}'`
      : null;

    const allFilters = [
      // Dark green-black background (finance aesthetic)
      `drawbox=x=0:y=0:w=1280:h=720:color=#060f06:t=fill`,
      // Subtle dark green grid lines
      ...Array.from({length: 12}, (_, i) =>
        `drawbox=x=0:y=${(i+1)*60}:w=1280:h=1:color=#0d1a0d:t=fill`
      ),
      // Gold left bar
      `drawbox=x=0:y=0:w=10:h=720:color=#FFD700:t=fill`,
      // Bottom branding bar
      `drawbox=x=0:y=648:w=1280:h=72:color=#040a04:t=fill`,
      // Dark gold badge background
      `drawbox=x=1040:y=18:w=222:h=50:color=#B8860B:t=fill`,
      // Text layers
      titleFilters,
      hookFilter,
      nameFilter,
      badgeFilter,
    ].filter(Boolean).join(',');

    // Use execFileSync (args array) — avoids all shell escaping issues with font paths in filter strings
    try {
      execFileSync('ffmpeg', [
        '-y', '-f', 'lavfi',
        '-i', 'color=size=1280x720:rate=1:color=#060f06',
        '-vframes', '1',
        '-vf', allFilters,
        outputPath,
      ], { stdio: 'pipe' });
    } catch (err) {
      console.warn('  ⚠️  Thumbnail text failed, generating simple thumbnail');
      console.warn('  Full error:\n' + (err.stderr?.toString() || err.message).slice(-600));
      const simpleFilters = 'drawbox=x=0:y=0:w=10:h=720:color=#FFD700:t=fill,drawbox=x=0:y=648:w=1280:h=72:color=#040a04:t=fill,drawbox=x=1040:y=18:w=222:h=50:color=#B8860B:t=fill';
      execFileSync('ffmpeg', [
        '-y', '-f', 'lavfi',
        '-i', 'color=size=1280x720:rate=1:color=#060f06',
        '-vframes', '1',
        '-vf', simpleFilters,
        outputPath,
      ], { stdio: 'pipe' });
    }

    const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0);
    console.log(`  ✅ Thumbnail generated (${sizeKB} KB)`);
    return outputPath;
  }
}