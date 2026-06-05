import { describe, expect, it } from "vitest";
import { resolveTranscriptSpeakerLabel } from "./transcript-speaker";

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
