import { test, expect } from "@playwright/test";
import {
  completeHostSetup,
  joinRoom,
  randomRoomCode,
  rejoinAfterReload,
  waitForPartyConnected,
} from "./helpers/room";
import { installDelayedReportRoute, installMockLlmRoutes, MOCK_REPORT } from "./helpers/mock-api";

const SESSION_NOTES =
  "Candidate demonstrated strong communication and solid fundamentals throughout the session today.";

test.describe("Report retry after refresh (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("host can regenerate or retry report after refresh during generation", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(candidate);
    await candidate.clock.install();

    await installMockLlmRoutes(host);
    const { release } = await installDelayedReportRoute(host);
    await host.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await joinRoom(candidate, roomCode, "candidate", "Candidate");
    await completeHostSetup(host);
    await waitForPartyConnected(host);
    await waitForPartyConnected(candidate);

    await host.getByTestId("end-interview-btn").click();
    await host.getByTestId("confirm-end-interview").click();
    await expect(host.getByText("Generating summary with AI")).toBeVisible({ timeout: 15_000 });

    await host.reload({ waitUntil: "domcontentloaded" });
    release();
    await installMockLlmRoutes(host);
    await rejoinAfterReload(host, "Host");

    await expect(host.getByTestId("interview-review-panel")).toBeVisible({ timeout: 30_000 });

    const notes = host.getByTestId("review-session-notes");
    if (await notes.isVisible().catch(() => false)) {
      await notes.fill(SESSION_NOTES);
    }

    const retry = host.getByTestId("retry-report-btn");
    const regenerate = host.getByTestId("regenerate-report-btn");
    if (await retry.isVisible().catch(() => false)) {
      await expect(retry).toBeEnabled({ timeout: 10_000 });
      await retry.click();
    } else if (await regenerate.isVisible().catch(() => false)) {
      await expect(regenerate).toBeEnabled({ timeout: 10_000 });
      await regenerate.click();
    } else {
      throw new Error("Expected retry-report-btn or regenerate-report-btn on review screen");
    }

    await expect(host.getByTestId("interview-report-markdown")).toContainText(
      MOCK_REPORT.markdown,
      { timeout: 30_000 }
    );

    await host.close();
    await candidate.close();
  });
});
