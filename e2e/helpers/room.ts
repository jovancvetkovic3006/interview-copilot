import { expect, type Browser, type Page } from "@playwright/test";
import { installMockLlmRoutes } from "./mock-api";

export function randomRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "E2E";
  for (let i = 0; i < 3; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** React controlled inputs + fake timers: fill alone can leave submit disabled. */
export async function fillJoinName(page: Page, name: string): Promise<void> {
  const nameInput = page.getByTestId("join-name");
  await nameInput.click();
  await nameInput.fill("");
  await nameInput.pressSequentially(name, { delay: 25 });
  await expect(nameInput).toHaveValue(name, { timeout: 5_000 });
}

export async function joinRoom(
  page: Page,
  roomCode: string,
  role: "interviewer" | "candidate",
  name: string
): Promise<void> {
  const path = role === "candidate" ? `/invite/${roomCode}` : `/interview/${roomCode}`;
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const nameInput = page.getByTestId("join-name");
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  const submit = page.getByTestId("join-submit");
  for (let attempt = 0; attempt < 8; attempt++) {
    await fillJoinName(page, name);
    if (await submit.isEnabled()) break;
    await page.waitForTimeout(200);
  }
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect(nameInput).toHaveCount(0, { timeout: 15_000 });
}

/** Re-submit join form after a reload when party state restores the session. */
export async function rejoinAfterReload(page: Page, name: string): Promise<void> {
  const nameInput = page.getByTestId("join-name");
  if (!(await nameInput.isVisible().catch(() => false))) return;
  const submit = page.getByTestId("join-submit");
  for (let attempt = 0; attempt < 8; attempt++) {
    await fillJoinName(page, name);
    if (await submit.isEnabled()) break;
    await page.waitForTimeout(200);
  }
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect(nameInput).toHaveCount(0, { timeout: 15_000 });
}

/** Walk setup wizard and start the interview (host only). */
export async function completeHostSetup(
  page: Page,
  candidateName = "E2E Candidate"
): Promise<void> {
  await expect(page.getByTestId("setup-next")).toBeVisible();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-candidate-name").fill(candidateName);
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-start").click();
  await expect(page.getByText("Start Interview")).toHaveCount(0);
}

/** Pin one question during setup (step 4 / preparation) then start. */
export async function completeHostSetupWithPinnedQuestion(
  page: Page,
  questionId: string,
  candidateName = "E2E Candidate"
): Promise<void> {
  await expect(page.getByTestId("setup-next")).toBeVisible();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-candidate-name").fill(candidateName);
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId(`setup-pin-question-${questionId}`).click();
  await page.getByTestId("setup-start").click();
  await expect(page.getByText("Start Interview")).toHaveCount(0);
}

/** Add an external PRE-TASK during setup (step 4 / coding tab) then start. */
export async function completeHostSetupWithExternalPreTask(
  page: Page,
  title = "E2E External Pretask",
  candidateName = "E2E Candidate"
): Promise<void> {
  await expect(page.getByTestId("setup-next")).toBeVisible();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-candidate-name").fill(candidateName);
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-prep-tab-coding").click();
  await page.getByTestId("setup-external-pretask-open").click();
  await page.getByTestId("setup-external-pretask-title").fill(title);
  await page.getByTestId("setup-external-pretask-solution").fill("function solve() {\n  return 42;\n}");
  await page.getByTestId("setup-external-pretask-add").click();
  await page.getByTestId("setup-start").click();
  await expect(page.getByText("Start Interview")).toHaveCount(0);
}

/** Upload a mocked CV during setup step 2, then start the interview. */
export async function completeHostSetupWithCv(
  page: Page,
  candidateName = "E2E Candidate"
): Promise<void> {
  await expect(page.getByTestId("setup-next")).toBeVisible();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-candidate-name").fill(candidateName);
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("setup-upload-btn").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "e2e-cv.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Jane Doe — React engineer with 8 years experience in TypeScript, performance optimization, and large-scale UI architecture."
    ),
  });
  await expect(page.getByText("e2e-cv.txt")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-start").click();
  await expect(page.getByText("Start Interview")).toHaveCount(0);
}

export async function waitForPartyConnected(page: Page): Promise<void> {
  await expect(page.getByTestId("party-connected")).toBeVisible({ timeout: 30_000 });
}

/** Host + candidate in an live interview (mocked LLM, PartyKit connected). */
export async function startLiveInterview(
  browser: Browser,
  roomCode: string
): Promise<{ host: Page; candidate: Page }> {
  const host = await browser.newPage();
  const candidate = await browser.newPage();
  await installMockLlmRoutes(host);
  await installMockLlmRoutes(candidate);
  await host.clock.install();
  await candidate.clock.install();

  await joinRoom(host, roomCode, "interviewer", "Host");
  await completeHostSetup(host);
  await waitForPartyConnected(host);

  await joinRoom(candidate, roomCode, "candidate", "Candidate");
  await waitForPartyConnected(candidate);

  return { host, candidate };
}

