import { test, expect } from "@playwright/test";
import { installMockLlmRoutes } from "./helpers/mock-api";
import { joinRoom, randomRoomCode } from "./helpers/room";

test.describe("Interview lobby", () => {
  test.beforeEach(async ({ page }) => {
    await installMockLlmRoutes(page);
  });

  test("home redirects to lobby and can create a room", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/interview$/);
    await expect(page.getByRole("heading", { name: "Collaborative Interview" })).toBeVisible();
    await page.getByRole("button", { name: "Start New Interview" }).click();
    await expect(page).toHaveURL(/\/interview\/[A-Z0-9]{6}$/);
    await expect(page.getByRole("heading", { name: "Join Interview" })).toBeVisible();
  });

  test("manual code entry routes candidate to invite page", async ({ page }) => {
    await page.goto("/interview");
    await page.getByPlaceholder("ABC123").fill("TEST99");
    await page.getByRole("button", { name: "Join as candidate" }).click();
    await expect(page).toHaveURL("/invite/TEST99");
    await expect(page.getByRole("heading", { name: "Join Interview" })).toBeVisible();
  });

  test("host and candidate can join the same room", async ({ browser }) => {
    const roomCode = randomRoomCode();
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(host);
    await installMockLlmRoutes(candidate);

    await joinRoom(host, roomCode, "interviewer", "Host");
    await joinRoom(candidate, roomCode, "candidate", "Candidate");

    await expect(host.getByText(roomCode)).toBeVisible();
    await expect(candidate.getByText(roomCode)).toBeVisible();
    await expect(candidate.getByText("Waiting for the interviewer")).toBeVisible();

    await host.close();
    await candidate.close();
  });
});
