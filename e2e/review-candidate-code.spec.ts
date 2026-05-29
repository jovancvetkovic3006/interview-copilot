import { test, expect } from "@playwright/test";
import { assignCodingTask, randomRoomCode, startLiveInterview } from "./helpers/room";

const CODING_TASK_ID = "ct-fe-1";

test.describe("Review candidate code (E2E)", () => {
  test("host sends shared editor code to agent for feedback", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await assignCodingTask(host, CODING_TASK_ID);
    await expect(candidate.getByTestId("coding-task-panel")).toBeVisible({ timeout: 30_000 });
    await host.waitForTimeout(2000);

    await host.getByTestId("review-candidate-code-btn").click();
    await expect(host.getByText("Requested AI review of the candidate's current solution").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(host.getByText("Next best question").first()).toBeVisible({ timeout: 20_000 });

    await host.close();
    await candidate.close();
  });
});
