"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, ArrowRight, ClipboardList, ListChecks, FileText } from "lucide-react";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function InterviewLobbyPage() {
  const router = useRouter();

  const handleCreate = () => {
    const code = generateRoomCode();
    router.push(`/interview/${code}`);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Collaborative Interview</CardTitle>
          <CardDescription>
            Start a new interview as host. Candidates join only via the invite link you share from the room.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Button onClick={handleCreate} className="w-full" size="lg">
              Start New Interview
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-zinc-500 text-center mt-1.5">
              Share the candidate invite link from the room after you join
            </p>
          </div>

          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <Link
              href="/interview/reports"
              className="flex items-start gap-2 rounded-lg p-2 -mx-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              <FileText className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Browse interview reports</p>
                <p className="text-xs text-zinc-500">
                  Archived summaries from past interviews (download .md or PDF).
                </p>
              </div>
            </Link>
          </div>

          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <Link
              href="/quiz/new"
              className="flex items-start gap-2 rounded-lg p-2 -mx-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              <ListChecks className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Send a quiz</p>
                <p className="text-xs text-zinc-500">
                  Multiple-choice assessment with shareable link (BE Senior, FE Senior, etc.).
                </p>
              </div>
            </Link>
          </div>

          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <Link
              href="/task/new"
              className="flex items-start gap-2 rounded-lg p-2 -mx-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              <ClipboardList className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Send a take-home task</p>
                <p className="text-xs text-zinc-500">
                  Create a coding task with a shareable link the candidate can solve before the interview.
                </p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
