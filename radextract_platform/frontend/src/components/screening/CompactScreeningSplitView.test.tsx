import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompactScreeningSplitView } from "./CompactScreeningSplitView";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockStudies: any[] = [
  {
    study_id: "study_001",
    title: "Pure Arterial Malformation Treatment Outcomes",
    authors: "Zhang L; Smith J",
    publication_year: "2023",
    journal: "J Neurosurg",
    screening_status: "pending",
    ai_confidence: 0.88,
    ai_decision: "include",
    ai_reason: "Matches pure arterial malformation criteria",
    abstract: "A clinical trial evaluating intracranial pure arterial malformations.",
  },
  {
    study_id: "study_002",
    title: "Endovascular Coiling in Pediatric Aneurysms",
    authors: "Alvarez H",
    publication_year: "2020",
    journal: "AJNR",
    screening_status: "excluded",
    ai_confidence: 0.95,
    ai_decision: "exclude",
    ai_reason: "Exclusion criteria met: arteriovenous fistula present",
    abstract: "Case series of pediatric dAVF lesions.",
  },
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CompactScreeningSplitView", () => {
  it("renders study table with expected columns and data", () => {
    renderWithClient(
      <CompactScreeningSplitView
        studies={mockStudies}
        selectedStudy={mockStudies[0]}
        onSelectStudy={vi.fn()}
        onScreenDecision={vi.fn()}
        isDecisionPending={false}
        saveError={null}
        failedDecision={null}
        onRetry={vi.fn()}
        excludeReasonCode=""
        setExcludeReasonCode={vi.fn()}
        excludeReasonText=""
        setExcludeReasonText={vi.fn()}
        reasonError={null}
        exclusionReasons={[{ code: "NOT_PAM", label: "Not pure arterial malformation" }]}
        keywords={[]}
        showHighlights={true}
        onToggleHighlights={vi.fn()}
        renderHighlightedText={(text) => <span>{text}</span>}
        studyClarifications={[]}
        onPdfUpload={vi.fn()}
        uploadingPdf={false}
        uploadError={null}
        bookmarkSet={new Set()}
        bookmarks={{ disabled: false, toggle: vi.fn() }}
        projectId="proj_test_123"
      />
    );

    // Checks table headers
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
    expect(screen.getAllByText("Year").length).toBeGreaterThan(0);
    expect(screen.getByText("Journal")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Conf")).toBeInTheDocument();

    // Checks study rows
    expect(
      screen.getAllByText("Pure Arterial Malformation Treatment Outcomes").length
    ).toBe(2);
    expect(screen.getByText("Zhang L")).toBeInTheDocument();
    expect(screen.getByText("2023")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();

    // Checks decision action bar buttons
    expect(screen.getByRole("button", { name: /Include/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Uncertain/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exclude/i })).toBeInTheDocument();
  });

  it("calls onSelectStudy when clicking another row", () => {
    const handleSelect = vi.fn();
    renderWithClient(
      <CompactScreeningSplitView
        studies={mockStudies}
        selectedStudy={mockStudies[0]}
        onSelectStudy={handleSelect}
        onScreenDecision={vi.fn()}
        isDecisionPending={false}
        saveError={null}
        failedDecision={null}
        onRetry={vi.fn()}
        excludeReasonCode=""
        setExcludeReasonCode={vi.fn()}
        excludeReasonText=""
        setExcludeReasonText={vi.fn()}
        reasonError={null}
        exclusionReasons={[]}
        keywords={[]}
        showHighlights={true}
        onToggleHighlights={vi.fn()}
        renderHighlightedText={(text) => <span>{text}</span>}
        studyClarifications={[]}
        onPdfUpload={vi.fn()}
        uploadingPdf={false}
        uploadError={null}
        bookmarkSet={new Set()}
        bookmarks={{ disabled: false, toggle: vi.fn() }}
        projectId="proj_test_123"
      />
    );

    fireEvent.click(screen.getByText("Endovascular Coiling in Pediatric Aneurysms"));
    expect(handleSelect).toHaveBeenCalledWith("study_002");
  });

  it("triggers onScreenDecision when clicking Include button", () => {
    const handleDecision = vi.fn();
    renderWithClient(
      <CompactScreeningSplitView
        studies={mockStudies}
        selectedStudy={mockStudies[0]}
        onSelectStudy={vi.fn()}
        onScreenDecision={handleDecision}
        isDecisionPending={false}
        saveError={null}
        failedDecision={null}
        onRetry={vi.fn()}
        excludeReasonCode=""
        setExcludeReasonCode={vi.fn()}
        excludeReasonText=""
        setExcludeReasonText={vi.fn()}
        reasonError={null}
        exclusionReasons={[]}
        keywords={[]}
        showHighlights={true}
        onToggleHighlights={vi.fn()}
        renderHighlightedText={(text) => <span>{text}</span>}
        studyClarifications={[]}
        onPdfUpload={vi.fn()}
        uploadingPdf={false}
        uploadError={null}
        bookmarkSet={new Set()}
        bookmarks={{ disabled: false, toggle: vi.fn() }}
        projectId="proj_test_123"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Include/i }));
    expect(handleDecision).toHaveBeenCalledWith("included");
  });

  it("switches sub-tabs between Abstract, Full Text, Details, and Notes", () => {
    renderWithClient(
      <CompactScreeningSplitView
        studies={mockStudies}
        selectedStudy={mockStudies[0]}
        onSelectStudy={vi.fn()}
        onScreenDecision={vi.fn()}
        isDecisionPending={false}
        saveError={null}
        failedDecision={null}
        onRetry={vi.fn()}
        excludeReasonCode=""
        setExcludeReasonCode={vi.fn()}
        excludeReasonText=""
        setExcludeReasonText={vi.fn()}
        reasonError={null}
        exclusionReasons={[]}
        keywords={[]}
        showHighlights={true}
        onToggleHighlights={vi.fn()}
        renderHighlightedText={(text) => <span>{text}</span>}
        studyClarifications={[]}
        onPdfUpload={vi.fn()}
        uploadingPdf={false}
        uploadError={null}
        bookmarkSet={new Set()}
        bookmarks={{ disabled: false, toggle: vi.fn() }}
        projectId="proj_test_123"
      />
    );

    // Switch to Details
    fireEvent.click(screen.getByRole("button", { name: /^Details$/i }));
    expect(screen.getByText("Bibliographic & Protocol Metadata")).toBeInTheDocument();
    expect(screen.getByText("study_001")).toBeInTheDocument();

    // Switch to Notes
    fireEvent.click(screen.getByRole("button", { name: /^Notes/i }));
    expect(screen.getByPlaceholderText(/Enter review notes/i)).toBeInTheDocument();
  });
});
