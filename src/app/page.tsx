"use client";

import { useInterviewStore } from "@/store/interview-store";
import { SetupForm } from "@/components/setup-form";
import { InterviewPage } from "@/components/interview-page";
import { ReviewPanel } from "@/components/review-panel";

export default function Home() {
  const session = useInterviewStore((s) => s.session);

  if (!session) {
    return <SetupForm />;
  }

  if (session.phase === "review") {
    return <ReviewPanel />;
  }

  return <InterviewPage />;
}
