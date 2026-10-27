// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TodosPanel } from "./TodosPanel";
import { api, type TodoItem, type ClarificationQuestion } from "../../lib/api";

// Mock the API module
vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listTodos: vi.fn(),
      createTodo: vi.fn(),
      updateTodo: vi.fn(),
      deleteTodo: vi.fn(),
      createTodoFromNotification: vi.fn(),
      listClarifications: vi.fn(),
    },
  };
});

describe("TodosPanel Component", () => {
  let queryClient: QueryClient;

  const mockTodos: TodoItem[] = [
    {
      id: "todo-1",
      project_id: "test-proj",
      text: "Manual Review Item",
      done: false,
      source: "manual",
      created_at: "2026-10-27T10:00:00Z",
    },
    {
      id: "todo-2",
      project_id: "test-proj",
      text: "Study 123 Protocol Check",
      done: false,
      source: "study",
      study_id: "study-123",
      study_title: "Smith et al. 2024",
      created_at: "2026-10-27T09:00:00Z",
    },
    {
      id: "todo-3",
      project_id: "test-proj",
      text: "Old Finished Task",
      done: true,
      source: "manual",
      created_at: "2026-10-27T08:00:00Z",
    },
  ];

  const mockClarifications: ClarificationQuestion[] = [
    {
      question_id: "q-101",
      project_id: "test-proj",
      study_id: "study-101",
      question_text: "Does this study use blinded evaluation?",
      status: "pending",
      is_tracked: false,
      created_at: "2026-10-27T10:30:00Z",
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.mocked(api.listTodos).mockResolvedValue([...mockTodos]);
    vi.mocked(api.listClarifications).mockResolvedValue([...mockClarifications]);
    vi.mocked(api.createTodo).mockImplementation(async (_projectId, data) => ({
      id: `todo-${Date.now()}`,
      project_id: "test-proj",
      text: data.text,
      done: false,
      source: (data.source as any) || "manual",
      study_id: data.study_id,
      created_at: new Date().toISOString(),
    }));
    vi.mocked(api.updateTodo).mockImplementation(async (id, data) => {
      const existing = mockTodos.find((t) => t.id === id) || {
        id,
        project_id: "test-proj",
        text: "Sample",
        done: false,
        source: "manual" as const,
        created_at: new Date().toISOString(),
      };
      return {
        ...existing,
        ...data,
      };
    });
    vi.mocked(api.deleteTodo).mockResolvedValue({ success: true } as any);
    vi.mocked(api.createTodoFromNotification).mockImplementation(async (_proj, data) => ({
      id: `todo-from-notif-${Date.now()}`,
      project_id: "test-proj",
      text: data.text || "Tracked notification",
      done: false,
      source: "notification",
      notification_id: data.notification_id,
      created_at: new Date().toISOString(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderComponent = (projectId = "test-proj") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TodosPanel projectId={projectId} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders panel header, manual input row, active to-dos, and notifications", async () => {
    renderComponent();

    // Verify header and input
    expect(await screen.findByPlaceholderText(/Add a to-do/i)).toBeInTheDocument();
    expect(await screen.findByText("Notifications")).toBeInTheDocument();

    // Verify active items rendered
    expect(screen.getByText("Manual Review Item")).toBeInTheDocument();
    expect(screen.getByText("Study 123 Protocol Check")).toBeInTheDocument();

    // Verify notification item rendered
    expect(screen.getByText("Does this study use blinded evaluation?")).toBeInTheDocument();

    // Completed section is present and shows count (1)
    expect(screen.getByText(/Completed \(1\)/i)).toBeInTheDocument();
  });

  it("adds a manual to-do on Enter", async () => {
    renderComponent();

    const input = await screen.findByPlaceholderText(/Add a to-do/i);
    fireEvent.change(input, { target: { value: "Perform duplicate resolution" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(api.createTodo).toHaveBeenCalledWith(
        "test-proj",
        expect.objectContaining({
          text: "Perform duplicate resolution",
          source: "manual",
        })
      );
    });

    expect(await screen.findByText("Perform duplicate resolution")).toBeInTheDocument();
  });

  it("toggles done state when checkbox clicked (moves between Active and Completed)", async () => {
    renderComponent();

    // Find the checkbox for "Manual Review Item"
    const checkbox = await screen.findByLabelText(/Mark "Manual Review Item" completed/i);
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(api.updateTodo).toHaveBeenCalledWith("todo-1", { done: true });
    });

    // Open completed section to inspect
    const completedHeader = screen.getByText(/Completed/i);
    fireEvent.click(completedHeader);

    // It should now be in completed section
    await waitFor(() => {
      expect(screen.getByLabelText(/Mark "Manual Review Item" uncompleted/i)).toBeInTheDocument();
    });
  });

  it("allows inline editing of manual to-do text", async () => {
    renderComponent();

    const todoText = await screen.findByText("Manual Review Item");
    fireEvent.click(todoText);

    // Inline input appears
    const editInput = screen.getByDisplayValue("Manual Review Item");
    fireEvent.change(editInput, { target: { value: "Updated Review Title" } });
    fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(api.updateTodo).toHaveBeenCalledWith("todo-1", { text: "Updated Review Title" });
    });
  });

  it("tracks notification into a to-do item and marks it tracked", async () => {
    renderComponent();

    const trackButton = await screen.findByRole("button", { name: /^Track$/i });
    fireEvent.click(trackButton);

    await waitFor(() => {
      expect(api.createTodoFromNotification).toHaveBeenCalledWith(
        "test-proj",
        expect.objectContaining({
          notification_id: "q-101",
        })
      );
    });
  });

  it("accepts HTML5 drag-and-drop of study payload and creates a study to-do", async () => {
    renderComponent();

    // Wait for todos to load
    await screen.findByText("Manual Review Item");
    const panel = screen.getByTestId("todos-panel");
    expect(panel).toBeInTheDocument();

    const studyPayload = {
      studyId: "study-999",
      title: "New Draggable Study 2026",
      projectId: "test-proj",
    };

    // Simulate dragOver with application/x-study
    fireEvent.dragOver(panel, {
      dataTransfer: {
        types: ["application/x-study"],
        dropEffect: "none",
      },
    });

    // Simulate drop
    fireEvent.drop(panel, {
      dataTransfer: {
        types: ["application/x-study"],
        getData: (mime: string) =>
          mime === "application/x-study" ? JSON.stringify(studyPayload) : "",
      },
    });

    await waitFor(() => {
      expect(api.createTodo).toHaveBeenCalledWith(
        "test-proj",
        expect.objectContaining({
          text: "New Draggable Study 2026",
          source: "study",
          study_id: "study-999",
        })
      );
    });
  });

  it("prompts confirmation when dropping a study that is already an unticked to-do", async () => {
    renderComponent();

    // Wait for active study todo to load
    await screen.findByText("Study 123 Protocol Check");
    const panel = screen.getByTestId("todos-panel");
    expect(panel).toBeInTheDocument();

    // Drop the study that already exists active in mockTodos ("study-123")
    const duplicateStudyPayload = {
      studyId: "study-123",
      title: "Duplicate Study 123",
      projectId: "test-proj",
    };

    fireEvent.drop(panel, {
      dataTransfer: {
        types: ["application/x-study"],
        getData: (mime: string) =>
          mime === "application/x-study" ? JSON.stringify(duplicateStudyPayload) : "",
      },
    });

    // Banner should appear
    expect(await screen.findByText(/Already on the list/i)).toBeInTheDocument();
    const addAnywayBtn = screen.getByRole("button", { name: /^Add anyway$/i });
    expect(addAnywayBtn).toBeInTheDocument();

    // Confirm adding anyway
    fireEvent.click(addAnywayBtn);

    await waitFor(() => {
      expect(api.createTodo).toHaveBeenCalledWith(
        "test-proj",
        expect.objectContaining({
          study_id: "study-123",
          source: "study",
        })
      );
    });
  });
});
