import { test, expect } from "@playwright/test";
import { randomRoomCode, sendQuestionAndScore, startLiveInterview } from "./helpers/room";

test.describe("Question re-score (E2E)", () => {
  test("changing a score updates the entry without duplicating", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host } = await startLiveInterview(browser, roomCode);

    await sendQuestionAndScore(host, 8);
    await expect(host.getByText("Question scores (1)").first()).toBeVisible({ timeout: 10_000 });

    await host.getByTestId("question-rescore-btn").first().click();
    await expect(host.getByTestId("question-score-prompt")).toBeVisible({ timeout: 10_000 });
    await host.getByTestId("question-score-6").click();

    const panel = host.getByTestId("question-scores-panel").first();
    await expect(panel).toContainText("6/10");
    await expect(host.getByText("Question scores (1)").first()).toBeVisible();
    await expect(panel.getByText("8/10")).toHaveCount(0);

    await host.close();
  });
});
