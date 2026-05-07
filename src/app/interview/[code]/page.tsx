"use client";

import { use } from "react";
import { RoomPageClient } from "@/components/room-page-client";

export default function InterviewerRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <RoomPageClient roomCode={(code ?? "").toUpperCase()} inviteRole="interviewer" />;
}
