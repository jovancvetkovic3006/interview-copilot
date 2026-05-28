import { describe, expect, it } from "vitest";
import { resolveActiveStep, sessionIsLive } from "./room-step";

describe("sessionIsLive", () => {
  it("is false before host configures", () => {
    expect(
      sessionIsLive({
        phase: "setup",
        interviewStartedAt: null,
        hasConfig: false,
        hasCodingTask: false,
        hasActiveQuiz: false,
        codingTaskHistoryCount: 0,
        quizHistoryCount: 0,
      })
    ).toBe(false);
  });

  it("is true when PartyKit phase flickers to setup but assignments exist", () => {
    expect(
      sessionIsLive({
        phase: "setup",
        interviewStartedAt: null,
        hasConfig: false,
        hasCodingTask: false,
        hasActiveQuiz: false,
        codingTaskHistoryCount: 1,
        quizHistoryCount: 0,
      })
    ).toBe(true);
  });
});

describe("resolveActiveStep", () => {
  it("keeps join screen until user submits name", () => {
    expect(resolveActiveStep("setup", "join", false)).toBe("join");
  });

  it("shows waiting room after join before session is live", () => {
    expect(resolveActiveStep("setup", "setup", false)).toBe("setup");
  });

  it("shows interview UI when phase is interview", () => {
    expect(resolveActiveStep("interview", "setup", false)).toBe("interview");
  });

  it("keeps candidate in interview when phase drops but session is still live", () => {
    expect(
      resolveActiveStep("setup", "setup", true)
    ).toBe("interview");
  });

  it("shows review when interview ended", () => {
    expect(resolveActiveStep("review", "interview", true)).toBe("review");
  });
});
