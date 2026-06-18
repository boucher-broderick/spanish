"use client";
import { useState, KeyboardEvent } from "react";
import { cx } from "@/components/ui";
import { grade, type Verdict } from "@/lib/grade";
import type { PageBlank } from "@/lib/book";

// One typeable blank, absolutely positioned over the underscore line on the page
// image. Coordinates are normalized (0..1) so it scales with the rendered image.
export function BlankInput({
  blank,
  value,
  reveal,
  onChange,
}: {
  blank: PageBlank;
  value: string;
  reveal: boolean;
  onChange: (v: string, verdict: Verdict) => void;
}) {
  const [val, setVal] = useState(value);
  const [verdict, setVerdict] = useState<Verdict>("empty");
  // Reflect an externally-loaded value (saved progress arrives async) without an
  // effect, per the React "info from previous renders" pattern.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setVal(value);
  }

  const box = blank.box;
  if (!box) return null;

  const check = () => {
    const v = blank.gradable ? grade(val, blank.answers) : "empty";
    setVerdict(v);
    onChange(val, v);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  const tone =
    !blank.gradable ? "border-slate-400 focus:border-indigo-500"
    : verdict === "correct" ? "border-emerald-500 bg-emerald-50/70 text-emerald-800"
    : verdict === "incorrect" ? "border-rose-500 bg-rose-50/70 text-rose-800"
    : "border-slate-400 focus:border-indigo-500";

  // The detected box.y is the underscore line; sit the input just above it.
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    transform: "translateY(-90%)",
  };

  return (
    <div style={style} className="group">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={check}
        onKeyDown={onKey}
        spellCheck={false}
        autoComplete="off"
        aria-label={blank.gradable ? `Answer for item ${blank.item}` : `Item ${blank.item}`}
        className={cx(
          "w-full bg-transparent text-center font-medium leading-none outline-none",
          "border-b-2 px-0.5 pb-0.5 text-[clamp(11px,1.05vw,16px)] text-indigo-700",
          tone
        )}
      />
      {reveal && blank.gradable && (
        <div className="pointer-events-none absolute left-0 top-full mt-0.5 w-max max-w-[60vw] rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 shadow-sm">
          {blank.answers[0]}
        </div>
      )}
    </div>
  );
}
