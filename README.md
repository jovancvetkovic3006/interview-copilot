# Interview Copilot

AI-powered technical interview assistant with a live code editor, intelligent interview agent, real-time collaboration, audio transcription, and automated review generation.

## Features

- **Interview Setup** — Configure role, difficulty level, topics, and interviewee name
- **AI Interview Agent** — Claude-powered agent that asks technical questions and assigns coding tasks
- **Live Code Editor** — Monaco Editor (VS Code engine) for coding tasks during interviews
- **Real-time Chat** — Conversational interface between the agent and interviewee
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

### Solo Mode
1. **Setup** — Fill in the interviewee's name, select the role, difficulty, and topics
2. **Interview** — The AI agent starts the interview, asks questions, and assigns coding tasks
3. **Code** — When a coding task is assigned, write the solution in the Monaco editor and submit
4. **Notes** — Take notes during the interview using the note-taking feature
5. **Review** — End the interview to generate a comprehensive AI review with scores and recommendations

### Collaborative Mode
1. **Create Room** — Go to `/room` and create a new room (generates a 6-char code)
2. **Share Link** — Send the room link to the interviewee and any observers
3. **Join** — Each participant enters their name and selects their role (interviewer/interviewee/observer)
4. **Collaborate** — Everyone sees the shared code editor (real-time edits via Yjs), chat, and transcript
5. **Record** — Click "Record" to transcribe spoken conversation via browser microphone
6. **Review** — The interviewer ends the session; Claude generates a review using chat + code + transcript

## Deployment

### Deploy PartyKit (free tier)
```bash
npm run deploy:party
```

This deploys the real-time server to Cloudflare's edge network. Update `NEXT_PUBLIC_PARTYKIT_HOST` in your `.env.local` with the deployed URL.
