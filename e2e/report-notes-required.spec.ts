import { test, expect } from "@playwright/test";
import {
  completeHostSetup,
  joinRoom,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installFailThenSucceedReportRoute, installMockLlmRoutes } from "./helpers/mock-api";

const REQUIRED_NOTES =
  "Candidate demonstrated strong communication and solid fundamentals throughout the session today.";

test.describe("Report notes gate (E2E)", () => {
  test("regenerate report requires session notes when no transcript was captured", async ({
    browser,
  }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(candidate);
    await candidate.clock.install();

    await installMockLlmRoutes(host);
    await installFailThenSucceedReportRoute(
      host,
      "# Interview report (E2E mock)\n\nNotes-gated regeneration succeeded."
    );
    await host.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await joinRoom(candidate, roomCode, "candidate", "Candidate");
    await completeHostSetup(host);
    await waitForPartyConnected(host);
    await waitForPartyConnected(candidate);

    await host.getByTestId("end-interview-btn").click();
    await host.getByTestId("confirm-end-interview").click();
    await expect(host.getByTestId("regenerate-report-btn")).toBeVisible({ timeout: 30_000 });
    await expect(host.getByText("required (no live transcript was captured)")).toBeVisible();

    const regenerate = host.getByTestId("regenerate-report-btn");
    await expect(regenerate).toBeDisabled();
    await host.getByTestId("review-session-notes").fill(REQUIRED_NOTES);
    await expect(regenerate).toBeEnabled({ timeout: 10_000 });
    await regenerate.click();
    await expect(host.getByTestId("interview-report-markdown")).toContainText(
      "Notes-gated regeneration succeeded",
      { timeout: 30_000 }
    );

    await host.close();
    await candidate.close();
  });
});
