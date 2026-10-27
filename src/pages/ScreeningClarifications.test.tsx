// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScreeningPage } from "./ScreeningPage";
import { api, type ClarificationQuestion } from "../lib/api";

vi.mock("../lib/bookmarks", () => ({
  useBookmarks: () => ({ ids: [], disabled: true, local: true, error: null, retry: vi.fn(), toggle: vi.fn() }),
}));

describe("ScreeningPage Clarifications Checklist & Desktop Notification Integration", () => {
  let queryClient: QueryClient;

  const mockClarifications: ClarificationQuestion[] = [
    {
      question_id: "q_test_1",
      study_id: "study_001",
      project_id: "test_proj",
      stage: "abstract",
      pico_aspect: "Study Design",
      question_text: "Does the study report an isolated single-case observational report or a prospective comparative cohort?",
      options: [
        { value: "case_report", label: "Single Case Report", description: "Describes single patient angiographic presentation" },
        { value: "cohort", label: "Observational Cohort", description: "Follows multiple patients consecutively" },
        { value: "unclear", label: "Unclear / Needs Full Text", description: "Abstract text insufficient" },
      ],
      context_excerpt: "We report an angiographic case of PCA dysplastic malformation...",
      status: "pending",
      study_title: "Pure Artery Malformation of Posterior Cerebral Artery",
    },
    {
      question_id: "q_test_2",
      study_id: "study_002",
      project_id: "test_proj",
      stage: "fulltext",
      pico_aspect: "Intervention",
      question_text: "Are conservative observation cases reported with distinct follow-up outcomes?",
      options: [
        { value: "stratified", label: "Yes - Stratified Outcomes", description: "Outcomes reported separately" },
        { value: "pooled", label: "No - Pooled Follow-up Only", description: "Aggregate outcomes cannot be decoupled" },
      ],
      context_excerpt: "Conservative observation was maintained in 4 patients...",
      status: "answered",
      answer: "stratified",
      answer_label: "Yes - Stratified Outcomes",
      study_title: "Pure Arterial Malformations: Multi-Center Case Series",
    },
  ];

  const mockStudies = [
    {
      study_id: "study_001",
      project_id: "test_proj",
      title: "Pure Artery Malformation of Posterior Cerebral Artery",
      authors: "Author A et al.",
      publication_year: 2021,
      journal: "Journal of Neuro",
      doi: "10.1001/jn.2021.1",
      pmid: "12345671",
      abstract: "Abstract content for study 1",
      source: "pubmed",
      study_design: "cohort",
      screening_status: "awaiting_clarification",
      screening_stage: "ta",
      screening_reason: "",
      extraction_status: "pending",
      pdf_status: "none",
      pdf_path: "",
      is_duplicate: 0,
      ai_decision: "maybe",
      ai_confidence: 0.55,
    },
    {
      study_id: "study_002",
      project_id: "test_proj",
      title: "Pure Arterial Malformations: Multi-Center Case Series",
      authors: "Author B et al.",
      publication_year: 2022,
      journal: "Radiology Today",
      doi: "10.1001/rt.2022.2",
      pmid: "12345672",
      abstract: "Abstract content for study 2",
      source: "pubmed",
      study_design: "case_report",
      screening_status: "included",
      screening_stage: "ft",
      screening_reason: "",
      extraction_status: "pending",
      pdf_status: "none",
      pdf_path: "",
      is_duplicate: 0,
      ai_decision: "include",
      ai_confidence: 0.94,
    },
  ];

  beforeEach(() => {
    localStorage.setItem("token", "mock-token");
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(api, "getCurrentUser").mockResolvedValue({ id: "rev_1", username: "Dr. Jane Reviewer", email: "jane@example.com" } as any);
    vi.spyOn(api, "listScreening").mockResolvedValue(mockStudies as any);
    vi.spyOn(api, "screeningSummary").mockResolvedValue({
      total: 2,
      ta_included: 1,
      ft_included: 1,
      ta_excluded: 0,
      ft_excluded: 0,
      uncertain: 1,
      pending: 0,
      awaiting_clarification: 1,
      awaiting_pdf: 0,
    } as any);
    vi.spyOn(api, "getExclusionReasons").mockResolvedValue({ reasons: [] } as any);
    vi.spyOn(api, "getAIScreeningProgress").mockResolvedValue({ active: false, done: 0, total: 0 } as any);
    vi.spyOn(api, "getDuplicateGroups").mockResolvedValue({ groups: [], total_duplicates: 0 } as any);
    vi.spyOn(api, "listScreeningKeywords").mockResolvedValue([]);
    vi.spyOn(api, "getAbstractHighlights").mockResolvedValue({ all_spans: [], title_spans: [] } as any);
    vi.spyOn(api, "getStudyClarifications").mockResolvedValue([mockClarifications[0]] as any);
    vi.spyOn(api, "listClarifications").mockResolvedValue(mockClarifications as any);
    vi.spyOn(api, "answerClarification").mockResolvedValue({
      status: "success",
      question_id: "q_test_1",
      study_id: "study_001",
      final_decision: "include",
      final_confidence: 0.98,
      final_reason_text: "Verified by reviewer: Observational Cohort",
    } as any);
    vi.spyOn(api, "robSummary").mockResolvedValue({ assessments: [] } as any);
    vi.spyOn(api, "getRobRunProgress").mockResolvedValue({ active: false } as any);
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem("token");
    vi.restoreAllMocks();
  });

  const renderScreening = (initialEntry = "/projects/test_proj/screening") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/projects/:projectId/screening" element={<ScreeningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders the Co-Scientist Screening Clarifications Checklist banner on Screening Dashboard", async () => {
    renderScreening();
    expect(await screen.findByText("Co-Scientist Screening Clarifications Checklist")).toBeInTheDocument();
    expect(screen.getByText("1 Pending")).toBeInTheDocument();
  });

  it("allows expanding checklist, displays multiple choice question options and submits clarification", async () => {
    renderScreening();
    const showChecklistBtn = await screen.findByRole("button", { name: /Show Checklist/i });
    fireEvent.click(showChecklistBtn);

    // The question prompt should be visible
    expect(await screen.findByText(/Does the study report an isolated single-case observational report/i)).toBeInTheDocument();

    // Find and click the Observational Cohort button in the checklist
    const cohortBtns = screen.getAllByRole("button", { name: /Observational Cohort/i });
    expect(cohortBtns.length).toBeGreaterThan(0);
    fireEvent.click(cohortBtns[0]);

    // Find and click confirm button in checklist
    const confirmBtn = await screen.findByRole("button", { name: /Confirm Clarification & Re-Screen/i });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    // Verify API called with selected choice and reviewer
    await waitFor(() => {
      expect(api.answerClarification).toHaveBeenCalledWith("q_test_1", {
        answer: "cohort",
        answer_label: "Observational Cohort",
        answer_freetext: "",
        answered_by: "Dr. Jane Reviewer",
      });
    });

    // Check feedback banner appears
    expect(await screen.findByText("Clarification recorded and study re-evaluated!")).toBeInTheDocument();
  });

  it("clicking the Questions metric ribbon bundle automatically expands the checklist", async () => {
    renderScreening();
    const questionsBtn = await screen.findByRole("button", { name: /Questions/i });
    fireEvent.click(questionsBtn);

    // Checklist should now be expanded showing questions
    expect(await screen.findByText(/Does the study report an isolated single-case observational report/i)).toBeInTheDocument();
  });

  it("isolates new projects by not displaying checklist when project has zero clarifications", async () => {
    vi.mocked(api.listClarifications).mockResolvedValue([]);
    renderScreening();

    // Should not render the checklist section
    await waitFor(() => {
      expect(screen.queryByText("Co-Scientist Screening Clarifications Checklist")).not.toBeInTheDocument();
    });
  });
});
