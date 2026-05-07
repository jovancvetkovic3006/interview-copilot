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

### Deploy PartyKit (free tier)
```bash
npm run deploy:party
```

This deploys the real-time server to Cloudflare's edge network. Update `NEXT_PUBLIC_PARTYKIT_HOST` in your `.env.local` with the deployed URL.
