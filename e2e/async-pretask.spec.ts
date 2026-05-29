import { test, expect } from "@playwright/test";

test.describe("Async pre-task (E2E)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("create take-home task, candidate submits, manage shows submission", async ({ browser }) => {
    const host = await browser.newPage();
    const candidate = await browser.newPage();

    await host.goto("/task/new", { waitUntil: "domcontentloaded" });
    const titleInput = host.getByPlaceholder("e.g. Implement a debounce utility");
    await titleInput.click();
    await titleInput.fill("");
    await titleInput.pressSequentially("E2E Pretask", { delay: 25 });
    await host
      .getByPlaceholder("Explain the requirements")
      .fill("Implement a function that returns the sum of two numbers.");
    await host.getByPlaceholder("function debounce").fill("function add(a, b) {\n  return a + b;\n}");
    const createBtn = host.getByTestId("create-pretask-btn");
    await expect(createBtn).toBeEnabled({ timeout: 15_000 });
    await createBtn.click();

    await expect(host).toHaveURL(/\/task\/[A-Z0-9]+\/manage/i, { timeout: 30_000 });
    const candidateUrl = await host
      .locator("div.rounded-lg.border")
      .filter({ has: host.getByText("Candidate link", { exact: true }) })
      .locator(".font-mono")
      .textContent();
    expect(candidateUrl?.trim()).toMatch(/\/task\//i);

    await candidate.goto(candidateUrl!.trim(), { waitUntil: "domcontentloaded" });
    await expect(candidate.getByText("E2E Pretask")).toBeVisible({ timeout: 30_000 });
    await candidate.getByTestId("pretask-submit-btn").click();

    await expect(candidate.getByTestId("pretask-submitted-title")).toBeVisible({ timeout: 30_000 });
    await expect(host.getByText("Submitted")).toBeVisible({ timeout: 30_000 });

    await host.close();
    await candidate.close();
  });
});