/** Fast-forward past the default 30-minute interview block. */
export async function expireInterviewTimer(host: Page, candidate: Page): Promise<void> {
  const ms = 31 * 60 * 1000;
  await host.clock.fastForward(ms);
  await candidate.clock.fastForward(ms);
  await expect(host.getByTestId("time-up-modal")).toBeVisible({ timeout: 20_000 });
  await expect(candidate.getByTestId("candidate-time-up-waiting")).toBeVisible({ timeout: 20_000 });
}

/** Host adds time after the block expires (30 or 60 minutes). */
export async function addTimeExtension(
  host: Page,
  candidate: Page,
  minutes: 30 | 60
): Promise<void> {
  await expireInterviewTimer(host, candidate);
  const btn = minutes === 30 ? "add-time-30" : "add-time-60";
  await host.getByTestId(btn).click();
  await expect(host.getByTestId("time-up-modal")).toHaveCount(0, { timeout: 15_000 });
  await expect(candidate.getByTestId("candidate-time-up-waiting")).toHaveCount(0, { timeout: 15_000 });
}

export async function assignExternalPreTaskInRoom(host: Page, title: string): Promise<void> {
  const toggle = host.getByTestId("sidebar-tasks-toggle");
  const row = host.locator("div").filter({ hasText: title }).first();
  await toggle.click();
  if (!(await row.getByRole("button", { name: "Open" }).isVisible().catch(() => false))) {
    await toggle.click();
  }
  await row.getByRole("button", { name: "Open" }).click({ force: true });
}

export async function assignQuiz(page: Page, templateId: string): Promise<void> {
  const toggle = page.getByTestId("sidebar-quizzes-toggle");
  const assignBtn = page.getByTestId(`assign-quiz-${templateId}`);
  await toggle.click();
  if (!(await assignBtn.isVisible().catch(() => false))) {
    await toggle.click();
  }
  await assignBtn.click();
  await expect(page.getByTestId("quiz-results-waiting").first()).toBeVisible({
    timeout: 15_000,
  });
}

export async function assignCodingTask(page: Page, taskId: string): Promise<void> {
  const toggle = page.getByTestId("sidebar-tasks-toggle");
  const btn = page.getByTestId(`assign-coding-${taskId}`).first();
  await toggle.click();
  if (!(await btn.isVisible().catch(() => false))) {
    await toggle.click();
  }
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
}

/** Answer every question by picking the first option until the completion screen appears. */
export async function completeLiveQuiz(page: Page, maxQuestions = 12): Promise<void> {
  await page.bringToFront();
  await expect(page.getByTestId("live-quiz-panel")).toBeVisible({ timeout: 30_000 });

  const startBtn = page.getByTestId("quiz-start-btn");
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click();
  }

  for (let i = 0; i < maxQuestions; i++) {
    if (await page.getByTestId("quiz-complete").isVisible()) {
      return;
    }
    const option = page.getByTestId("quiz-option-0");
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    await page.waitForTimeout(400);
  }

  await expect(page.getByTestId("quiz-complete")).toBeVisible({ timeout: 30_000 });
}

/** Host sends first sidebar question and rates the answer (triggers agent notify). */
export async function sendQuestionAndScore(page: Page, score = 8): Promise<void> {
  const sendBtn = page.getByTestId("send-question-btn").first();
  await sendBtn.scrollIntoViewIfNeeded();
  await sendBtn.click({ force: true });
  await expect(page.getByTestId("question-score-prompt")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`question-score-${score}`).click();
  const scoresPanel = page.getByTestId("question-scores-panel").first();
  await expect(scoresPanel).toBeVisible({ timeout: 15_000 });
  await expect(scoresPanel).toContainText(`${score}/10`);
}

/** Host ends interview and waits for mocked report on review screen. */
export async function endInterviewAndWaitForReport(
  host: Page,
  notes?: string
): Promise<void> {
  await host.getByTestId("end-interview-btn").click();
  await expect(host.getByTestId("end-interview-modal")).toBeVisible();
  if (notes) {
    await host.getByTestId("end-interview-notes").fill(notes);
  }
  await host.getByTestId("confirm-end-interview").click();
  await expect(host.getByTestId("interview-review-panel")).toBeVisible({ timeout: 30_000 });
  await expect(host.getByTestId("interview-review-title")).toBeVisible();
  await expect(host.getByTestId("interview-report-markdown")).toContainText("E2E mock", {
    timeout: 30_000,
  });
}
