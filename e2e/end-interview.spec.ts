import { test, expect } from "@playwright/test";
import {
  endInterviewAndWaitForReport,
  joinRoom,
  randomRoomCode,
  startLiveInterview,
} from "./helpers/room";
import { installMockLlmRoutesWithReportCapture } from "./helpers/mock-api";

test.describe("End interview & report (E2E)", () => {
  test("host ends interview; report renders and candidate sees thank-you", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await endInterviewAndWaitForReport(host);

    await expect(candidate.getByTestId("candidate-thanks-title")).toBeVisible({
      timeout: 30_000,
    });

    await host.close();
    await candidate.close();
  });

  test("session notes from end modal are sent in report payload", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    const { getLastReportBody } = await installMockLlmRoutesWithReportCapture(host);
    const { installMockLlmRoutes } = await import("./helpers/mock-api");
    await installMockLlmRoutes(candidate);
    await host.clock.install();
    await candidate.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    const { completeHostSetup, waitForPartyConnected } = await import("./helpers/room");
    await completeHostSetup(host);
    await waitForPartyConnected(host);
    await joinRoom(candidate, roomCode, "candidate", "Candidate");
    await waitForPartyConnected(candidate);

    const notes =
      "Strong communicator with solid system design instincts and clear trade-off reasoning.";
    await endInterviewAndWaitForReport(host, notes);

    expect(getLastReportBody()?.interviewerSessionNotes).toBe(notes);

    await host.close();
    await candidate.close();
  });
});
