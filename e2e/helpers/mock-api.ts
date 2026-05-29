import type { Page } from "@playwright/test";

const MOCK_REPORT = {
  markdown: "# Interview report (E2E mock)\n\nSummary generated without calling Anthropic.",
};

/** Stub Anthropic-backed routes so E2E does not need API keys. */
export async function installMockLlmRoutes(page: Page): Promise<void> {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content:
          "**Next best question:** Walk me through how you structured the solution.\n\n**Quiz summary:** Review wrong answers before moving on.",
      }),
    });
  });

  await page.route("**/api/analyze-transcript", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "Candidate gave a structured answer with reasonable depth.",
        score: 7,
        answerQuality: "adequate",
        followUpQuestions: ["What trade-offs did you consider?"],
      }),
    });
  });

  await page.route("**/api/interview-report", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_REPORT),
    });
  });

  await page.route("**/api/summarize-transcript", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: "## Spoken summary (mock)\n\nCandidate discussed architecture." }),
    });
  });
}

/** Capture the last POST body sent to /api/interview-report. */
export async function installMockLlmRoutesWithReportCapture(
  page: Page
): Promise<{ getLastReportBody: () => Record<string, unknown> | null }> {
  let lastBody: Record<string, unknown> | null = null;

  await installMockLlmRoutes(page);

  await page.unroute("**/api/interview-report");
  await page.route("**/api/interview-report", async (route) => {
    try {
      lastBody = route.request().postDataJSON() as Record<string, unknown>;
    } catch {
      lastBody = null;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_REPORT),
    });
  });

  return { getLastReportBody: () => lastBody };
}

/**
 * Hold the first interview-report request until released (simulates refresh before report completes).
 */
export async function installDelayedReportRoute(page: Page): Promise<{ release: () => void }> {
  let releaseFn: (() => void) | null = null;
  const releasePromise = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  await page.unroute("**/api/interview-report").catch(() => {});
  await page.route("**/api/interview-report", async (route) => {
    await releasePromise;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_REPORT),
    });
  });

  return {
    release: () => releaseFn?.(),
  };
}

const MOCK_CV_TEXT =
  "Jane Doe — Senior Frontend Engineer with 8 years React, TypeScript, and performance optimization experience.";

/** Stub CV parse + suggestions for E2E (no real PDF parsing or Anthropic). */
export async function installCvMocks(page: Page): Promise<void> {
  await page.route("**/api/parse-cv", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: MOCK_CV_TEXT.repeat(3),
        fileName: "e2e-cv.txt",
      }),
    });
  });

  await page.route("**/api/cv-suggestions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questions: [
          {
            question: "Tell me about your React performance work at scale.",
            category: "React",
            rationale: "CV mentions performance optimization.",
          },
        ],
        codingTasks: [],
        topicsToProbe: ["React", "TypeScript"],
      }),
    });
  });
}

/** Fail the first N interview-report requests, then return success markdown. */
export async function installFailThenSucceedReportRoute(
  page: Page,
  successMarkdown: string,
  failCount = 1
): Promise<void> {
  let calls = 0;
  await page.unroute("**/api/interview-report").catch(() => {});
  await page.route("**/api/interview-report", async (route) => {
    calls += 1;
    if (calls <= failCount) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ markdown: successMarkdown }),
    });
  });
}

export { MOCK_REPORT };
