import { test, expect } from "@playwright/test";
import {
  assignQuiz,
  completeLiveQuiz,
  randomRoomCode,
  startLiveInterview,
} from "./helpers/room";

const QUIZ_TEMPLATE_ID = "e2e-smoke";

test.describe("Quiz agent review (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("host asks agent to review completed quiz", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await assignQuiz(host, QUIZ_TEMPLATE_ID);
    await completeLiveQuiz(candidate);

    await host.getByTestId("review-quiz-btn").first().click();
    await expect(host.getByText("Quiz summary").first()).toBeVisible({ timeout: 20_000 });

    await host.close();
    await candidate.close();
  });
});
