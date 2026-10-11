import { Bookmark } from "lucide-react";

export function BookmarkButton({ saved, disabled, onClick }: {
  saved: boolean; disabled: boolean; onClick: () => void;
}) {
  return <button type="button" aria-pressed={saved}
    aria-label={saved ? "Remove bookmark" : "Save for later"}
    title={saved ? "Remove bookmark" : "Save for later"} disabled={disabled}
    onClick={event => { event.stopPropagation(); onClick(); }}
    className={`inline-flex items-center gap-1 rounded-md p-1.5 text-xs disabled:opacity-40 ${saved ? "text-amber-700 bg-amber-50" : "text-slate-500 hover:bg-slate-100"}`}>
    <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
  </button>;
}
