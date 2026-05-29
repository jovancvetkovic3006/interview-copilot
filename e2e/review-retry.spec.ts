import { test, expect } from "@playwright/test";
import {
  completeHostSetup,
  joinRoom,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installFailThenSucceedReportRoute, installMockLlmRoutes } from "./helpers/mock-api";

test.describe("Review retry (E2E)", () => {
  test("host sees fallback summary when report API fails", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(candidate);
    await candidate.clock.install();

    await installMockLlmRoutes(host);
    await host.unroute("**/api/interview-report");
    await host.route("**/api/interview-report", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated failure" }),
      });
    });
    await host.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await joinRoom(candidate, roomCode, "candidate", "Candidate");
    await completeHostSetup(host);
    await waitForPartyConnected(host);
    await waitForPartyConnected(candidate);

    await host.getByTestId("end-interview-btn").click();
    await host.getByTestId("confirm-end-interview").click();
    await expect(host.getByTestId("interview-review-panel")).toBeVisible({ timeout: 30_000 });
    await expect(host.getByTestId("interview-report-markdown")).toContainText("Summary unavailable", {
      timeout: 30_000,
    });

    await host.close();
    await candidate.close();
  });

  test("host can regenerate after API failure", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(candidate);
    await candidate.clock.install();

    await installMockLlmRoutes(host);
    await installFailThenSucceedReportRoute(
      host,
      "# Interview report (E2E mock)\n\nRegenerated successfully."
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
    await host.getByTestId("review-session-notes").fill(
      "Candidate demonstrated strong communication and solid fundamentals throughout the session today."
    );
    await host.getByTestId("regenerate-report-btn").click();
    await expect(host.getByTestId("interview-report-markdown")).toContainText("Regenerated successfully", {
      timeout: 30_000,
    });

    await host.close();
    await candidate.close();
  });
});
