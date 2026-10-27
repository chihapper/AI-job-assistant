import type { FitAnalysis } from "@/lib/ai/schemas";
import { Badge } from "./ui";

const statusTone = { met: "green", partial: "amber", not_met: "red" } as const;
const statusLabel = { met: "Met", partial: "Partial", not_met: "Not met" } as const;

export function FitPanel({ fit }: { fit: FitAnalysis }) {
  const must = fit.requirements.filter((r) => r.kind === "must_have");
  const nice = fit.requirements.filter((r) => r.kind === "nice_to_have");
  const metCount = must.filter((r) => r.status === "met").length;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={fit.overall === "strong" ? "green" : fit.overall === "good" ? "blue" : fit.overall === "partial" ? "amber" : "red"}>
            Overall: {fit.overall}
          </Badge>
          {must.length > 0 && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {metCount} of {must.length} must-haves met{typeof fit.score === "number" ? ` (${fit.score}%)` : ""}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed">{fit.summary}</p>
      </div>

      {[
        ["Must-haves", must],
        ["Nice-to-haves", nice],
      ].map(([label, list]) =>
        (list as typeof must).length > 0 ? (
          <div key={label as string}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label as string}</h3>
            <ul className="space-y-1.5">
              {(list as typeof must).map((r, i) => (
                <li key={i} className="rounded-md border border-zinc-100 p-2 text-sm dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <span>{r.requirement}</span>
                    <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                  </div>
                  {r.evidence ? <p className="mt-1 text-xs text-zinc-500">Evidence: {r.evidence}</p> : null}
                  {r.gap_advice ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Gap: {r.gap_advice}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}

      {fit.questions_before_applying.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Before applying</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {fit.questions_before_applying.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {fit.red_flags.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-red-600 uppercase">Red flags</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {fit.red_flags.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
