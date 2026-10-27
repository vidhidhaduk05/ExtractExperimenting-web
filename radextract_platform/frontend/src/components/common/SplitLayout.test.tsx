import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SplitLayout } from "./SplitLayout";
import React from "react";

describe("SplitLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders left and right panes", () => {
    render(
      <SplitLayout
        leftPane={<div data-testid="left-content">Left Study List</div>}
        rightPane={<div data-testid="right-content">Right Reading Pane</div>}
      />
    );

    expect(screen.getByTestId("left-content")).toBeInTheDocument();
    expect(screen.getByTestId("right-content")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("initializes width from localStorage if present", () => {
    localStorage.setItem("test_split_key", "55");

    const { container } = render(
      <SplitLayout
        storageKey="test_split_key"
        leftPane={<div>Left</div>}
        rightPane={<div>Right</div>}
      />
    );

    const leftDiv = container.firstChild?.childNodes[0] as HTMLElement;
    expect(leftDiv.style.width).toBe("55%");
  });

  it("falls back to defaultLeftPercent when localStorage is empty", () => {
    const { container } = render(
      <SplitLayout
        defaultLeftPercent={42}
        leftPane={<div>Left</div>}
        rightPane={<div>Right</div>}
      />
    );

    const leftDiv = container.firstChild?.childNodes[0] as HTMLElement;
    expect(leftDiv.style.width).toBe("42%");
  });
});
