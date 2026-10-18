import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudyList } from "./StudyList";
import { api } from "../lib/api";
import { recordCollaboration } from "../lib/recordCollaboration";

vi.mock("../lib/bookmarks", () => ({ useBookmarks: () => ({ ids: [], disabled: true, local: false, error: null, retry: vi.fn(), toggle: vi.fn() }) }));
beforeEach(() => {
  localStorage.setItem("token", "alice");
  vi.spyOn(api, "listStudies").mockResolvedValue([
    { study_id: "s1", title: "First study", screening_status: "pending", project_id: "p1" },
    { study_id: "s2", title: "Second study", screening_status: "pending", project_id: "p1" },
  ] as any);
  vi.spyOn(api, "getDuplicateGroups").mockResolvedValue({ groups: [], total_duplicates: 0 } as any);
  vi.spyOn(api, "listStudyAssessments").mockResolvedValue([]);
  vi.spyOn(recordCollaboration, "listTags").mockResolvedValue({ can_write: true, tags: [{ tag_id: "t1", project_id: "p1", name: "Pilot", archived: false }], study_tags: { s2: ["t1"] } });
  vi.spyOn(recordCollaboration, "listAnnotations").mockResolvedValue({ can_write: true, annotations: [] });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it("filters the Studies table and opens comments for the chosen record", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/projects/p1/studies"]}>
    <Routes><Route path="/projects/:projectId/studies" element={<StudyList />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  await screen.findByRole("option", { name: "Pilot" });
  fireEvent.change(screen.getByLabelText("Filter studies by tag"), { target: { value: "t1" } });
  await waitFor(() => expect(screen.queryByText("First study")).not.toBeInTheDocument());
  expect(screen.getByText("Second study")).toBeInTheDocument();
  expect(screen.getByText("1 matching studies")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Comments and tags for Second study" }));
  const dialog = screen.getByRole("dialog", { name: "Second study" });
  expect(await within(dialog).findByLabelText("Write a shared comment")).toBeInTheDocument();
  expect(recordCollaboration.listAnnotations).toHaveBeenCalledWith("s2");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
