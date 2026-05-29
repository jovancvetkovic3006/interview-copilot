import { test, expect } from "@playwright/test";
import {
  completeHostSetup,
  joinRoom,
  randomRoomCode,
  rejoinAfterReload,
  waitForPartyConnected,
} from "./helpers/room";
import { installMockLlmRoutes } from "./helpers/mock-api";

test.describe("Multi-tab reconnect (E2E)", () => {
  test("host reloads and rejoins the live interview without setup", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const context = await browser.newContext();
    const host = await context.newPage();
    await installMockLlmRoutes(host);
    await host.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetup(host);
    await waitForPartyConnected(host);
    await expect(host.getByTestId("chat-input")).toBeVisible({ timeout: 15_000 });

    await host.reload({ waitUntil: "domcontentloaded" });
    await installMockLlmRoutes(host);
    await rejoinAfterReload(host, "Host");

    await expect(host.getByTestId("setup-next")).toHaveCount(0, { timeout: 30_000 });
    await expect(host.getByTestId("chat-input")).toBeVisible({ timeout: 30_000 });
    await waitForPartyConnected(host);

    await context.close();
  });
});
