import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ClaimscapeMap } from "./ClaimscapeMap";
import type { TierSummary } from "../../lib/claimscapeMethod";

// Mock ResizeObserver for jsdom environment
class ResizeObserverMock {
  observe(el: HTMLElement) {
    // Trigger callback with simulated 800px width
    if (el) {
      Object.defineProperty(el, "clientWidth", { value: 800, configurable: true });
    }
  }
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as any;

const mockSummaries: TierSummary[] = [
  {
    id: "rct",
    label: "Randomized trials",
    plural: "randomized trials",
    counted: true,
    papers: [
      {
        paper: {
          pmid: "12345",
          title: "Efficacy of Intervention A in Clinical Trial",
          journal: "Lancet",
          date: 2024.5,
          pubTypes: ["Randomized Controlled Trial"],
        },
        judgment: {
          pmid: "12345",
          onTopic: 1,
          direct: 1,
          stance: { supports: 0.9 },
          stanceCheck: { supports: 0.9 },
        },
        tier: "rct",
        tierSource: { kind: "pubmed", type: "Randomized Controlled Trial" },
        onTopic: true,
        direct: true,
        probs: { supports: 0.9 },
        agree: true,
        category: "supports",
        strength: 0.9,
        finding: "Intervention A significantly improved primary outcomes.",
      },
    ],
    counts: { supports: 1, contradicts: 0, mixed: 0, no_result: 0, unclear: 0 },
    n: 1,
    share: 1,
    interval: [0.2, 1],
    verdict: "few",
  },
];

describe("ClaimscapeMap component", () => {
  it("renders Tier Summary labels and paper swarm SVG", () => {
    const onSelect = vi.fn();
    render(
      <ClaimscapeMap
        summaries={mockSummaries}
        selectedPmid={null}
        onSelectPaper={onSelect}
        showReviews={false}
      />
    );

    expect(screen.getByText("Randomized trials")).toBeInTheDocument();
    expect(screen.getByText("1 paper")).toBeInTheDocument();
  });

  it("handles paper selection on SVG click", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ClaimscapeMap
        summaries={mockSummaries}
        selectedPmid={null}
        onSelectPaper={onSelect}
        showReviews={false}
      />
    );

    const svg = container.querySelector("svg[role='img']");
    expect(svg).not.toBeNull();

    if (svg) {
      // Simulate click at placed dot coordinates (x=400, y=29)
      fireEvent.click(svg, { clientX: 400, clientY: 29 });
      expect(onSelect).toHaveBeenCalledWith("12345");
    }
  });

  it("shows and hides tooltip on pointer move and leave", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ClaimscapeMap
        summaries={mockSummaries}
        selectedPmid={null}
        onSelectPaper={onSelect}
        showReviews={false}
      />
    );

    const svg = container.querySelector("svg[role='img']");
    expect(svg).not.toBeNull();

    if (svg) {
      // Hover over dot coordinates (x=400, y=29)
      fireEvent.pointerMove(svg, { clientX: 400, clientY: 29 });
      expect(screen.getByText("Efficacy of Intervention A in Clinical Trial")).toBeInTheDocument();
      expect(screen.getByText("PMID 12345", { exact: false })).toBeInTheDocument();

      // Second pointerMove on same position triggers early return (optimized path)
      fireEvent.pointerMove(svg, { clientX: 400, clientY: 29 });
      expect(screen.getByText("Efficacy of Intervention A in Clinical Trial")).toBeInTheDocument();

      // Pointer leave clears tooltip
      fireEvent.pointerLeave(svg);
      expect(screen.queryByText("Efficacy of Intervention A in Clinical Trial")).not.toBeInTheDocument();
    }
  });
});
