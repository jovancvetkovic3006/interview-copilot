# Interview Copilot

AI-powered technical interview assistant with a live code editor, intelligent interview agent, and automated review generation.

## Features

- **Interview Setup** — Configure role, difficulty level, topics, and interviewee name
- **AI Interview Agent** — GPT-4o powered agent that asks technical questions and assigns coding tasks
- **Live Code Editor** — Monaco Editor (VS Code engine) for coding tasks during interviews
- **Real-time Chat** — Conversational interface between the agent and interviewee
- **Interviewer Notes** — Take notes during the interview categorized by type (strength, weakness, etc.)
- **Automated Review** — AI-generated comprehensive review with scores, strengths, weaknesses, and hire recommendation

## Tech Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **TailwindCSS** for styling
- **Monaco Editor** for the code editor
- **Zustand** for state management
- **OpenAI GPT-4o** for the AI interview agent
- **Lucide React** for icons

## Getting Started

### Prerequisites

- Node.js 18+
- An OpenAI API key

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
   OPENAI_API_KEY=your-openai-api-key-here
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## How It Works

1. **Setup** — Fill in the interviewee's name, select the role, difficulty, and topics
2. **Interview** — The AI agent starts the interview, asks questions, and assigns coding tasks
3. **Code** — When a coding task is assigned, write the solution in the Monaco editor and submit
4. **Notes** — Take notes during the interview using the note-taking feature
5. **Review** — End the interview to generate a comprehensive AI review with scores and recommendations
