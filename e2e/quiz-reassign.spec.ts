import { test, expect } from "@playwright/test";
import {
  assignQuiz,
  completeLiveQuiz,
  randomRoomCode,
  startLiveInterview,
} from "./helpers/room";

const QUIZ_TEMPLATE_ID = "e2e-smoke";

test.describe("Quiz re-assign (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("host assigns a second quiz while first remains in history", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await assignQuiz(host, QUIZ_TEMPLATE_ID);
    await completeLiveQuiz(candidate);

    await assignQuiz(host, QUIZ_TEMPLATE_ID);
    await expect(candidate.getByTestId("live-quiz-panel")).toBeVisible({ timeout: 30_000 });

    const quizButtons = host.getByRole("button", { name: /E2E Smoke Quiz/i });
    await expect(quizButtons).toHaveCount(2, { timeout: 15_000 });

    await host.close();
    await candidate.close();
  });
});
