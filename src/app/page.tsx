"use client";

import Link from "next/link";
import { useInterviewStore } from "@/store/interview-store";
import { SetupForm } from "@/components/setup-form";
import { InterviewPage } from "@/components/interview-page";
import { ReviewPanel } from "@/components/review-panel";
import { Users } from "lucide-react";

export default function Home() {
  const session = useInterviewStore((s) => s.session);

  if (!session) {
    return (
      <>
        <SetupForm />
        <div className="fixed bottom-4 right-4">
          <Link
            href="/room"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Users className="h-4 w-4 text-blue-600" />
            Collaborative Room
          </Link>
        </div>
      </>
    );
  }

  if (session.phase === "review") {
    return <ReviewPanel />;
  }

  return <InterviewPage />;
}
