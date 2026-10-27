import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordCollaborationPanel, TagFilter } from "./RecordCollaboration";
import { recordCollaboration } from "../../lib/recordCollaboration";

vi.mock("../../lib/api", () => ({ getApiBase: () => "/api" }));
const note = { annotation_id: "a1", study_id: "s1", project_id: "p1", author_id: "alice", author_name: "Alice",
  text: "Check the supplement", visibility: "shared" as const, created_at: "2026-10-11T10:00:00+00:00" };

function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("token", "alice");
  vi.spyOn(recordCollaboration, "listAnnotations").mockResolvedValue({ annotations: [note], can_write: true });
  vi.spyOn(recordCollaboration, "listTags").mockResolvedValue({ can_write: true, tags: [
    { tag_id: "t1", project_id: "p1", name: "Pilot", archived: false },
    { tag_id: "t2", project_id: "p1", name: "Archived", archived: true },
  ], study_tags: { s1: ["t1"] } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("record comments, notes and tags", () => {
  it("shows author and timestamp, then saves a private note with its real visibility", async () => {
    const save = vi.spyOn(recordCollaboration, "addAnnotation").mockImplementation(async (_, input) => ({ ...note, ...input, annotation_id: "a2" }));
    mount(<RecordCollaborationPanel projectId="p1" studyId="s1" />);
    expect(await screen.findByText("Check the supplement")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe(note.created_at);
    fireEvent.click(screen.getByRole("button", { name: "My private notes" }));
    expect(screen.queryByText("Check the supplement")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Write a private note"), { target: { value: "My assessment" } });
    fireEvent.click(screen.getByRole("button", { name: "Save private note" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("s1", expect.objectContaining({ text: "My assessment", visibility: "private" })));
    expect(await screen.findByText("My assessment")).toBeInTheDocument();
    expect(screen.getByLabelText("Write a private note")).toHaveValue("");
  });
  it("keeps a failed draft and retries with the same request ID without duplicate posts", async () => {
    const save = vi.spyOn(recordCollaboration, "addAnnotation").mockRejectedValueOnce(new Error("Server unavailable"))
      .mockImplementation(async (_, input) => ({ ...note, ...input, annotation_id: "a2" }));
    mount(<RecordCollaborationPanel projectId="p1" studyId="s1" />);
    const input = await screen.findByLabelText("Write a shared comment");
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText(/Your draft is kept/)).toBeInTheDocument();
    expect(input).toHaveValue("Keep this draft");
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0][1].request_id).toBe(save.mock.calls[1][1].request_id);
  });
  it("adds and removes tags, excludes archived tags from new assignments", async () => {
    const set = vi.spyOn(recordCollaboration, "setTag").mockResolvedValue({});
    mount(<RecordCollaborationPanel projectId="p1" studyId="s1" />);
    const pilot = await screen.findByRole("checkbox", { name: "Pilot" });
    expect(pilot).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Archived" })).not.toBeInTheDocument();
    fireEvent.click(pilot);
    await waitFor(() => expect(set).toHaveBeenCalledWith("s1", "t1", false));
  });
  it("does not offer write controls to a viewer", async () => {
    vi.mocked(recordCollaboration.listAnnotations).mockResolvedValue({ annotations: [note], can_write: false });
    vi.mocked(recordCollaboration.listTags).mockResolvedValue({ can_write: false, tags: [{ tag_id: "t1", project_id: "p1", name: "Pilot", archived: false }], study_tags: {} });
    mount(<RecordCollaborationPanel projectId="p1" studyId="s1" />);
    expect(await screen.findByText("Check the supplement")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post comment" })).not.toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Pilot" })).toBeDisabled();
  });
  it("retains the created tag after an assignment fails and offers assignment retry instead of creating a duplicate", async () => {
    const created = { tag_id: "t3", project_id: "p1", name: "New tag", archived: false };
    const create = vi.spyOn(recordCollaboration, "createTag").mockImplementation(async () => {
      vi.mocked(recordCollaboration.listTags).mockResolvedValue({ can_write: true, tags: [created], study_tags: {} });
      return created;
    });
    const set = vi.spyOn(recordCollaboration, "setTag").mockRejectedValueOnce(new Error("Network interrupted")).mockResolvedValue({});
    mount(<RecordCollaborationPanel projectId="p1" studyId="s1" />);
    const input = await screen.findByLabelText("Create a tag for this record");
    fireEvent.change(input, { target: { value: "New tag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));
    expect(await screen.findByText(/Tag created, but it could not be added/)).toBeInTheDocument();
    expect(input).toHaveValue("");
    const checkbox = await screen.findByRole("checkbox", { name: "New tag" });
    await waitFor(() => expect(checkbox).not.toBeDisabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(set).toHaveBeenLastCalledWith("s1", "t3", true);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("searches and filters tags and supports project-wide rename/archive", async () => {
    const onChange = vi.fn();
    const update = vi.spyOn(recordCollaboration, "updateTag").mockResolvedValue({ tag_id: "t1", project_id: "p1", name: "Calibration", archived: false });
    mount(<TagFilter projectId="p1" value="" onChange={onChange} />);
    expect(await screen.findByRole("option", { name: "Pilot" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Archived" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter studies by tag"), { target: { value: "t1" } });
    expect(onChange).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByRole("button", { name: /Manage tags/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename Pilot"), { target: { value: "Calibration" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("p1", "t1", { name: "Calibration", archived: undefined }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("p1", "t1", { name: undefined, archived: true }));
    fireEvent.change(screen.getByLabelText("Search project tags"), { target: { value: "missing" } });
    expect(screen.getByText("No matching tags.")).toBeInTheDocument();
  });
});
