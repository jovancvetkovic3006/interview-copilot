import { test, expect } from "@playwright/test";
import {
  assignQuiz,
  completeLiveQuiz,
  openQaDrawer,
  randomRoomCode,
  startLiveInterview,
} from "./helpers/room";

const QUIZ_TEMPLATE_ID = "e2e-smoke";

test.describe("Live quiz flow (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("host assigns quiz, candidate completes, host sees score", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await assignQuiz(host, QUIZ_TEMPLATE_ID);

    await expect(candidate.getByTestId("live-quiz-panel")).toBeVisible({ timeout: 30_000 });
    await completeLiveQuiz(candidate);

    await openQaDrawer(host);
    await host.getByTestId("sidebar-quizzes-toggle").click();
    await expect(host.getByTestId("quiz-results-complete").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(host.getByText(/\d+\/2/)).toBeVisible({ timeout: 10_000 });

    await host.close();
    await candidate.close();
  });
});
