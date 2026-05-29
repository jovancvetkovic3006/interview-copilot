import { test, expect } from "@playwright/test";
import { randomRoomCode, startLiveInterview } from "./helpers/room";

test.describe("Invite links (E2E)", () => {
  test("host copies candidate invite link from dropdown", async ({ browser }) => {
    const context = await browser.newContext();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const roomCode = randomRoomCode();

    const host = await context.newPage();
    const candidate = await context.newPage();
    const { installMockLlmRoutes } = await import("./helpers/mock-api");
    await installMockLlmRoutes(host);
    await installMockLlmRoutes(candidate);
    await host.clock.install();
    await candidate.clock.install();

    const { joinRoom, completeHostSetup, waitForPartyConnected } = await import("./helpers/room");
    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetup(host);
    await waitForPartyConnected(host);

    await host.getByTestId("invite-dropdown-btn").click();
    await host.getByTestId("invite-link-candidate").click();

    const clipboard = await host.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.toLowerCase()).toContain(`/invite/${roomCode.toLowerCase()}`);

    await context.close();
  });
});
