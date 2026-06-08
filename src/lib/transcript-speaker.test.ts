import { describe, expect, it } from "vitest";
import { formatTranscriptSpeakerDisplay, resolveTranscriptSpeakerLabel } from "./transcript-speaker";
import type { Participant } from "@/types/room";

describe("resolveTranscriptSpeakerLabel", () => {
  it("uses setup candidate name for candidate role", () => {
    expect(
      resolveTranscriptSpeakerLabel({ name: "Host", role: "candidate" }, "Ana Petrović")
    ).toEqual({ speaker: "Ana Petrović", speakerRole: "candidate" });
  });

  it("uses join name for interviewers", () => {
    expect(resolveTranscriptSpeakerLabel({ name: "Marko", role: "interviewer" }, "Ana Petrović")).toEqual({
      speaker: "Marko",
      speakerRole: "interviewer",
    });
  });
});

describe("formatTranscriptSpeakerDisplay", () => {
  const peers: Participant[] = [
    { id: "a", name: "Jovan", role: "interviewer", joinedAt: 1 },
    { id: "b", name: "Jovan", role: "interviewer", joinedAt: 2 },
  ];

  it("suffixes duplicate interviewer names", () => {
    expect(
      formatTranscriptSpeakerDisplay(
        { speaker: "Jovan", speakerRole: "interviewer", participantId: "b" },
        peers
      )
    ).toBe("Jovan #2");
  });
});
