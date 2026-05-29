import { test, expect } from "@playwright/test";
import {
  completeHostSetup,
  joinRoom,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installMockLlmRoutes } from "./helpers/mock-api";

test.describe("Phase sync (E2E)", () => {
  test("candidate waiting room clears when host starts interview", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(host);
    await installMockLlmRoutes(candidate);

    await joinRoom(candidate, roomCode, "candidate", "Candidate");
    await expect(candidate.getByTestId("waiting-to-start")).toBeVisible({ timeout: 15_000 });

    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetup(host);
    await waitForPartyConnected(host);
    await waitForPartyConnected(candidate);

    await expect(candidate.getByTestId("waiting-to-start")).toHaveCount(0, { timeout: 30_000 });
    await expect(candidate.getByTestId("candidate-waiting-assignment")).toBeVisible({
      timeout: 30_000,
    });

    await host.close();
    await candidate.close();
  });
});
