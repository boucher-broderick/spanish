import Link from "next/link";
import { Card, Pill } from "@/components/ui";
import { toc, pdfPageForPrinted } from "@/lib/book";

// Shared table-of-contents used by both Course work and Vocabulary. The `mode`
// decides where each entry links:
//   course -> the page reader (/book/<pdfPage>)
//   vocab  -> the unit's vocabulary tables (/vocab/<unit>)
export function Toc({
  mode,
  availableUnits,
  title,
  subtitle,
  action,
}: {
  mode: "course" | "vocab";
  availableUnits?: Set<number>; // units that have content in this mode (vocab)
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const t = toc();
  const unitHref = (unit: number) =>
    mode === "course" ? `/unit/${unit}` : `/vocab/${unit}`;
  const sectionHref = (unit: number, printed: number) =>
    mode === "course" ? `/unit/${unit}#p${pdfPageForPrinted(printed)}` : `/vocab/${unit}#p${printed}`;
  const isAvailable = (unit: number) => !availableUnits || availableUnits.has(unit);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>

      <div className="space-y-3">
        {t.units.map((u) => {
          const available = isAvailable(u.unit);
          return (
            <Card key={u.unit} className="p-3">
              {available ? (
                <Link
                  href={unitHref(u.unit)}
                  className="flex items-baseline gap-2 rounded-lg px-2 py-1 hover:bg-slate-50"
                >
                  <span className="text-xs font-bold text-indigo-600">UNIT {u.unit}</span>
                  <span className="flex-1 font-semibold text-slate-900">{u.title}</span>
                  <span className="text-xs tabular-nums text-slate-400">{u.page}</span>
                </Link>
              ) : (
                <div className="flex items-baseline gap-2 px-2 py-1 opacity-50">
                  <span className="text-xs font-bold text-slate-400">UNIT {u.unit}</span>
                  <span className="flex-1 font-semibold text-slate-500">{u.title}</span>
                  <Pill tone="slate">soon</Pill>
                </div>
              )}
              {available && (
                <div className="mt-1 border-t border-slate-100 pt-1">
                  {u.sections.map((s, i) => (
                    <Link
                      key={`${s.title}-${i}`}
                      href={sectionHref(u.unit, s.page)}
                      className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 pl-4 hover:bg-slate-50"
                    >
                      <span className="flex-1 text-sm text-slate-600">{s.title}</span>
                      <span className="text-slate-300">·····</span>
                      <span className="text-xs tabular-nums text-slate-400">{s.page}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {mode === "course" && (
        <div className="mt-4 space-y-1">
          {t.backMatter.map((b) => (
            <Card key={b.title} className="p-2">
              <Link
                href={`/book/${pdfPageForPrinted(b.page)}`}
                className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="flex-1 font-medium text-slate-800">{b.title}</span>
                <span className="text-xs tabular-nums text-slate-400">{b.page}</span>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
