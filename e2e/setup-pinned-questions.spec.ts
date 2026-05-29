import { test, expect } from "@playwright/test";
import {
  completeHostSetupWithPinnedQuestion,
  joinRoom,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installMockLlmRoutes } from "./helpers/mock-api";

const PINNED_QUESTION_ID = "fe-1";

test.describe("Setup pinned questions (E2E)", () => {
  test("pinned question appears in host sidebar with send button", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    await installMockLlmRoutes(host);
    await host.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetupWithPinnedQuestion(host, PINNED_QUESTION_ID);
    await waitForPartyConnected(host);

    await expect(host.getByText("Pinned at setup").first()).toBeVisible({ timeout: 15_000 });
    await expect(host.getByTestId("send-question-btn").first()).toBeVisible();

    await host.close();
  });
});
