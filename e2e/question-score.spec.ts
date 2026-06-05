import { test, expect } from "@playwright/test";
import { randomRoomCode, sendQuestionAndScore, startLiveInterview } from "./helpers/room";

test.describe("Manual question score (E2E)", () => {
  test("host rates answer, score appears in panel and agent responds", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host } = await startLiveInterview(browser, roomCode);

    await sendQuestionAndScore(host, 8);

    await expect(host.getByTestId("question-scores-dock")).toContainText("8/10", { timeout: 15_000 });
    await expect(host.getByText("Next best question").first()).toBeVisible({ timeout: 20_000 });

    await host.close();
  });
});
