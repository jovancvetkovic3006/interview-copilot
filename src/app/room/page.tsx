"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, ArrowRight } from "lucide-react";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function RoomLobbyPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleCreate = () => {
    const code = generateRoomCode();
    router.push(`/room/${code}?creator=1`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      router.push(`/room/${joinCode.trim().toUpperCase()}`);
    }
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
            Create a room or join an existing one to collaborate in real-time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create Room */}
          <div>
            <Button onClick={handleCreate} className="w-full" size="lg">
              Create New Room
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-zinc-500 text-center mt-1.5">
              Generates a shareable room code
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-zinc-950 px-2 text-zinc-500">or</span>
            </div>
          </div>

          {/* Join Room */}
          <form onSubmit={handleJoin} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Room Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                placeholder="ABC123"
                maxLength={6}
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={joinCode.trim().length < 4}>
              Join Existing Room
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
