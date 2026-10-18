import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, LockKeyhole, Tag, X } from "lucide-react";
import {
  collaborationAvailability, collaborationKey, recordCollaboration, useProjectTags,
  type AnnotationInput, type ProjectTag, type TagIndex,
} from "../../lib/recordCollaboration";

const buttonClass = "shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed";
const inputClass = "min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400";

function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{message}
    {retry && <button type="button" className="ml-2 underline" onClick={retry}>Retry</button>}
  </p>;
}

export function CollaborationDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current!;
    element.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const focusable = Array.from(element.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex='0']"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) {
        event.preventDefault(); first?.focus();
      }
    };
    element.addEventListener("keydown", keydown);
    return () => { element.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div ref={panel} role="dialog" aria-modal="true" aria-label={title} data-record-collaboration tabIndex={-1}
      className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl space-y-4">
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button type="button" className={buttonClass} aria-label="Close dialog" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>{children}
    </div>
  </div>;
}

function TagEditor({ tag, pending, onSave, onArchive }: {
  tag: ProjectTag; pending: boolean; onSave: (name: string) => void; onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  return <li className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2">
    {editing ? <form className="flex flex-1 gap-2" onSubmit={e => { e.preventDefault(); onSave(name); }}>
      <input aria-label={`Rename ${tag.name}`} className={inputClass} value={name} maxLength={80} disabled={pending} onChange={e => setName(e.target.value)} />
      <button type="submit" className={buttonClass} disabled={pending || !name.trim()}>Save</button>
      <button type="button" className={buttonClass} disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
    </form> : <><span className="min-w-0 flex-1 break-words text-sm">{tag.name} {tag.archived && <span className="text-slate-500">(archived)</span>}</span>
      <button type="button" className={buttonClass} disabled={pending} onClick={() => { setName(tag.name); setEditing(true); }}>Rename</button></>}
    <button type="button" className={buttonClass} disabled={pending} onClick={onArchive}>{tag.archived ? "Restore" : "Archive"}</button>
  </li>;
}

function TagManager({ projectId }: { projectId: string }) {
  const tags = useProjectTags(projectId);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: (action: { name: string } | { id: string; name?: string; archived?: boolean }) =>
      "id" in action ? recordCollaboration.updateTag(projectId, action.id, { name: action.name, archived: action.archived }) : recordCollaboration.createTag(projectId, action.name),
    onSuccess: async (_, action) => {
      if (!("id" in action)) setNewName("");
      await client.invalidateQueries({ queryKey: collaborationKey(projectId) });
    },
    onSettled: () => { busy.current = false; },
  });
  const run = (action: Parameters<typeof mutation.mutate>[0]) => {
    if (busy.current || !tags.data?.can_write) return;
    busy.current = true; mutation.mutate(action);
  };
  const unavailable = collaborationAvailability();
  if (unavailable) return <p className="text-sm text-slate-600">{unavailable}</p>;
  return <div className="space-y-3">
    <p className="text-sm text-slate-600">Tags are shared within this project. Renaming updates every tagged record. Archiving retains existing assignments.</p>
    {tags.error && <ErrorNotice message={tags.error.message} retry={() => { void tags.refetch(); }} />}
    {mutation.error && <ErrorNotice message={mutation.error.message} retry={() => { if (mutation.variables) run(mutation.variables); }} />}
    <input className={inputClass} aria-label="Search project tags" placeholder="Search tags…" value={search} onChange={e => setSearch(e.target.value)} />
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Show archived tags</label>
    {tags.isLoading && <p className="text-sm text-slate-500">Loading tags…</p>}
    {tags.data?.can_write && <form className="flex gap-2" onSubmit={e => { e.preventDefault(); run({ name: newName }); }}>
      <input className={inputClass} aria-label="New tag name" placeholder="New tag name" maxLength={80} value={newName} disabled={mutation.isPending} onChange={e => setNewName(e.target.value)} />
      <button type="submit" className={buttonClass} disabled={mutation.isPending || !newName.trim()}>Create tag</button>
    </form>}
    <ul>{tags.data?.tags.filter(t => (showArchived || !t.archived) && t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(t =>
      tags.data.can_write ? <TagEditor key={`${t.tag_id}:${t.name}`} tag={t} pending={mutation.isPending}
        onSave={name => run({ id: t.tag_id, name })} onArchive={() => run({ id: t.tag_id, archived: !t.archived })} /> :
        <li key={t.tag_id} className="py-2 text-sm">{t.name}{t.archived ? " (archived)" : ""}</li>)}</ul>
    {tags.data && !tags.data.tags.some(t => (showArchived || !t.archived) && t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="text-sm text-slate-500">No matching tags.</p>}
    {mutation.isPending && <p role="status" className="text-xs text-slate-500">Saving tag…</p>}
    {tags.data && !tags.data.can_write && <p className="text-xs text-slate-500">Reviewer access is required to manage tags.</p>}
  </div>;
}

export function TagFilter({ projectId, value, onChange }: { projectId: string; value: string; onChange: (value: string) => void }) {
  const tags = useProjectTags(projectId);
  const [manage, setManage] = useState(false);
  const [search, setSearch] = useState("");
  const unavailable = collaborationAvailability();
  const active = tags.data?.tags.filter(t => !t.archived) || [];
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <Tag className="h-3.5 w-3.5 text-slate-500" />
    <input className="max-w-32 rounded border border-slate-300 px-2 py-1.5" aria-label="Find a tag to filter" placeholder="Find tag…" value={search} disabled={!!unavailable} onChange={e => setSearch(e.target.value)} />
    <select aria-label="Filter studies by tag" className="max-w-48 rounded border border-slate-300 bg-white px-2 py-1.5" value={value}
      disabled={!!unavailable || !tags.isSuccess} onChange={e => onChange(e.target.value)}>
      <option value="">All tags</option>
      {tags.data?.tags.filter(t => t.tag_id === value || (!t.archived && t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))).map(t =>
        <option key={t.tag_id} value={t.tag_id}>{t.name}{t.archived ? " (archived)" : ""}</option>)}
    </select>
    {value && <button type="button" className="underline" onClick={() => onChange("")}>Clear tag filter</button>}
    <button type="button" className={buttonClass} disabled={!!unavailable} onClick={() => setManage(true)}>Manage tags ({active.length})</button>
    {tags.error && <ErrorNotice message={tags.error.message} retry={() => { void tags.refetch(); }} />}
    {manage && <CollaborationDialog title="Manage project tags" onClose={() => setManage(false)}><TagManager projectId={projectId} /></CollaborationDialog>}
  </div>;
}

