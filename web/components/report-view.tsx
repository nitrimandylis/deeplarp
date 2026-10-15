import type { Report } from "../../src/report";
import { accentFor, reasonFor, tierCounts } from "../../src/card";
import { CardPicker } from "@/components/card-picker";
import { RescanButton } from "@/components/rescan-button";

const TIER_COLOUR = { contradicted: "text-bad", suspicious: "text-warn", credit: "text-good" } as const;

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// On a profile every receipt starts with "owner/". Drop it, the page already says who.
function shortReceipt(receipt: string, report: Report): string {
  const prefix = report.target + "/";
  return report.kind === "profile" && receipt.toLowerCase().startsWith(prefix) ? receipt.slice(prefix.length) : receipt;
}

export function ReportView({ report, scannedAt, canRescan }: { report: Report; scannedAt: string; canRescan: boolean }) {
  const counts = tierCounts(report);
  const repos = report.kind === "profile" ? plural(report.reposScanned.length, "repo") : "1 repo";

  return (
    // --score drives every accent on the page, same colour the card picks.
    <article style={{ "--score": accentFor(report, "auto") } as React.CSSProperties}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h1 className="text-lg">
          <span className="text-score">$</span> npx deeplarp {report.target}
        </h1>
        <div className="flex items-center gap-4 text-sm text-dim">
          <span>scanned {formatDate(scannedAt)}</span>
          {canRescan && <RescanButton target={report.target} />}
        </div>
      </div>

      <section className="mt-12 flex flex-wrap items-end gap-x-10 gap-y-6" aria-label="Score">
        <p className="flex items-end gap-3">
          <span className="font-pixel text-7xl leading-none text-score sm:text-8xl">{report.score ?? "--"}</span>
          <span className="pb-1 text-2xl text-muted">/100</span>
        </p>
        <div className="pb-1">
          <p className="text-2xl font-bold tracking-wide">{report.archetype}</p>
          <p className="mt-1 text-muted">{reasonFor(report)}</p>
        </div>
      </section>

      <p className="mt-10 max-w-[38ch] text-2xl leading-snug text-balance text-score sm:text-3xl">{report.quip}</p>

      <p className="mt-8 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span>{repos} scanned</span>
        <span>{counts.contradicted} contradicted</span>
        <span>{counts.suspicious} suspicious</span>
        <span>{plural(counts.credit, "credit")}</span>
      </p>

      {report.claims.length > 0 && (
        <section className="mt-14">
          <h2 className="text-muted">What it claims</h2>
          <ul className="mt-4 space-y-1">
            {report.claims.map((claim) => (
              <li key={claim}>&ldquo;{claim}&rdquo;</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-14">
        <h2 className="text-muted">Receipts</h2>
        {report.signals.length === 0 ? (
          <p className="mt-4 text-dim">Nothing fired.</p>
        ) : (
          <ul className="mt-4 space-y-5">
            {report.signals.map((signal) => (
              <li key={signal.id + signal.tier} className="grid grid-cols-[3.5rem_1fr] gap-x-3 sm:grid-cols-[3.5rem_8.5rem_1fr]">
                <span className="text-right tabular-nums">{signed(signal.points)}</span>
                <span className={TIER_COLOUR[signal.tier]}>{signal.tier}</span>
                <ul className="col-start-2 mt-1 space-y-1 break-words text-paper/90 sm:col-start-3 sm:mt-0">
                  {signal.receipts.map((receipt) => (
                    <li key={receipt}>{shortReceipt(receipt, report)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="group mt-14 rounded-lg border border-rule bg-panel">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span>Is this you?</span>
          <span className="text-dim transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" aria-hidden>
            ›
          </span>
        </summary>
        <div className="border-t border-rule px-5 py-4">
          <p className="text-sm text-muted">What to fix, biggest drop in score first.</p>
          {report.fixes.length === 0 ? (
            <p className="mt-4 text-dim">Nothing left to fix.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {report.fixes.map((fix) => (
                <li key={fix.text} className="grid grid-cols-[3.5rem_1fr] gap-x-3">
                  <span className="text-right text-good tabular-nums">{-fix.points}</span>
                  <span>{fix.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <section className="mt-14">
        <h2 className="mb-4 text-muted">Share the card</h2>
        <CardPicker target={report.target} />
      </section>
    </article>
  );
}

export function Busy({ message }: { message: string }) {
  return (
    <div>
      <p className="text-lg">
        <span className="text-warn">!</span> Too many scans right now.
      </p>
      <p className="mt-4 text-muted">{message} Reports scanned in the last day still load.</p>
    </div>
  );
}
