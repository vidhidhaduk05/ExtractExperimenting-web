import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewGraphPage } from "./ReviewGraphPage";
import { api } from "../lib/api";

// Mock @xyflow/react components for lightweight unit testing
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, edges }: { nodes: any[]; edges: any[] }) => (
    <div data-testid="react-flow-mock">
      <div data-testid="nodes-count">{nodes.length}</div>
      <div data-testid="edges-count">{edges.length}</div>
      <ul>
        {edges.map((e, idx) => (
          <li key={idx} data-testid={`edge-${e.source}-${e.target}`}>
            {e.source} -&gt; {e.target}
          </li>
        ))}
      </ul>
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  BackgroundVariant: { Dots: "dots" },
}));

vi.mock("../lib/api", () => ({
  api: {
    getReviewGraph: vi.fn(),
    getReviewGraphStats: vi.fn(),
  },
}));

describe("ReviewGraphPage Component", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const mockGraphData = {
    nodes: [
      { id: "study-1", type: "study", label: "Smith 2024" },
      { id: "var-1", type: "variable", label: "Sample Size" },
      { id: "ext-1", type: "extraction", label: "n=150" },
    ],
    links: [
      { source: "study-1", target: "ext-1", relation: "has_extraction" },
      { source: "ext-1", target: "var-1", relation: "value_of" },
    ],
  };

  const mockStatsData = {
    total_nodes: 3,
    total_links: 2,
    node_types: { study: 1, variable: 1, extraction: 1 },
  };

  it("renders graph data and handles O(L) direct study-to-variable shortcut transformation", async () => {
    vi.mocked(api.getReviewGraph).mockResolvedValue(mockGraphData as any);
    vi.mocked(api.getReviewGraphStats).mockResolvedValue(mockStatsData as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/projects/proj-123/graph"]}>
          <Routes>
            <Route path="/projects/:projectId/graph" element={<ReviewGraphPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify page header
    expect(screen.getByText("Review Data Graph")).toBeInTheDocument();

    // Wait for graph data to load
    await waitFor(() => {
      expect(screen.getByTestId("react-flow-mock")).toBeInTheDocument();
    });

    // By default, showExtractions is true, so 3 nodes and 2 edges
    expect(screen.getByTestId("nodes-count")).toHaveTextContent("3");
    expect(screen.getByTestId("edges-count")).toHaveTextContent("2");

    // Toggle off showExtractions checkbox using fireEvent
    const checkbox = screen.getByLabelText("Show extraction nodes");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    // When extractions are hidden:
    // Extraction node 'ext-1' is removed -> 2 nodes left (study-1, var-1)
    // Direct link 'study-1 -> var-1' is generated in O(L) time -> 1 edge left
    await waitFor(() => {
      expect(screen.getByTestId("nodes-count")).toHaveTextContent("2");
      expect(screen.getByTestId("edges-count")).toHaveTextContent("1");
      expect(screen.getByTestId("edge-study-1-var-1")).toBeInTheDocument();
    });
  });
});
