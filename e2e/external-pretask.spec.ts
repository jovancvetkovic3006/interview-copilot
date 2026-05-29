import { test, expect } from "@playwright/test";
import {
  assignExternalPreTaskInRoom,
  completeHostSetupWithExternalPreTask,
  joinRoom,
  randomRoomCode,
  waitForPartyConnected,
} from "./helpers/room";
import { installMockLlmRoutes } from "./helpers/mock-api";

const PRETASK_TITLE = "E2E External Pretask";

test.describe("External pre-task in room (E2E)", () => {
  test("setup PRE-TASK opens in shared editor with candidate solution badge", async ({
    browser,
  }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(host);
    await installMockLlmRoutes(candidate);
    await host.clock.install();
    await candidate.clock.install();

    await joinRoom(host, roomCode, "interviewer", "Host");
    await completeHostSetupWithExternalPreTask(host, PRETASK_TITLE);
    await waitForPartyConnected(host);

    await joinRoom(candidate, roomCode, "candidate", "Candidate");
    await waitForPartyConnected(candidate);

    await assignExternalPreTaskInRoom(host, PRETASK_TITLE);

    await expect(candidate.getByTestId("coding-task-panel")).toBeVisible({ timeout: 30_000 });
    await expect(candidate.getByRole("heading", { name: PRETASK_TITLE })).toBeVisible();
    await expect(candidate.getByText("PRE-TASK · candidate solution")).toBeVisible();

    await host.close();
    await candidate.close();
  });
});
