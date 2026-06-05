import { test, expect } from "@playwright/test";
import {
  completeHostSetupWithCv,
  joinRoom,
  openQaDrawer,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installCvMocks, installMockLlmRoutes } from "./helpers/mock-api";

test.describe("CV insights panel (E2E)", () => {
  test("host sees tailored questions after uploading CV at setup", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    await installMockLlmRoutes(host);
    await installCvMocks(host);
    await host.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetupWithCv(host);
    await waitForPartyConnected(host);

    await openQaDrawer(host);
    await host.getByTestId("sidebar-cv-toggle").click();
    await expect(host.getByTestId("cv-suggestions-panel")).toBeVisible({ timeout: 15_000 });
    await expect(host.getByTestId("cv-suggestions-loaded")).toBeVisible({ timeout: 30_000 });
    await expect(host.getByText("Tell me about your React performance work at scale.")).toBeVisible();

    await host.close();
  });
});
