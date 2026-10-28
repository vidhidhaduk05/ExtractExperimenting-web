import React, { useState, useEffect } from "react";
import { CheckCircle2, Circle, Plus, Trash2, ChevronDown, ChevronRight, Check } from "lucide-react";
import { cn } from "../../lib/utils";

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

interface GoogleTasksPanelProps {
  projectId?: string;
}

export function GoogleTasksPanel({ projectId }: GoogleTasksPanelProps) {
  const storageKey = `radextract_tasks_${projectId || "default"}`;

  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: "1", title: "Review preliminary Title & Abstract screening results", completed: false, createdAt: new Date().toISOString() },
      { id: "2", title: "Verify pending candidate duplicates in Deduplication view", completed: false, createdAt: new Date().toISOString() },
      { id: "3", title: "Check citation telephone links for primary studies", completed: true, createdAt: new Date().toISOString() },
    ];
  });

  const [newTitle, setNewTitle] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(tasks));
    } catch (e) {}
  }, [tasks, storageKey]);

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const newTask: TaskItem = {
      id: "task_" + Date.now(),
      title: newTitle.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTasks([newTask, ...tasks]);
    setNewTitle("");
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col h-full bg-[#fbf9f4] text-xs">
      {/* Add Task Input Row (Google Tasks style) */}
      <form onSubmit={handleAddTask} className="p-3 border-b border-[#d2c2cb]/60 bg-white flex items-center gap-2">
        <Plus className="w-4 h-4 text-[#814d75] shrink-0" />
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task (e.g. check Sorber study PDF)..."
          className="flex-1 bg-transparent border-none outline-none text-[#4f444b] placeholder-[#81737b] text-xs font-['Work_Sans']"
        />
        {newTitle.trim() && (
          <button
            type="submit"
            className="px-2 py-0.5 text-[11px] font-semibold bg-[#3a0f34] text-[#fbf9f4] rounded hover:bg-[#1a0017] transition-colors cursor-pointer"
          >
            Add
          </button>
        )}
      </form>

      {/* Task Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#d2c2cb]/30">
        {/* Active Tasks */}
        {activeTasks.length === 0 && completedTasks.length === 0 ? (
          <div className="p-4 text-center text-[#81737b] italic text-[11px]">
            No review tasks yet. Add one above to keep track of studies or notes!
          </div>
        ) : (
          activeTasks.map((task) => (
            <div
              key={task.id}
              className="p-3 flex items-start gap-2.5 hover:bg-black/[0.02] group transition-colors"
            >
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                className="mt-0.5 text-[#81737b] hover:text-[#3a0f34] transition-colors cursor-pointer shrink-0"
                title="Mark as completed"
                aria-label="Mark task completed"
              >
                <Circle className="w-4 h-4 hover:fill-[#eee7ec]" />
              </button>
              <span className="flex-1 text-[#4f444b] font-medium leading-relaxed break-words">
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-[#81737b] hover:text-rose-700 transition-opacity cursor-pointer shrink-0"
                title="Delete task"
                aria-label="Delete task"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}

        {/* Completed Tasks Accordion */}
        {completedTasks.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-[#81737b] hover:text-[#3a0f34] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1">
                {showCompleted ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Completed ({completedTasks.length})
              </span>
            </button>

            {showCompleted && (
              <div className="divide-y divide-[#d2c2cb]/20">
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 flex items-start gap-2.5 hover:bg-black/[0.02] group transition-colors opacity-60"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      className="mt-0.5 text-[#7c5800] transition-colors cursor-pointer shrink-0"
                      title="Mark as incomplete"
                      aria-label="Mark task incomplete"
                    >
                      <CheckCircle2 className="w-4 h-4 fill-[#ffdea6]" />
                    </button>
                    <span className="flex-1 text-[#4f444b] line-through leading-relaxed break-words">
                      {task.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#81737b] hover:text-rose-700 transition-opacity cursor-pointer shrink-0"
                      title="Delete task"
                      aria-label="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

