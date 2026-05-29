import { test, expect } from "@playwright/test";
import { addTimeExtension, randomRoomCode, startLiveInterview } from "./helpers/room";

test.describe("60-minute time extension (E2E)", () => {
  test("host adds 1 hour after time is up; candidate sees extension banner", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await addTimeExtension(host, candidate, 60);

    await expect(host.getByText(/\+60 min added|\+1 hour added/i)).toBeVisible({ timeout: 15_000 });
    await expect(candidate.getByTestId("candidate-time-extension-banner")).toBeVisible({
      timeout: 15_000,
    });
    await expect(candidate.getByTestId("candidate-time-extension-banner")).toContainText(
      "added 60 more minutes"
    );

    await host.close();
    await candidate.close();
  });
});
