import { test, expect } from "@playwright/test";
import {
  completeHostSetup,
  joinRoom,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installMockLlmRoutes } from "./helpers/mock-api";

test.describe("Multi-interviewer (E2E)", () => {
  test("second interviewer joins live session without setup wizard", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const guest = await browser.newPage();
    await installMockLlmRoutes(host);
    await installMockLlmRoutes(guest);

    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetup(host);
    await waitForPartyConnected(host);

    await joinRoom(guest, roomCode, "interviewer", "Guest Interviewer");
    await waitForPartyConnected(guest);

    await expect(guest.getByTestId("setup-next")).toHaveCount(0);
    await expect(guest.getByTestId("chat-input")).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByTestId("end-interview-btn")).toHaveCount(0);

    await host.close();
    await guest.close();
  });
});
