import { describe, expect, it } from "vitest";
import { buildRoomInviteUrl, formatRemainingMs, inviteRoleLabel } from "./room-invite";

describe("buildRoomInviteUrl", () => {
  it("routes interviewers to the host room path", () => {
    expect(buildRoomInviteUrl("https://app.example.com", "ABC123", "interviewer")).toBe(
      "https://app.example.com/interview/ABC123"
    );
  });

  it("routes candidates to the neutral invite path", () => {
    expect(buildRoomInviteUrl("https://app.example.com", "ABC123", "candidate")).toBe(
      "https://app.example.com/invite/ABC123"
    );
  });
});

describe("formatRemainingMs", () => {
  it("formats sub-hour countdown as M:SS", () => {
    expect(formatRemainingMs(125_000)).toBe("2:05");
  });

  it("formats hour-plus countdown with hours", () => {
    expect(formatRemainingMs(3_661_000)).toBe("1:01:01");
  });
});

describe("inviteRoleLabel", () => {
  it("labels roles for the join form", () => {
    expect(inviteRoleLabel("interviewer")).toContain("host");
    expect(inviteRoleLabel("candidate")).toBe("Candidate");
  });
});
