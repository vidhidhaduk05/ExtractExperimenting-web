import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type TodoItem,
  type ClarificationQuestion,
} from "../../lib/api";
import {
  Check,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  Sparkles,
  Pencil,
  AlertCircle,
  ExternalLink,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface TodosPanelProps {
  projectId?: string;
  className?: string;
}

export function TodosPanel({ projectId, className }: TodosPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Input state for new manual to-do
  const [newTodoText, setNewTodoText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingDropStudy, setPendingDropStudy] = useState<{ studyId: string; title: string } | null>(null);

  // Inline editing state: todoId -> editing text
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Collapsed completed section toggle
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  // Local dismissed notification IDs inside this panel (does not touch backend)
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(new Set());

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Fetch Todos for current project
  const {
    data: todos = [],
    isLoading: isLoadingTodos,
    error: todosError,
  } = useQuery<TodoItem[]>({
    queryKey: ["todos", projectId],
    queryFn: () => (projectId ? api.listTodos(projectId) : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 5000,
  });

  // 2. Fetch Clarifications for Notifications section (pending items)
  const { data: pendingNotifications = [] } = useQuery<ClarificationQuestion[]>({
    queryKey: ["pending-clarifications", projectId],
    queryFn: () => (projectId ? api.listClarifications(projectId, "pending") : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 5000,
    refetchInterval: 8000,
  });

  // Filter out notifications dismissed inside the panel
  const visibleNotifications = pendingNotifications.filter(
    (n) => !dismissedNotifIds.has(n.question_id)
  );

  // Split todos into active and completed
  const activeTodos = todos.filter((t) => !t.done);
  const completedTodos = todos.filter((t) => t.done);

  // Set of tracked notification IDs for fast duplicate prevention
  const trackedNotifIds = new Set(
    todos.filter((t) => t.notification_id).map((t) => t.notification_id!)
  );

  // ── Handler: Add Manual To-Do ──
  const handleAddManualTodo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = newTodoText.trim();
    if (!text || !projectId || isAdding) return;

    setIsAdding(true);
    const tempId = `temp_${Date.now()}`;
    const optimisticTodo: TodoItem = {
      id: tempId,
      project_id: projectId,
      text,
      done: false,
      source: "manual",
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) => [
      optimisticTodo,
      ...old,
    ]);
    setNewTodoText("");

    try {
      const created = await api.createTodo(projectId, { text, source: "manual" });
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.map((t) => (t.id === tempId ? created : t))
      );
      showToast("To-do created");
    } catch (err: any) {
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.filter((t) => t.id !== tempId)
      );
      showToast(`Failed to add to-do: ${err?.message || "Unknown error"}`);
    } finally {
      setIsAdding(false);
    }
  };

  // ── Handler: Toggle Done Status (Optimistic) ──
  const handleToggleDone = async (todo: TodoItem) => {
    if (!projectId) return;
    const newDone = !todo.done;

    // Optimistic update
    queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
      old.map((t) => (t.id === todo.id ? { ...t, done: newDone } : t))
    );

    try {
      const updated = await api.updateTodo(todo.id, { done: newDone });
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.map((t) => (t.id === todo.id ? updated : t))
      );
    } catch (err: any) {
      // Revert on error
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.map((t) => (t.id === todo.id ? todo : t))
      );
      showToast(`Failed to update to-do: ${err?.message || "Unknown error"}`);
    }
  };

  // ── Handler: Inline Edit Text (Optimistic) ──
  const handleStartEdit = (todo: TodoItem) => {
    setEditingTodoId(todo.id);
    setEditingText(todo.text);
  };

  const handleSaveEdit = async (todoId: string) => {
    if (!projectId) return;
    const text = editingText.trim();
    if (!text) {
      setEditingTodoId(null);
      return;
    }

    const previousTodo = todos.find((t) => t.id === todoId);
    if (!previousTodo || previousTodo.text === text) {
      setEditingTodoId(null);
      return;
    }

    // Optimistic update
    queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
      old.map((t) => (t.id === todoId ? { ...t, text } : t))
    );
    setEditingTodoId(null);

    try {
      const updated = await api.updateTodo(todoId, { text });
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.map((t) => (t.id === todoId ? updated : t))
      );
    } catch (err: any) {
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.map((t) => (t.id === todoId ? previousTodo : t))
      );
      showToast(`Failed to save edit: ${err?.message || "Unknown error"}`);
    }
  };

  // ── Handler: Delete To-Do (Optimistic) ──
  const handleDelete = async (todoId: string) => {
    if (!projectId) return;
    const previousTodo = todos.find((t) => t.id === todoId);

    // Optimistic delete
    queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
      old.filter((t) => t.id !== todoId)
    );

    try {
      await api.deleteTodo(todoId);
    } catch (err: any) {
      if (previousTodo) {
        queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) => [
          previousTodo,
          ...old,
        ]);
      }
      showToast(`Failed to delete to-do: ${err?.message || "Unknown error"}`);
    }
  };

  // ── Handler: Track Notification ──
  const handleTrackNotification = async (question: ClarificationQuestion) => {
    if (!projectId) return;
    const isAlreadyTracked = question.is_tracked || trackedNotifIds.has(question.question_id);
    if (isAlreadyTracked) return;

    try {
      const created = await api.createTodoFromNotification(projectId, {
        notification_id: question.question_id,
        text: question.question_text || `Review clarification for study ${question.study_id}`,
      });

      // Update todos list optimistically
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) => [
        created,
        ...old,
      ]);

      // Invalidate clarification queries so question reflects tracked state
      queryClient.invalidateQueries({ queryKey: ["pending-clarifications", projectId] });
      showToast("Notification added to To-dos");
    } catch (err: any) {
      showToast(`Failed to track notification: ${err?.message || "Unknown error"}`);
    }
  };

  // ── Handler: Dismiss Notification From Panel ──
  const handleDismissNotification = (questionId: string) => {
    setDismissedNotifIds((prev) => new Set([...prev, questionId]));
  };

  // ── Drag & Drop Handlers (Native HTML5 DnD) ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      try {
        const types = Array.from(e.dataTransfer.types || []);
        if (types.length === 0 || types.includes("application/x-study")) {
          e.dataTransfer.dropEffect = "copy";
          if (!isDragOver) setIsDragOver(true);
        }
      } catch {
        if (!isDragOver) setIsDragOver(true);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the outer container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    let raw = "";
    if (e.dataTransfer && typeof e.dataTransfer.getData === "function") {
      raw = e.dataTransfer.getData("application/x-study");
    }
    if (!raw || !projectId) return;

    try {
      const parsed = JSON.parse(raw);
      const studyId = parsed.studyId || parsed.study_id;
      const title = parsed.title || `Study ${studyId}`;

      if (!studyId) return;

      // Check if an UNTICKED todo with this study_id already exists
      const hasUnticked = activeTodos.some((t) => t.study_id === studyId);
      if (hasUnticked) {
        setPendingDropStudy({ studyId, title });
        return;
      }

      await executeCreateStudyTodo(studyId, title);
    } catch (err: any) {
      showToast("Could not process dropped study data");
    }
  };

  const executeCreateStudyTodo = async (studyId: string, title: string) => {
    if (!projectId) return;
    const tempId = `temp_${Date.now()}`;
    const optimisticTodo: TodoItem = {
      id: tempId,
      project_id: projectId,
      text: title,
      done: false,
      source: "study",
      study_id: studyId,
      study_title: title,
      created_at: new Date().toISOString(),
    };

    queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) => [
      optimisticTodo,
      ...old,
    ]);

    try {
      const created = await api.createTodo(projectId, {
        text: title,
        source: "study",
        study_id: studyId,
      });
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.map((t) => (t.id === tempId ? created : t))
      );
      showToast("Added to To-dos");
    } catch (err: any) {
      queryClient.setQueryData<TodoItem[]>(["todos", projectId], (old = []) =>
        old.filter((t) => t.id !== tempId)
      );
      showToast(`Failed to add study to-do: ${err?.message || "Unknown error"}`);
    }
  };

  return (
    <div
      data-testid="todos-panel"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col h-full bg-[#fbf9f4] text-[#4f444b] select-none transition-colors duration-200 relative",
        isDragOver && "ring-2 ring-inset ring-[#3a0f34] bg-[#eee7ec]/30",
        className
      )}
    >
      {/* Drag Overlay Hint */}
      {isDragOver && (
        <div className="absolute inset-0 z-30 bg-[#fbf9f4]/85 backdrop-blur-2xs flex flex-col items-center justify-center p-4 text-center pointer-events-none">
          <FileText className="h-8 w-8 text-[#3a0f34] mb-2 animate-bounce" />
          <div className="font-serif font-bold text-sm text-[#3a0f34]">Drop Study Here</div>
          <div className="text-xs text-[#62535d] mt-0.5">Creates a linked study to-do</div>
        </div>
      )}

      {/* Duplicate Confirmation Banner (Step 4.4) */}
      {pendingDropStudy && (
        <div className="p-3 bg-[#ffdea6]/40 border-b border-[#d2c2cb] text-xs animate-fadeIn shrink-0">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-[#7c5800] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-[#3a0f34]">Already on the list</div>
              <div className="text-[11px] text-[#62535d] mt-0.5 line-clamp-1">
                "{pendingDropStudy.title}" is already an active to-do. Add anyway?
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const { studyId, title } = pendingDropStudy;
                    setPendingDropStudy(null);
                    await executeCreateStudyTodo(studyId, title);
                  }}
                  className="px-2.5 py-1 rounded bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] text-[11px] font-semibold transition-colors"
                >
                  Add anyway
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDropStudy(null)}
                  className="px-2.5 py-1 rounded border border-[#d2c2cb] bg-white text-[#62535d] hover:bg-[#eee7ec] text-[11px] font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ephemeral Toast Notification inside Panel */}
      {toastMessage && (
        <div className="absolute top-2 left-3 right-3 z-40 p-2 rounded bg-[#3a0f34] text-[#fbf9f4] text-xs font-medium text-center shadow-md animate-fadeIn flex items-center justify-between">
          <span className="truncate">{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="p-0.5 hover:opacity-75">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: NOTIFICATIONS (Clarification Human-in-the-Loop)
          ───────────────────────────────────────────────────────────── */}
      {visibleNotifications.length > 0 && (
        <div className="border-b border-[#d2c2cb] shrink-0">
          {/* Section Header */}
          <div className="px-3.5 py-2 bg-[#eee7ec]/40 flex items-center justify-between border-b border-[#d2c2cb]/50">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#814d75]" />
              <span className="text-[11px] font-bold text-[#3a0f34] tracking-wide uppercase font-mono">
                Notifications
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#814d75] text-[#fbf9f4]">
                {visibleNotifications.length}
              </span>
            </div>
          </div>

          {/* Notifications List (Hairline rules, no card boxes) */}
          <div className="divide-y divide-[rgba(210,194,203,0.45)] max-h-52 overflow-y-auto">
            {visibleNotifications.map((q) => {
              const isTracked = q.is_tracked || trackedNotifIds.has(q.question_id);

              return (
                <div
                  key={q.question_id}
                  className="p-3 hover:bg-[#eee7ec]/30 transition-colors group relative text-xs"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-semibold bg-[#eee7ec] text-[#814d75] shrink-0">
                        {q.stage}
                      </span>
                      {q.pico_aspect && (
                        <span className="text-[10px] text-[#81737b] truncate font-mono">
                          {q.pico_aspect}
                        </span>
                      )}
                    </div>

                    {/* Actions: Track & Dismiss */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isTracked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium text-[#7c5800] bg-[#ffdea6]/50 border border-[#d2c2cb]">
                          <Check className="h-2.5 w-2.5" /> Tracked
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleTrackNotification(q)}
                          className="px-2 py-0.5 rounded border border-[#814d75] text-[#3a0f34] hover:bg-[#814d75] hover:text-[#fbf9f4] font-semibold text-[10px] transition-colors"
                          title="Convert this notification into an active to-do item"
                        >
                          Track
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDismissNotification(q.question_id)}
                        className="p-1 rounded text-[#81737b] hover:text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
                        title="Dismiss notification from panel"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Question snippet & study link */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/screening#clarifications`)}
                    className="cursor-pointer"
                    title="Click to resolve in Screening Dashboard"
                  >
                    <p className="text-[11px] font-medium text-[#4f444b] line-clamp-2 leading-snug">
                      {q.question_text}
                    </p>
                    {q.study_title && (
                      <div className="text-[10px] text-[#81737b] truncate mt-1 flex items-center gap-1">
                        <FileText className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{q.study_title}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: TOP INPUT ROW (Google Tasks: Type + Enter to Add)
          ───────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleAddManualTodo}
        className="px-3 py-2.5 border-b border-[#d2c2cb] flex items-center gap-2 bg-[#ffffff] shrink-0"
      >
        <Plus className="h-4 w-4 text-[#81737b] shrink-0" />
        <input
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddManualTodo();
            }
          }}
          placeholder="Add a to-do..."
          disabled={!projectId || isAdding}
          className="flex-1 bg-transparent text-xs text-[#3a0f34] placeholder:text-[#81737b] outline-none font-medium"
        />
        {newTodoText.trim() && (
          <button
            type="submit"
            disabled={isAdding}
            className="px-2 py-0.5 rounded bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] text-[10px] font-semibold transition-colors"
          >
            {isAdding ? "Adding..." : "Add"}
          </button>
        )}
      </form>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: ACTIVE TO-DOS LIST
          ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto divide-y divide-[rgba(210,194,203,0.45)] text-xs">
        {isLoadingTodos ? (
          <div className="p-8 text-center text-[#81737b]">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#814d75]" />
            <span className="text-xs">Loading to-dos...</span>
          </div>
        ) : activeTodos.length === 0 && completedTodos.length === 0 ? (
          <div className="p-8 text-center text-[#81737b]">
            <CheckCircle2 className="h-6 w-6 text-[#d2c2cb] mx-auto mb-2" />
            <div className="font-serif font-bold text-sm text-[#3a0f34]">All tasks clear</div>
            <p className="text-[11px] text-[#62535d] mt-1 max-w-[240px] mx-auto">
              Type above to add a to-do, track notifications, or drag study rows onto this dock.
            </p>
          </div>
        ) : (
          activeTodos.map((todo) => {
            const isEditing = editingTodoId === todo.id;
            const isStudy = todo.source === "study";
            const isNotification = todo.source === "notification";

            return (
              <div
                key={todo.id}
                className="p-3 hover:bg-[#eee7ec]/30 transition-colors flex items-start gap-2.5 group relative"
              >
                {/* Left Checkbox */}
                <button
                  type="button"
                  onClick={() => handleToggleDone(todo)}
                  className="mt-0.5 w-4 h-4 rounded-xs border border-[#81737b] hover:border-[#3a0f34] flex items-center justify-center shrink-0 transition-colors bg-white"
                  title="Mark as completed"
                  aria-label={`Mark "${todo.text}" completed`}
                >
                  {/* Empty active box */}
                </button>

                {/* To-Do Content */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingText}
                      autoFocus
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={() => handleSaveEdit(todo.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(todo.id);
                        else if (e.key === "Escape") setEditingTodoId(null);
                      }}
                      className="w-full text-xs font-medium border border-[#814d75] rounded px-1.5 py-0.5 outline-none bg-white text-[#3a0f34]"
                    />
                  ) : isStudy ? (
                    /* Study To-do: Document Icon + Click navigates to study */
                    <div>
                      <div
                        onClick={() => {
                          if (projectId && todo.study_id) {
                            navigate(`/projects/${projectId}/studies/${todo.study_id}/pdf`);
                          }
                        }}
                        className="cursor-pointer hover:underline text-[#3a0f34] font-semibold flex items-center gap-1.5"
                        title="Click to open study PDF and extractions"
                      >
                        <FileText className="h-3.5 w-3.5 text-[#814d75] shrink-0" />
                        <span className="truncate">{todo.text}</span>
                        <ExternalLink className="h-2.5 w-2.5 text-[#81737b] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      {todo.study_pmid && (
                        <div className="text-[10px] font-mono text-[#81737b] mt-0.5">
                          PMID: {todo.study_pmid}
                        </div>
                      )}
                    </div>
                  ) : isNotification ? (
                    /* Notification To-do: Sparkle Icon + click navigates */
                    <div>
                      <div
                        onClick={() => {
                          if (projectId) {
                            navigate(`/projects/${projectId}/screening#clarifications`);
                          }
                        }}
                        className="cursor-pointer hover:underline text-[#3a0f34] font-medium flex items-center gap-1.5"
                        title="Click to review screening clarification"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#7c5800] shrink-0" />
                        <span className="truncate">{todo.text}</span>
                      </div>
                      {todo.study_title && (
                        <div className="text-[10px] text-[#81737b] truncate mt-0.5">
                          {todo.study_title}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Manual To-do: Click or double click to inline edit */
                    <div
                      onClick={() => handleStartEdit(todo)}
                      className="cursor-text text-[#4f444b] font-medium leading-snug break-words"
                      title="Click to edit"
                    >
                      {todo.text}
                    </div>
                  )}
                </div>

                {/* Right Hover Actions (Pencil for Study todos, Delete × for all) */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isStudy && !isEditing && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(todo)}
                      className="p-1 rounded text-[#81737b] hover:text-[#3a0f34] hover:bg-[#eee7ec]"
                      title="Edit title text"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(todo.id)}
                    className="p-1 rounded text-[#81737b] hover:text-[#ab3329] hover:bg-[#eee7ec]"
                    title="Delete to-do"
                    aria-label={`Delete "${todo.text}"`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: COMPLETED (N) COLLAPSIBLE SECTION
          ───────────────────────────────────────────────────────────── */}
      {completedTodos.length > 0 && (
        <div className="border-t border-[#d2c2cb] shrink-0 bg-[#fbf9f4]">
          <button
            type="button"
            onClick={() => setIsCompletedOpen(!isCompletedOpen)}
            className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-semibold text-[#62535d] hover:bg-[#eee7ec]/50 transition-colors"
          >
            <span className="font-mono text-[11px]">Completed ({completedTodos.length})</span>
            {isCompletedOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#81737b]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#81737b]" />
            )}
          </button>

          {isCompletedOpen && (
            <div className="divide-y divide-[rgba(210,194,203,0.35)] max-h-48 overflow-y-auto bg-black/[0.015]">
              {completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="p-3 hover:bg-[#eee7ec]/30 transition-colors flex items-start gap-2.5 group text-xs opacity-70"
                >
                  {/* Checked Checkbox (Untick moves it back) */}
                  <button
                    type="button"
                    onClick={() => handleToggleDone(todo)}
                    className="mt-0.5 w-4 h-4 rounded-xs border border-[#3a0f34] bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-center shrink-0 transition-colors"
                    title="Mark uncompleted"
                    aria-label={`Mark "${todo.text}" uncompleted`}
                  >
                    <Check className="h-3 w-3 stroke-[3]" />
                  </button>

                  {/* Strikethrough Text */}
                  <span className="flex-1 min-w-0 line-through text-[#81737b] break-words">
                    {todo.text}
                  </span>

                  {/* Delete Button on Hover */}
                  <button
                    type="button"
                    onClick={() => handleDelete(todo.id)}
                    className="p-1 rounded text-[#81737b] hover:text-[#ab3329] hover:bg-[#eee7ec] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete to-do"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
