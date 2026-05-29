import { test, expect } from "@playwright/test";
import {
  completeHostSetup,
  joinRoom,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installMockLlmRoutes } from "./helpers/mock-api";

test.describe("Host handoff (E2E)", () => {
  test("guest interviewer becomes host when original host leaves", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const guest = await browser.newPage();
    await installMockLlmRoutes(host);
    await installMockLlmRoutes(guest);
    await host.clock.install();
    await guest.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetup(host);
    await waitForPartyConnected(host);

    await joinRoom(guest, roomCode, "interviewer", "Guest");
    await waitForPartyConnected(guest);
    await expect(guest.getByTestId("end-interview-btn")).toHaveCount(0);

    await host.close();
    await expect(guest.getByTestId("end-interview-btn")).toBeVisible({ timeout: 30_000 });

    await guest.close();
  });
});
