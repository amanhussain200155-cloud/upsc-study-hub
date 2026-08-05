# 🏛️ UPSC Study Hub

Auto-growing UPSC preparation app with AI-generated questions, current affairs, and spaced repetition.

## Features
- 250+ UPSC-difficulty MCQs (growing daily via AI)
- Current affairs from The Hindu, Indian Express, PIB (auto-fetched every 4 hours)
- Mains answer practice with model answers
- Interview prep with model responses
- Essay topics with full model essays
- Revision system with spaced repetition
- Bookmark and track progress

## Deploy (Free)

### Option 1: Railway (Recommended, easiest)
1. Push this code to a GitHub repo
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repo → it auto-deploys
5. You get a public URL like `your-app.railway.app`

### Option 2: Render
1. Push to GitHub
2. Go to [render.com](https://render.com)
3. New → Web Service → Connect repo
4. Build command: `npm install`
5. Start command: `node server.js`

### Option 3: Fly.io
```bash
fly launch
fly deploy
```

## After Deployment

Configure AI question generation (free):
```bash
curl -X POST https://your-app-url/api/config/llm \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"your-openrouter-key","model":"nvidia/nemotron-3-ultra-550b-a55b:free"}'
```

Get free API key at: https://openrouter.ai/keys

## Install as Phone App (PWA)
Once deployed to a public URL with HTTPS:
- **Android**: Open in Chrome → Menu (⋮) → "Install app" or "Add to Home Screen"
- **iPhone**: Open in Safari → Share (↑) → "Add to Home Screen"

It will appear as a standalone app with the 🏛️ icon.

## Tech Stack
- Node.js + Express
- React (CDN, no build step)
- RSS Parser for news
- node-cron for scheduling
- OpenRouter API for AI generation (free tier)
