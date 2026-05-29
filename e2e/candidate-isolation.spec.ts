import { test, expect } from "@playwright/test";
import { randomRoomCode, startLiveInterview } from "./helpers/room";

test.describe("Candidate isolation (E2E)", () => {
  test("candidate has no agent chat UI", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host, candidate } = await startLiveInterview(browser, roomCode);

    await expect(candidate.getByTestId("chat-input")).toHaveCount(0);
    await expect(candidate.getByPlaceholder("Type a message (sends to AI agent)")).toHaveCount(0);
    await expect(candidate.getByText("AI Agent")).toHaveCount(0);

    await host.getByTestId("chat-input").fill("Hello agent from host");
    await host.getByTestId("chat-send").click();
    await expect(host.getByText("Next best question").first()).toBeVisible({ timeout: 20_000 });

    await expect(candidate.getByText("Next best question")).toHaveCount(0);
    await expect(candidate.getByText("Hello agent from host")).toHaveCount(0);

    await host.close();
    await candidate.close();
  });
});
