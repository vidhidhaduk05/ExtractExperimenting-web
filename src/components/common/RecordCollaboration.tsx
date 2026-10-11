import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag, MessageSquare, Plus, Trash2, Send, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { type ProjectTag } from "../../lib/recordCollaboration";

interface RecordCollaborationPanelProps {
  projectId: string;
  studyId: string;
}

export function RecordCollaborationPanel({ projectId, studyId }: RecordCollaborationPanelProps) {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [newTagName, setNewTagName] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["record-comments", projectId, studyId],
    queryFn: async () => {
      try {
        return (await (api as any).getRecordComments?.(projectId, studyId)) || [];
      } catch {
        return [];
      }
    },
    enabled: !!projectId && !!studyId,
  });

  const { data: tags = [] } = useQuery<ProjectTag[]>({
    queryKey: ["record-tags", projectId, studyId],
    queryFn: async () => {
      try {
        return (await (api as any).getRecordTags?.(projectId, studyId)) || [];
      } catch {
        return [];
      }
    },
    enabled: !!projectId && !!studyId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (text: string) => (api as any).addRecordComment?.(projectId, studyId, text),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["record-comments", projectId, studyId] });
    },
  });

  const addTagMutation = useMutation({
    mutationFn: (tagName: string) => (api as any).addRecordTag?.(projectId, studyId, tagName),
    onSuccess: () => {
      setNewTagName("");
      queryClient.invalidateQueries({ queryKey: ["record-tags", projectId, studyId] });
      queryClient.invalidateQueries({ queryKey: ["project-tags", projectId] });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: string) => (api as any).deleteRecordTag?.(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["record-tags", projectId, studyId] });
      queryClient.invalidateQueries({ queryKey: ["project-tags", projectId] });
    },
  });

  return (
    <div className="p-4 space-y-4 bg-slate-50/50 rounded-b-lg border-t border-slate-200 text-xs">
      {/* Tag Management */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Tag className="w-3.5 h-3.5 text-indigo-600" />
          <span>Record Tags</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {tags.map((t) => (
            <span
              key={t.tag_id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-medium"
            >
              {t.tag_name}
              <button
                onClick={() => deleteTagMutation.mutate(t.tag_id)}
                className="hover:text-indigo-900"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="Add tag..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="px-2 py-0.5 border border-slate-300 rounded text-xs w-24 bg-white"
            />
            <button
              onClick={() => newTagName.trim() && addTagMutation.mutate(newTagName.trim())}
              disabled={!newTagName.trim() || addTagMutation.isPending}
              className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Collaboration Comments */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
          <span>Team Discussion</span>
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.comment_id || c.id} className="p-2 bg-white rounded border border-slate-200 text-xs">
              <div className="flex items-center justify-between font-semibold text-slate-800 mb-0.5">
                <span>{c.author || "Reviewer"}</span>
                <span className="text-[10px] text-slate-400 font-normal">{c.created_at || "Just now"}</span>
              </div>
              <p className="text-slate-600 leading-relaxed">{c.comment_text || c.text}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Write a comment or note..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="flex-1 p-1.5 border border-slate-300 rounded text-xs bg-white"
          />
          <button
            onClick={() => commentText.trim() && addCommentMutation.mutate(commentText.trim())}
            disabled={!commentText.trim() || addCommentMutation.isPending}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
          >
            {addCommentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

export function TagBadges({ index, studyId }: { index: ProjectTag[] | undefined; studyId: string }) {
  if (!index) return null;
  const studyTags = index.filter((t) => t.study_id === studyId);
  if (studyTags.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap my-1">
      {studyTags.map((t) => (
        <span
          key={t.tag_id}
          className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200"
        >
          {t.tag_name}
        </span>
      ))}
    </div>
  );
}

export function TagFilter({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const { data: tags = [] } = useQuery<ProjectTag[]>({
    queryKey: ["project-tags", projectId],
    queryFn: async () => {
      try {
        return (await (api as any).getProjectTags?.(projectId)) || [];
      } catch {
        return [];
      }
    },
    enabled: !!projectId,
  });

  const uniqueTags = Array.from(new Set(tags.map((t) => t.tag_name)));

  if (uniqueTags.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 font-medium">Filter by Tag:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700"
      >
        <option value="">All Tags</option>
        {uniqueTags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
