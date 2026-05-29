import { test, expect } from "@playwright/test";
import { assignCodingTask, randomRoomCode, startLiveInterview } from "./helpers/room";

const CODING_TASK_ID = "ct-fe-1";

test.describe("Coding task assign (E2E)", () => {
  test("host assigns task and candidate sees coding panel", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await assignCodingTask(host, CODING_TASK_ID);

    await expect(candidate.getByTestId("coding-task-panel")).toBeVisible({ timeout: 30_000 });
    await expect(candidate.getByRole("heading", { name: "Debounced Search Input" })).toBeVisible();

    await host.close();
    await candidate.close();
  });
});
