"use client";

const CHARS = ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"];

// Inserts a character into the currently-focused input/textarea in a way React detects.
function insertIntoActive(ch: string) {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
  const proto = el.tagName === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + ch + el.value.slice(end);
  setter?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const pos = start + ch.length;
  el.setSelectionRange(pos, pos);
}

// Sticky bar of accented characters; tapping inserts without losing input focus.
export function AccentBar() {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap gap-1.5 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
      {CHARS.map((c) => (
        <button
          key={c}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertIntoActive(c)}
          className="min-w-9 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-base font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200"
        >
          {c}
        </button>
      ))}
    </div>
  );
}
