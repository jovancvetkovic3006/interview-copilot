# Interview Copilot

AI-powered technical interview assistant with a live code editor, intelligent interview agent, real-time collaboration, audio transcription, and automated review generation.

## Features

- **Interview Setup** — Configure role, difficulty level, topics, and candidate name
- **AI Interview Agent** — Claude-powered agent that asks technical questions and assigns coding tasks
- **Live Code Editor** — Monaco Editor (VS Code engine) for coding tasks during interviews
- **Real-time Chat** — Conversational interface between the agent and the candidate
- **Interviewer Notes** — Take notes during the interview categorized by type (strength, weakness, etc.)
- **Automated Review** — AI-generated comprehensive review with scores, strengths, weaknesses, and hire recommendation
- **Collaborative Rooms** — Real-time multi-user sessions with shared code editor and chat
- **Audio Transcription** — Browser-based speech-to-text that captures spoken conversation for review

## Tech Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **TailwindCSS** for styling
- **Monaco Editor** for the code editor
- **Zustand** for state management
- **Anthropic Claude** for the AI interview agent
- **PartyKit** for real-time collaboration (WebSocket rooms)
- **Yjs** + **y-monaco** for collaborative code editing (CRDT)
- **Web Speech API** for browser-native audio transcription
- **Lucide React** for icons

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/jovancvetkovic3006/interview-copilot.git
   cd interview-copilot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in the project root:
   ```
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
   ```

4. Run the development servers (two terminals):
   ```bash
   # Terminal 1: Next.js
   npm run dev

   # Terminal 2: PartyKit (for collaborative rooms)
   npm run dev:party
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## How It Works

### Collaborative Interview
1. **Start Interview** — Go to `/interview` and click "Start New Interview". You land at `/interview/CODE` as an interviewer.
2. **Share Links** — From the "Invite links" dropdown copy:
   - **Candidate link** (`/invite/CODE`) — neutral URL with no role wording
   - **Interviewer link** (`/interview/CODE`) — for additional interviewers (peer/shadow/panel)
3. **Two roles only** — `interviewer` and `candidate`. Multiple interviewers are allowed; the **first interviewer to join becomes the host** and is the only one who configures the interview. Other interviewers see a "the host is configuring" screen and auto-advance when the host starts.
4. **Collaborate** — Everyone sees the shared code editor (real-time edits via Yjs), chat, and transcript
5. **Record** — Click "Record" to transcribe spoken conversation via the browser microphone
6. **Review code mid-flight** — The host can click "Review candidate code" to send the live editor to Claude for feedback
7. **End interview** — Only the host can end the session; Claude then generates a review (chat + code + transcript) for the interviewer panel. The candidate sees a simple "thanks for participating" page.

## Deployment

This app has **two backends** that need to be deployed separately:

- **Next.js app** → Vercel (handles UI + API routes that call Anthropic)
- **PartyKit server** → PartyKit / Cloudflare Workers (handles realtime rooms, Yjs CRDT sync, and the take-home `pretask` party)

You must deploy PartyKit **first** so you know its hostname before configuring Vercel.

### 1. Deploy PartyKit

```bash
npm run deploy:party
```

The first run prompts a browser-based GitHub login. After deploy, the CLI prints the public hostname, for example:

```
Deployed interview-copilot to https://interview-copilot.<your-username>.partykit.dev
```

Save the bare hostname (no `https://`) — you'll set it as `NEXT_PUBLIC_PARTYKIT_HOST` on Vercel:

```
interview-copilot.<your-username>.partykit.dev
```

> Re-run `npm run deploy:party` whenever you change anything inside `party/` or `partykit.json`. New parties added to `partykit.json` only take effect after a redeploy.

### 2. Deploy the Next.js app to Vercel

The Vercel CLI ships as a dev dependency, so you don't need a global install. First-time setup needs an auth step:

```bash
npx vercel login          # browser-based, one-time
npm run deploy:preview    # first run — links the local folder to a new Vercel project, deploys a preview
npm run deploy            # promote to production (vercel --prod)
```

When prompted, accept the auto-detected Next.js framework settings. No `vercel.json` is needed.

### 3. Set environment variables on Vercel

In **Project → Settings → Environment Variables** (Production scope), add:

| Name | Example value | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-…` | A **freshly rotated** key from console.anthropic.com. Server-only, never exposed to the browser. |
| `NEXT_PUBLIC_PARTYKIT_HOST` | `interview-copilot.<your-username>.partykit.dev` | The hostname printed by `npm run deploy:party`. The `NEXT_PUBLIC_` prefix is required so the browser can reach the realtime server. |

After adding them, **redeploy** so the build picks them up: `npm run deploy` again, or click "Redeploy" in the dashboard.

### Verify

1. Open the Vercel URL → `/interview` → "Start New Interview" → you land on `/interview/CODE`.
2. Open the candidate link in another browser/incognito → both tabs should show each other in the participant list (PartyKit working).
3. Type in the shared editor → text propagates live (Yjs over PartyKit working).
4. Send a chat message → AI responds (Anthropic key working).
5. From `/interview` → "Send a take-home task" → create one → submit from another tab → the manage page shows the submission (`pretask` party working).

If any of those fail, check the browser console for `localhost:1999` references (means `NEXT_PUBLIC_PARTYKIT_HOST` wasn't set at build time) or 401/403s from `/api/chat` (means `ANTHROPIC_API_KEY` is missing/invalid).

### Local dev after the env var changes

Keep `.env.local` pointing at the local PartyKit dev server:

```
ANTHROPIC_API_KEY=sk-ant-api03-…
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
```

`.env.local` is git-ignored and is **not** uploaded to Vercel — Vercel uses the env vars you set in its dashboard.
