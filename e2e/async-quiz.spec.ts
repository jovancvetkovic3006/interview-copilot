import { test, expect } from "@playwright/test";
import { installMockLlmRoutes } from "./helpers/mock-api";

const QUIZ_TEMPLATE_ID = "e2e-smoke";

test.describe("Async quiz (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("create quiz, candidate submits, manage page shows score", async ({ browser }) => {
    const host = await browser.newPage();
    const candidate = await browser.newPage();
    await installMockLlmRoutes(host);
    await installMockLlmRoutes(candidate);

    await host.goto("/quiz/new", { waitUntil: "domcontentloaded" });
    await host.getByTestId(`quiz-template-${QUIZ_TEMPLATE_ID}`).click();
    await host.getByTestId("create-quiz-btn").click();

    await expect(host).toHaveURL(/\/quiz\/[A-Z0-9]+\/manage/i, { timeout: 30_000 });
    const manageUrl = host.url();
    const code = manageUrl.match(/\/quiz\/([A-Z0-9]+)\/manage/i)?.[1];
    expect(code).toBeTruthy();

    const shareInput = host.locator('input[readonly][class*="font-mono"]').first();
    const candidateUrl = await shareInput.inputValue();
    await candidate.goto(candidateUrl, { waitUntil: "domcontentloaded" });

    await candidate.getByPlaceholder("Enter your name").fill("Async Candidate");
    await candidate.getByTestId("async-quiz-start-btn").click();
    await expect(candidate.getByTestId("quiz-start-btn")).toBeVisible({ timeout: 15_000 });
    await candidate.getByTestId("quiz-start-btn").click();

    for (let q = 0; q < 2; q++) {
      await expect(candidate.getByTestId("quiz-option-0")).toBeVisible({ timeout: 15_000 });
      await candidate.getByTestId("quiz-option-0").click();
      await candidate.waitForTimeout(600);
    }
    await expect(candidate.getByRole("heading", { name: "Quiz submitted" })).toBeVisible({
      timeout: 30_000,
    });

    await expect(host.getByTestId("async-quiz-submitted")).toBeVisible({ timeout: 30_000 });
    await expect(host.getByText(/Score:/)).toBeVisible();

    await host.close();
    await candidate.close();
  });
});
