import { describe, expect, it } from "vitest";
import {
  formatInterviewRoleLabel,
  isMultiRoleInterview,
  resolveInterviewRoles,
  ROLE_LABEL_SEPARATOR,
} from "./interview-roles";

describe("interview-roles", () => {
  it("formats multiple roles with separator", () => {
    expect(formatInterviewRoleLabel(["Android Developer", "Backend Developer"])).toBe(
      `Android Developer${ROLE_LABEL_SEPARATOR}Backend Developer`
    );
  });

  it("resolves explicit roles array", () => {
    expect(
      resolveInterviewRoles({
        role: "ignored",
        roles: ["Android Developer", "Frontend Developer"],
      })
    ).toEqual(["Android Developer", "Frontend Developer"]);
  });

  it("parses legacy combined role label", () => {
    expect(
      resolveInterviewRoles({
        role: `Android Developer${ROLE_LABEL_SEPARATOR}Backend Developer`,
      })
    ).toEqual(["Android Developer", "Backend Developer"]);
  });

  it("keeps single custom role as one entry", () => {
    expect(resolveInterviewRoles({ role: "Platform Engineer" })).toEqual(["Platform Engineer"]);
  });

  it("detects multi-role interviews", () => {
    expect(
      isMultiRoleInterview({
        role: `Full Stack Developer${ROLE_LABEL_SEPARATOR}Android Developer`,
      })
    ).toBe(true);
    expect(isMultiRoleInterview({ role: "Backend Developer" })).toBe(false);
  });
});
