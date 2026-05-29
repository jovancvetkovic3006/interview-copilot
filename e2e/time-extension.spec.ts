import { test, expect } from "@playwright/test";
import {
  expireInterviewTimer,
  randomRoomCode,
  startLiveInterview,
} from "./helpers/room";

test.describe("Time extension (E2E)", () => {
  test("host adds 30 minutes after time is up; candidate sees extension banner", async ({
    browser,
  }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await expireInterviewTimer(host, candidate);

    await host.getByTestId("add-time-30").click();
    await expect(host.getByTestId("time-up-modal")).toHaveCount(0, { timeout: 15_000 });
    await expect(host.getByText(/\+30 min added/)).toBeVisible({ timeout: 15_000 });

    await expect(candidate.getByTestId("candidate-time-extension-banner")).toBeVisible({
      timeout: 15_000,
    });
    await expect(candidate.getByTestId("candidate-time-extension-banner")).toContainText(
      "added 30 more minutes"
    );
    await expect(candidate.getByTestId("candidate-time-up-waiting")).toHaveCount(0);
    await expect(candidate.getByText("Time's up")).toHaveCount(0);

    await host.close();
    await candidate.close();
  });
});
