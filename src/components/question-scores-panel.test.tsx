import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionScoresPanel } from "./question-scores-panel";
import type { QuestionScoreEntry } from "@/types/room";

const scores: QuestionScoreEntry[] = [
  {
    id: "qs-1",
    question: "What is a closure?",
    score: 7,
    scoredAt: new Date("2026-05-28T15:00:00Z").getTime(),
    category: "javascript",
  },
];

describe("QuestionScoresPanel", () => {
  it("renders nothing when there are no scores yet", () => {
    const { container } = render(<QuestionScoresPanel scores={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists scored questions so interviewer can see history during the interview", () => {
    render(<QuestionScoresPanel scores={scores} />);

    expect(screen.getByText("Question scores")).toBeInTheDocument();
    expect(screen.getByText("What is a closure?")).toBeInTheDocument();
    expect(screen.getByText(/7\/10/)).toBeInTheDocument();
    expect(screen.getByText("javascript")).toBeInTheDocument();
  });

  it("offers change score when interviewer wants to re-rate", async () => {
    const user = userEvent.setup();
    const onRescore = vi.fn();

    render(<QuestionScoresPanel scores={scores} onRescore={onRescore} />);

    await user.click(screen.getByRole("button", { name: /Change score/i }));

    expect(onRescore).toHaveBeenCalledWith(scores[0]);
  });
});
