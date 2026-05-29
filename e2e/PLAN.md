# E2E test plan

Run: `npm run test:e2e` (starts Next.js + PartyKit, mocks LLM APIs).

## Done — batch 1

| # | Flow | Spec |
|---|------|------|
| ✓ | Lobby: create room, candidate invite route, dual join | `lobby.spec.ts` |
| ✓ | Live quiz: assign → candidate completes → host score | `quiz-flow.spec.ts` |
| ✓ | Time extension after block ends | `time-extension.spec.ts` |
| ✓ | Manual question score + agent chat | `question-score.spec.ts` |
| ✓ | End interview → report + candidate thank-you | `end-interview.spec.ts` |

## Done — batch 2

| # | Flow | Spec |
|---|------|------|
| ✓ | Coding task assign → candidate sees task | `coding-task.spec.ts` |
| ✓ | Assignment history: quiz ↔ coding switch | `assignment-history.spec.ts` |
| ✓ | Ask agent to review quiz | `quiz-agent-review.spec.ts` |
| ✓ | Re-score without duplicate | `question-rescore.spec.ts` |
| ✓ | Second interviewer (non-host) | `multi-interviewer.spec.ts` |
| ✓ | Candidate isolation (no agent UI/messages) | `candidate-isolation.spec.ts` |
| ✓ | Setup → interview phase sync | `phase-sync.spec.ts` |
| ✓ | End interview with session notes in report payload | `end-interview.spec.ts` |
| ✓ | Time extension clears candidate waiting banner | `time-extension.spec.ts` |
| ✓ | Host chat → agent reply | `agent-chat.spec.ts` |
| ✓ | Pin question at setup → sidebar send | `setup-pinned-questions.spec.ts` |
| ✓ | Invite links dropdown | `invite-links.spec.ts` |
| ✓ | Report API failure → fallback summary | `review-retry.spec.ts` |
| ✓ | Async quiz create → candidate submit | `async-quiz.spec.ts` |
| ✓ | Take-home pre-task create → submit | `async-pretask.spec.ts` |

## Done — batch 3

| # | Flow | Spec |
|---|------|------|
| ✓ | 60-minute time extension | `time-extension-60.spec.ts` |
| ✓ | Host handoff when host leaves | `host-handoff.spec.ts` |
| ✓ | Host reload + rejoin live session | `multi-tab-reconnect.spec.ts` |
| ✓ | Second live quiz in history | `quiz-reassign.spec.ts` |
| ✓ | External PRE-TASK opens in room editor | `external-pretask.spec.ts` |
| ✓ | Review candidate code → agent | `review-candidate-code.spec.ts` |
| ✓ | CV upload at setup → CV insights panel | `cv-insights.spec.ts` |
| ✓ | Regenerate report requires session notes (no transcript) | `report-notes-required.spec.ts` |
| ✓ | Report retry/regenerate after refresh mid-generation | `report-retry-refresh.spec.ts` |
| ✓ | Regenerate after API failure | `review-retry.spec.ts` |

**31 tests** total (~1.5 min locally, `workers: 1`).

## Deferred (unit/integration or manual only)

- Speech transcription + analyze-transcript (flaky STT in CI)
- Yjs collaborative editor two-user typing sync
- Real CV PDF parsing (E2E uses mocked `/api/parse-cv` + `/api/cv-suggestions`)
- PDF download on review
- Real Anthropic calls

## Gaps / next

| Area | Notes |
|------|--------|
| **Playwright parallelism** | `workers: 1` today; shard when PartyKit port isolation is sorted |
| **STT + analyze-transcript E2E** | Needs deterministic audio fixture or server-side stub |
| **Yjs two-user sync** | Second browser editing same doc |
| **PDF download** | Assert file bytes / filename on review screen |
| **Real API smoke** | Optional nightly job with secrets, not PR gate |

## Helpers

- `e2e/helpers/room.ts` — join, setup, assign quiz/coding, extensions, CV upload, rejoin
- `e2e/helpers/mock-api.ts` — LLM stubs, report capture, delayed report, CV mocks, `installFailThenSucceedReportRoute`

## Product fixes surfaced by E2E

- `InterviewReviewPanel`: `onClick={() => void onRetryReport()}` so React does not pass the click event as `notesOverride`
- `assignQuiz` / sidebar toggles: avoid collapsing an open section on second click
