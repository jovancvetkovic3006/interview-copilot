import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionScorePrompt } from "./question-score-prompt";

describe("QuestionScorePrompt", () => {
  it("asks interviewer to rate a freshly asked question", () => {
    render(
      <QuestionScorePrompt
        question="How would you design a cache?"
        onScore={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("Rate the answer")).toBeInTheDocument();
    expect(screen.queryByText(/was /)).not.toBeInTheDocument();
  });

  it("shows update mode when changing an existing score", () => {
    render(
      <QuestionScorePrompt
        question="How would you design a cache?"
        previousScore={5}
        onScore={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("Update the score")).toBeInTheDocument();
    expect(screen.getByText(/was Adequate/)).toBeInTheDocument();
  });

  it("records the level the interviewer picks", async () => {
    const user = userEvent.setup();
    const onScore = vi.fn();

    render(
      <QuestionScorePrompt
        question="Explain event loop"
        onScore={onScore}
        onDismiss={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Adequate Partially answered and needs follow-up probing",
      })
    );

    expect(onScore).toHaveBeenCalledWith(5);
  });

  it("lets interviewer dismiss without scoring", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <QuestionScorePrompt
        question="Explain event loop"
        onScore={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    await user.click(screen.getByRole("button", { name: "Dismiss rating" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
