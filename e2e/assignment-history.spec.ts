import { test, expect } from "@playwright/test";
import {
  assignCodingTask,
  assignQuiz,
  completeLiveQuiz,
  randomRoomCode,
  startLiveInterview,
} from "./helpers/room";

const QUIZ_TEMPLATE_ID = "e2e-smoke";
const CODING_TASK_ID = "ct-fe-1";

test.describe("Assignment history (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("host switches between completed quiz and coding task via history strip", async ({
    browser,
  }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await assignQuiz(host, QUIZ_TEMPLATE_ID);
    await completeLiveQuiz(candidate);

    await assignCodingTask(host, CODING_TASK_ID);
    await expect(candidate.getByTestId("coding-task-panel")).toBeVisible({ timeout: 30_000 });

    const quizHistoryBtn = host.getByRole("button", { name: /E2E Smoke Quiz/i }).first();
    await expect(quizHistoryBtn).toBeVisible({ timeout: 15_000 });
    await quizHistoryBtn.click();

    await expect(host.getByTestId("quiz-results-complete").first()).toBeVisible({
      timeout: 15_000,
    });

    const codingHistoryBtn = host.getByRole("button", { name: /Debounced Search Input/i }).first();
    await codingHistoryBtn.click();
    await expect(host.getByText("Debounced Search Input").first()).toBeVisible({ timeout: 15_000 });

    await host.close();
    await candidate.close();
  });
});
