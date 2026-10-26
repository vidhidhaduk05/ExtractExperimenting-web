import { Bookmark } from "lucide-react";

export function BookmarkButton({ saved, disabled, onClick }: {
  saved: boolean; disabled: boolean; onClick: () => void;
}) {
  return <button type="button" aria-pressed={saved}
    aria-label={saved ? "Remove bookmark" : "Save for later"}
    title={saved ? "Remove bookmark" : "Save for later"} disabled={disabled}
    onClick={event => { event.stopPropagation(); onClick(); }}
    className={`inline-flex items-center gap-1 rounded-md p-1.5 text-xs transition-colors disabled:opacity-40 cursor-pointer ${saved ? "text-[#3a0f34] bg-[#ffdea6] border border-[#d2c2cb]" : "text-[#81737b] hover:bg-[#eee7ec] hover:text-[#3a0f34]"}`}>
    <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
  </button>;
}
