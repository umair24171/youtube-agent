# 🎬 YouTube Automation Agent
**Niche: AI Automation + SaaS Building | Fully automated, zero manual work**

Runs on GitHub Actions. Posts Shorts 3x/week + long-form 1x/week + weekly recap. 
Same architecture as your trading agents — Node.js + Discord notifications.

---

## 🚀 Quick Setup (One-time, ~2 hours)

### Step 1 — Clone & install
```bash
git clone your-repo
cd YOUTUBE-AGENT
npm install
cp .env.example .env
```

### Step 2 — Get API Keys (all free)

| Key | Where to get it |
|-----|----------------|
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → API Key |
| `PEXELS_API_KEY` | https://www.pexels.com/api/ |
| `DISCORD_WEBHOOK_YOUTUBE` | Discord → Channel Settings → Integrations → Webhooks |

### Step 3 — YouTube OAuth (one-time, most important)
```bash
# Fill YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first
# Then:
node scripts/get_youtube_token.js
# Follow the prompts → copy YOUTUBE_REFRESH_TOKEN to .env
```

### Step 4 — Test locally (dry run)
```bash
cp .env.example .env   # fill in your keys
npm run dry-run        # generates script + video but skips upload
npm run short          # full run — uploads real Short to YouTube
```

### Step 5 — Deploy to GitHub Actions
```bash
# Add all .env values as GitHub Repository Secrets:
# Settings → Secrets and variables → Actions → New repository secret
# Add each key from .env.example
```

That's it. After Step 5 it runs forever automatically. ✅

---

## 📅 Auto Schedule

| Day | Time (PKT) | Mode | Content Type |
|-----|-----------|------|-------------|
| Monday | 9AM | short | AI/dev tip Short |
| Tuesday | 9AM | longform | Full tutorial |
| Wednesday | 9AM | short | AI/dev tip Short |
| Thursday | — | — | No post |
| Friday | 9AM | short | AI/dev tip Short |
| Saturday | — | — | No post |
| Sunday | 10AM | recap | Weekly recap |

---

## 🔧 Manual Trigger

Push to GitHub → Actions tab → "YouTube Automation Pipeline" → Run workflow → pick mode.

Or locally:
```bash
npm run short      # Upload a Short now
npm run longform   # Upload a long-form now
npm run recap      # Upload weekly recap
npm run dry-run    # Test without uploading
```

---

## 📊 Cost Breakdown

| Service | Free Tier | Usage |
|---------|-----------|-------|
| Gemini API | Unlimited (rate limited) | Script generation |
| ElevenLabs | 10,000 chars/month | Shorts: ~400 chars each (25 Shorts free) |
| Pexels API | 200 req/hour | 1 video per run |
| YouTube Data API v3 | 10,000 units/day | Upload = 1,600 units |
| GitHub Actions | 2,000 min/month | ~5 min per run = 400 runs free |

**Total monthly cost: $0**

---

## 🔔 Discord Notifications

Every pipeline run sends:
- 🎬 Pipeline started
- ✅ Video published with link  
- ❌ Error details if something fails

---

## 📁 File Structure

```
YOUTUBE-AGENT/
├── src/
│   ├── youtube_index.js     ← Main entry (runs via GitHub Actions)
│   ├── TopicAgent.js        ← Finds trending topics via Gemini
│   ├── ScriptAgent.js       ← Writes full scripts via Gemini
│   ├── VoiceAgent.js        ← ElevenLabs TTS → MP3
│   ├── VideoAgent.js        ← ffmpeg + Pexels → MP4
│   ├── ThumbnailAgent.js    ← node-canvas → PNG thumbnail
│   ├── UploadAgent.js       ← YouTube Data API v3 upload
│   ├── CrossPostAgent.js    ← LinkedIn auto-post
│   └── DiscordNotifier.js   ← Same as trading agents
├── scripts/
│   └── get_youtube_token.js ← One-time OAuth setup
├── .github/workflows/
│   └── youtube_pipeline.yml ← GitHub Actions scheduler
├── .env.example
└── package.json
```

---

*Built by Umair Bilal | Same pattern as gold trading agents | Deploys to GitHub Actions*