export function TagBadges({ index, studyId }: { index: TagIndex | undefined; studyId: string }) {
  const ids = index?.study_tags[studyId] || [];
  return <div className="flex flex-wrap gap-1 mt-1">{index?.tags.filter(t => ids.includes(t.tag_id)).map(t =>
    <span key={t.tag_id} className={`max-w-full break-words rounded px-2 py-0.5 text-[11px] ${t.archived ? "bg-slate-100 text-slate-500" : "bg-indigo-50 text-indigo-800"}`}>{t.name}{t.archived ? " (archived)" : ""}</span>)}</div>;
}

export function RecordCollaborationPanel({ projectId, studyId }: { projectId: string; studyId: string }) {
  const [visibility, setVisibility] = useState<"shared" | "private">("shared");
  const [text, setText] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [newTag, setNewTag] = useState("");
  const attempt = useRef<AnnotationInput | null>(null);
  const busy = useRef(false);
  const client = useQueryClient();
  const tags = useProjectTags(projectId);
  const unavailable = collaborationAvailability();
  const notesKey = [...collaborationKey(projectId, studyId), "annotations"];
  const notes = useQuery({ queryKey: notesKey, queryFn: () => recordCollaboration.listAnnotations(studyId),
    enabled: !unavailable, retry: false, refetchInterval: 15000 });
  const comment = useMutation({
    mutationFn: (body: AnnotationInput) => recordCollaboration.addAnnotation(studyId, body),
    onSuccess: saved => {
      client.setQueryData<{ annotations: typeof saved[]; can_write: boolean }>(notesKey, previous => ({
        annotations: [...(previous?.annotations || []).filter(n => n.annotation_id !== saved.annotation_id), saved],
        can_write: previous?.can_write || false,
      }));
      setText(""); attempt.current = null;
    },
    onSettled: () => { busy.current = false; },
  });
  const tagMutation = useMutation({
    mutationFn: async (action: { id: string; attached: boolean } | { name: string }) => {
      if ("name" in action) {
        const created = await recordCollaboration.createTag(projectId, action.name);
        setNewTag("");
        // Creation and assignment have separate states; a failed assignment remains visible and retryable.
        await client.invalidateQueries({ queryKey: collaborationKey(projectId) });
        try {
          await recordCollaboration.setTag(studyId, created.tag_id, true);
        } catch (error) {
          throw new Error(`Tag created, but it could not be added to this record. Select its checkbox to retry. ${error instanceof Error ? error.message : ""}`);
        }
      } else await recordCollaboration.setTag(studyId, action.id, action.attached);
    },
    onSuccess: () => setNewTag(""),
    onSettled: async () => { await client.invalidateQueries({ queryKey: collaborationKey(projectId) }); },
  });
  const submit = () => {
    if (busy.current || !notes.data?.can_write || !text.trim()) return;
    if (!attempt.current || attempt.current.text !== text.trim() || attempt.current.visibility !== visibility) {
      attempt.current = { text: text.trim(), visibility, request_id: crypto.randomUUID() };
    }
    busy.current = true; comment.mutate(attempt.current);
  };
  const assigned = tags.data?.study_tags[studyId] || [];
  const canTag = !!tags.data?.can_write && !tagMutation.isPending;
  if (unavailable) return <section className="rounded-lg border border-slate-200 p-4 text-sm text-slate-600"><h3 className="font-semibold mb-1">Comments and tags</h3>{unavailable}</section>;
  return <section aria-label="Record comments and tags" className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="h-4 w-4" />Comments and tags</h3>
    <div className="space-y-2">
      <TagBadges index={tags.data} studyId={studyId} />
      {tags.error && <ErrorNotice message={tags.error.message} retry={() => { void tags.refetch(); }} />}
      {tagMutation.error && <ErrorNotice message={tagMutation.error.message}
        retry={tagMutation.variables && "id" in tagMutation.variables ? () => { if (canTag && tagMutation.variables) tagMutation.mutate(tagMutation.variables); } : undefined} />}
      <input aria-label="Search tags for this record" placeholder="Search tags to add or remove…" className={inputClass} value={tagSearch} onChange={e => setTagSearch(e.target.value)} />
      <div className="max-h-36 overflow-y-auto flex flex-wrap gap-2">{tags.data?.tags.filter(t => (!t.archived || assigned.includes(t.tag_id)) && t.name.toLocaleLowerCase().includes(tagSearch.toLocaleLowerCase())).map(t =>
        <label key={t.tag_id} className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-xs">
          <input type="checkbox" checked={assigned.includes(t.tag_id)} disabled={!canTag || (t.archived && !assigned.includes(t.tag_id))}
            onChange={e => tagMutation.mutate({ id: t.tag_id, attached: e.target.checked })} />
          {t.name}{t.archived ? " (archived)" : ""}
        </label>)}</div>
      {tags.data?.can_write && <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (canTag && newTag.trim()) tagMutation.mutate({ name: newTag }); }}>
        <input className={inputClass} aria-label="Create a tag for this record" placeholder="New tag name" maxLength={80} value={newTag} disabled={!canTag} onChange={e => setNewTag(e.target.value)} />
        <button className={buttonClass} type="submit" disabled={!canTag || !newTag.trim()}>Create and add</button>
      </form>}
      {tagMutation.isPending && <p role="status" className="text-xs text-slate-500">Saving tags…</p>}
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Comment visibility">
      <button type="button" aria-pressed={visibility === "shared"} className={`${buttonClass} ${visibility === "shared" ? "bg-indigo-100 text-indigo-900" : "bg-white"}`} disabled={comment.isPending} onClick={() => setVisibility("shared")}>Shared comments</button>
      <button type="button" aria-pressed={visibility === "private"} className={`${buttonClass} flex items-center gap-1 ${visibility === "private" ? "bg-indigo-100 text-indigo-900" : "bg-white"}`} disabled={comment.isPending} onClick={() => setVisibility("private")}><LockKeyhole className="h-3 w-3" />My private notes</button>
    </div>
    <p className="text-xs text-slate-600">{visibility === "shared" ? "Visible to project members." : "Visible only to your signed-in account, including when other reviewers open this record."}</p>
    {notes.error && <ErrorNotice message={notes.error.message} retry={() => { void notes.refetch(); }} />}
    {notes.isLoading && <p className="text-sm text-slate-500">Loading comments…</p>}
    {notes.data && <ul className="max-h-64 overflow-y-auto space-y-3">{notes.data.annotations.filter(n => n.visibility === visibility).map(n =>
      <li key={n.annotation_id} className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-1 flex flex-wrap gap-2 text-xs text-slate-500"><strong className="text-slate-700">{n.author_name}</strong><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time></div>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{n.text}</p>
      </li>)}</ul>}
    {notes.data && !notes.data.annotations.some(n => n.visibility === visibility) && <p className="text-sm text-slate-500">{visibility === "shared" ? "No shared comments yet." : "No private notes yet."}</p>}
    {notes.data?.can_write && <form className="space-y-2" onSubmit={e => { e.preventDefault(); submit(); }}>
      <textarea className={inputClass} aria-label={visibility === "shared" ? "Write a shared comment" : "Write a private note"}
        rows={3} maxLength={10000} value={text} disabled={comment.isPending} onChange={e => setText(e.target.value)} />
      {comment.error && <ErrorNotice message={`${comment.error.message} Your draft is kept.`} retry={submit} />}
      <button type="submit" className={buttonClass} disabled={comment.isPending || !text.trim()}>{comment.isPending ? "Saving…" : visibility === "shared" ? "Post comment" : "Save private note"}</button>
    </form>}
    {notes.data && !notes.data.can_write && <p className="text-xs text-slate-500">Reviewer access is required to add comments or notes.</p>}
  </section>;
}
