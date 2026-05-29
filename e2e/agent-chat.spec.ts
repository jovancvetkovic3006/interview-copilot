import { test, expect } from "@playwright/test";
import { randomRoomCode, startLiveInterview } from "./helpers/room";

test.describe("Agent chat (E2E)", () => {
  test("host message to agent receives mocked reply", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const { host } = await startLiveInterview(browser, roomCode);

    await host.getByTestId("chat-input").fill("What should I ask about React hooks?");
    await host.getByTestId("chat-send").click();

    await expect(host.getByText("Next best question").first()).toBeVisible({ timeout: 20_000 });

    await host.close();
  });
});
