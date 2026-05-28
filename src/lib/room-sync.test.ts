import { describe, expect, it } from "vitest";
import {
  filterChatMessagesForRole,
  resolveIncomingSyncPhase,
  shouldIgnoreSyncPhaseDowngrade,
  syncStateIndicatesLiveSession,
} from "./room-sync";

describe("syncStateIndicatesLiveSession", () => {
  it("treats empty pre-start room as not live", () => {
    expect(syncStateIndicatesLiveSession({ phase: "setup" })).toBe(false);
  });

  it("recognizes an explicit interview phase", () => {
    expect(syncStateIndicatesLiveSession({ phase: "interview" })).toBe(true);
  });
});

describe("shouldIgnoreSyncPhaseDowngrade", () => {
  it("blocks stale setup snapshot while client is in interview", () => {
    expect(
      shouldIgnoreSyncPhaseDowngrade({
        interviewSeen: true,
        localPhase: "interview",
        incomingPhase: "setup",
      })
    ).toBe(true);
  });

  it("allows setup when client has never entered interview", () => {
    expect(
      shouldIgnoreSyncPhaseDowngrade({
        interviewSeen: false,
        localPhase: "setup",
        incomingPhase: "setup",
      })
    ).toBe(false);
  });
});

describe("resolveIncomingSyncPhase", () => {
  it("coerces setup to interview when server state shows a live session", () => {
    expect(
      resolveIncomingSyncPhase("setup", {
        phase: "setup",
        interviewStartedAt: 1000,
        config: { role: "Backend" },
      })
    ).toBe("interview");
  });

  it("leaves true pre-start setup unchanged", () => {
    expect(resolveIncomingSyncPhase("setup", { phase: "setup" })).toBe("setup");
  });
});

describe("filterChatMessagesForRole", () => {
  it("hides agent messages from candidate chat history", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "agent", content: "private tip" },
    ];
    expect(filterChatMessagesForRole(messages, "candidate")).toEqual([{ role: "user", content: "hi" }]);
  });

  it("shows agent messages to interviewers", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "agent", content: "private tip" },
    ];
    expect(filterChatMessagesForRole(messages, "interviewer")).toHaveLength(2);
  });
});
