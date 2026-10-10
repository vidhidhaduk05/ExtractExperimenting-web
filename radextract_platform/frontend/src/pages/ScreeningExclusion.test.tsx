// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScreeningPage } from "./ScreeningPage";
import { api } from "../lib/api";

describe("ScreeningPage Exclusion Reason Validation (Task 27)", () => {
  let queryClient: QueryClient;

  const mockStudies = [
    {
      study_id: "study_001",
      project_id: "test_proj",
      title: "First Study On Cerebral Malformations",
      authors: "Author A et al.",
      publication_year: 2021,
      journal: "Journal of Neuro",
      doi: "10.1001/jn.2021.1",
      pmid: "12345671",
      abstract: "Abstract content for study 1",
      source: "pubmed",
      study_design: "cohort",
      screening_status: "pending",
      screening_stage: "ta",
      screening_reason: "",
      extraction_status: "pending",
      pdf_status: "none",
      pdf_path: "",
      is_duplicate: 0,
      ai_decision: null,
      ai_confidence: null,
    },
    {
      study_id: "study_002",
      project_id: "test_proj",
      title: "Second Study On Endovascular Therapies",
      authors: "Author B et al.",
      publication_year: 2022,
      journal: "Radiology Today",
      doi: "10.1001/rt.2022.2",
      pmid: "12345672",
      abstract: "Abstract content for study 2",
      source: "pubmed",
      study_design: "case_report",
      screening_status: "pending",
      screening_stage: "ta",
      screening_reason: "",
      extraction_status: "pending",
      pdf_status: "none",
      pdf_path: "",
      is_duplicate: 0,
      ai_decision: null,
      ai_confidence: null,
    },
  ];

  const mockReasons = [
    { code: "wrong_population", label: "Wrong population" },
    { code: "wrong_study_design", label: "Wrong study design" },
    { code: "ineligible_outcome", label: "Ineligible outcome" },
  ];

  const mockSummary = {
    total: 2,
    ta_included: 0,
    ta_excluded: 0,
    ft_included: 0,
    ft_excluded: 0,
    pending: 2,
    uncertain: 0,
    awaiting_clarification: 0,
    awaiting_pdf: 0,
    ai_screened: 0,
    high_confidence: 0,
    medium_confidence: 0,
    low_confidence: 0,
    human_screened: 0,
    ai_human_conflicts: 0,
    safety_net_overrides: 0,
    clarifications_pending: 0,
    clarifications_answered: 0,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(api, "listScreening").mockResolvedValue(mockStudies as any);
    vi.spyOn(api, "screeningSummary").mockResolvedValue(mockSummary as any);
    vi.spyOn(api, "getExclusionReasons").mockResolvedValue({ reasons: mockReasons } as any);
    vi.spyOn(api, "screeningDecision").mockResolvedValue({ status: "success" } as any);
    vi.spyOn(api, "getAIScreeningProgress").mockResolvedValue({ active: false, done: 0, total: 0 } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderScreeningPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/projects/test_proj/screening"]}>
          <Routes>
            <Route path="/projects/:projectId/screening" element={<ScreeningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("blocks exclusion and displays prompt when no exclusion reason is selected (Button click)", async () => {
    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    const excludeBtn = screen.getByRole("button", { name: /Exclude Study/i });
    fireEvent.click(excludeBtn);

    // Decision mutation should NOT be called
    expect(api.screeningDecision).not.toHaveBeenCalled();

    // Error alert must be visible
    expect(
      screen.getByText("Please select a valid exclusion reason before excluding this record.")
    ).toBeInTheDocument();

    // Still on first study (did not advance)
    expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
  });

  it("blocks exclusion and displays prompt when keyboard shortcut 'E' or '2' is pressed without a reason", async () => {
    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    // Press keyboard shortcut 'e'
    fireEvent.keyDown(window, { key: "e" });

    expect(api.screeningDecision).not.toHaveBeenCalled();
    expect(
      screen.getByText("Please select a valid exclusion reason before excluding this record.")
    ).toBeInTheDocument();
  });

  it("successfully saves exclusion and advances when valid reason is selected (Button click)", async () => {
    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    // Select valid exclusion reason from dropdown
    const reasonSelect = screen.getByDisplayValue("Select Exclusion Reason (Required to exclude)");
    fireEvent.change(reasonSelect, { target: { value: "wrong_study_design" } });

    const excludeBtn = screen.getByRole("button", { name: /Exclude Study/i });
    fireEvent.click(excludeBtn);

    // Decision mutation called with preserved reason
    await waitFor(() => {
      expect(api.screeningDecision).toHaveBeenCalledWith("study_001", {
        project_id: "test_proj",
        reviewer_id: "reviewer1",
        reviewer_name: "Reviewer 1",
        decision: "excluded",
        stage: "ta",
        reason_code: "wrong_study_design",
        reason_text: "Wrong study design",
      });
    });

    // Advances to second study
    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });
  });

  it("successfully saves exclusion and advances when valid reason is selected via keyboard hotkey 'E'", async () => {
    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    const reasonSelect = screen.getByDisplayValue("Select Exclusion Reason (Required to exclude)");
    fireEvent.change(reasonSelect, { target: { value: "ineligible_outcome" } });

    // Press hotkey '2'
    fireEvent.keyDown(window, { key: "2" });

    await waitFor(() => {
      expect(api.screeningDecision).toHaveBeenCalledWith("study_001", {
        project_id: "test_proj",
        reviewer_id: "reviewer1",
        reviewer_name: "Reviewer 1",
        decision: "excluded",
        stage: "ta",
        reason_code: "ineligible_outcome",
        reason_text: "Ineligible outcome",
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });
  });

  it("allows Include Study without exclusion reason and advances to next study", async () => {
    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    const includeBtn = screen.getByRole("button", { name: /Include Study/i });
    fireEvent.click(includeBtn);

    await waitFor(() => {
      expect(api.screeningDecision).toHaveBeenCalledWith("study_001", {
        project_id: "test_proj",
        reviewer_id: "reviewer1",
        reviewer_name: "Reviewer 1",
        decision: "included",
        stage: "ta",
        reason_text: "Eligible under PICO criteria",
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });
  });

  it("allows Maybe / Uncertain decision without exclusion reason and advances to next study", async () => {
    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    // Press hotkey 'm'
    fireEvent.keyDown(window, { key: "m" });

    await waitFor(() => {
      expect(api.screeningDecision).toHaveBeenCalledWith("study_001", {
        project_id: "test_proj",
        reviewer_id: "reviewer1",
        reviewer_name: "Reviewer 1",
        decision: "maybe",
        stage: "ta",
        reason_text: "Uncertain - requires further assessment",
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });
  });

  it("recovers from save failure without advancing record or losing entered reason/notes, and retries successfully", async () => {
    // Mock failure first
    vi.spyOn(api, "screeningDecision").mockRejectedValueOnce(new Error("500 Internal Server Error: Database failure"));

    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    // Select reason and enter custom rationale
    const reasonSelect = screen.getByDisplayValue("Select Exclusion Reason (Required to exclude)");
    fireEvent.change(reasonSelect, { target: { value: "wrong_study_design" } });

    const rationaleInput = screen.getByPlaceholderText("Custom exclusion rationale...");
    fireEvent.change(rationaleInput, { target: { value: "Cohort study without control arm" } });

    const excludeBtn = screen.getByRole("button", { name: /Exclude Study/i });
    fireEvent.click(excludeBtn);

    // Save failure alert should appear
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("500 Internal Server Error: Database failure")).toBeInTheDocument();
    });

    // Current study record MUST NOT have advanced
    expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);

    // Selected exclusion reason and custom rationale MUST be preserved
    expect((screen.getByPlaceholderText("Custom exclusion rationale...") as HTMLInputElement).value).toBe(
      "Cohort study without control arm"
    );
    expect((screen.getByDisplayValue("Wrong study design") as HTMLSelectElement).value).toBe(
      "wrong_study_design"
    );

    // Now mock success for retry
    vi.spyOn(api, "screeningDecision").mockResolvedValueOnce({ status: "success" } as any);

    // Click Retry Save button
    const retryBtn = screen.getByRole("button", { name: /Retry Save/i });
    fireEvent.click(retryBtn);

    // Decision mutation should be called with identical parameters
    await waitFor(() => {
      expect(api.screeningDecision).toHaveBeenCalledWith("study_001", {
        project_id: "test_proj",
        reviewer_id: "reviewer1",
        reviewer_name: "Reviewer 1",
        decision: "excluded",
        stage: "ta",
        reason_code: "wrong_study_design",
        reason_text: "Cohort study without control arm",
      });
    });

    // Upon successful retry, it advances to second study
    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });

    // Error banner should be cleared
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prevents duplicate submissions during rapid repeated clicks while save is pending", async () => {
    let resolveSave: (value: any) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    vi.spyOn(api, "screeningDecision").mockReturnValue(savePromise as any);

    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    const includeBtn = screen.getByRole("button", { name: /Include Study/i });
    // First click initiates save
    fireEvent.click(includeBtn);

    await waitFor(() => {
      expect(api.screeningDecision).toHaveBeenCalledTimes(1);
    });

    // Rapid repeated clicks while save is pending are ignored
    fireEvent.click(includeBtn);
    fireEvent.click(includeBtn);
    expect(api.screeningDecision).toHaveBeenCalledTimes(1);

    // Button shows loading/saving status
    expect(screen.getByText("Saving...")).toBeInTheDocument();
    expect(includeBtn).toBeDisabled();

    // Resolve the promise
    resolveSave!({ status: "success" });

    // Advances to second study
    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });
  });

  it("prevents duplicate submissions during rapid repeated keyboard hotkeys while save is pending", async () => {
    let resolveSave: (value: any) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    vi.spyOn(api, "screeningDecision").mockReturnValue(savePromise as any);

    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    // First hotkey initiates save
    fireEvent.keyDown(window, { key: "1" });

    await waitFor(() => {
      expect(api.screeningDecision).toHaveBeenCalledTimes(1);
    });

    // Rapid repeated hotkeys while save is pending are ignored
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "1" });
    expect(api.screeningDecision).toHaveBeenCalledTimes(1);

    resolveSave!({ status: "success" });

    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });
  });

  it("keeps record and allows retry when Include Study fails on the server", async () => {
    vi.spyOn(api, "screeningDecision").mockRejectedValueOnce(new Error("Network connection dropped"));

    renderScreeningPage();

    await waitFor(() => {
      expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);
    });

    const includeBtn = screen.getByRole("button", { name: /Include Study/i });
    fireEvent.click(includeBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Network connection dropped")).toBeInTheDocument();
    });

    // Did not advance
    expect(screen.getAllByText("First Study On Cerebral Malformations").length).toBeGreaterThan(0);

    // Mock success for retry
    vi.spyOn(api, "screeningDecision").mockResolvedValueOnce({ status: "success" } as any);

    const retryBtn = screen.getByRole("button", { name: /Retry Save/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getAllByText("Second Study On Endovascular Therapies").length).toBeGreaterThan(0);
    });
  });
});
