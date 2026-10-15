import Link from "next/link";
import type { Report } from "../../src/report";
import { accentFor, reasonFor, tierCounts, SIGNAL_NAMES } from "../../src/card";
import { CardPicker } from "@/components/card-picker";
import { RescanButton } from "@/components/rescan-button";

const TIER_COLOUR = { contradicted: "text-bad", suspicious: "text-warn", credit: "text-good" } as const;

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Receipts read "owner/repo: text", or "login: text" for profile-wide signals. On a
// profile the page already says who, so the owner part is dropped.
function shortReceipt(receipt: string, report: Report): string {
  if (report.kind !== "profile") return receipt;
  const lower = receipt.toLowerCase();
  for (const prefix of [report.target + "/", report.target + ": "]) {
    if (lower.startsWith(prefix)) return receipt.slice(prefix.length);
  }
  return receipt;
}

const TIER_BAR = { contradicted: "bg-bad", suspicious: "bg-warn", credit: "bg-good" } as const;

function Tile({ value, label, highlight }: { value: number; label: string; highlight?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-rule bg-panel px-4 py-3">
      <span className={`text-2xl tabular-nums ${value > 0 && highlight ? highlight : "text-paper"}`}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

// A panel with a header row, the same frame as the archetype list on the home page.
function Panel({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-rule bg-panel">
      <h2 className="flex justify-between border-b border-rule px-4.5 py-3.5 text-[13px] text-muted">
        <span>{title}</span>
        {aside && <span className="text-dim">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

export function ReportView({ report, scannedAt, canRescan }: { report: Report; scannedAt: string; canRescan: boolean }) {
  const counts = tierCounts(report);
  const repos = report.reposScanned.length;

  return (
    // --score drives every accent on the page, same colour the card picks.
    // One grid: score and share on top, receipts and the side panels under them. On a
    // phone it's one column and the share panel moves to the end, after the receipts.
    <article
      style={{ "--score": accentFor(report, "auto") } as React.CSSProperties}
      className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14"
    >
        <div className="flex flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <h1 className="text-lg break-all">
              <span className="text-score">$</span> npx deeplarp {report.target}
            </h1>
            <div className="flex items-center gap-4 text-sm text-dim">
              <span>scanned {formatDate(scannedAt)}</span>
              {canRescan && <RescanButton target={report.target} />}
            </div>
          </div>

          <section className="mt-12 flex flex-col gap-6" aria-label="Score">
            <p className="flex items-end gap-3">
              <span className="font-pixel text-7xl leading-none text-score sm:text-8xl">{report.score ?? "--"}</span>
              <span className="pb-1 text-2xl text-muted">/100</span>
            </p>
            <div>
              <p className="text-2xl font-bold">{report.archetype}</p>
              <p className="mt-1 text-sm text-muted">
                {reasonFor(report)}{" "}
                <Link href="/about" className="text-dim underline decoration-rule underline-offset-4 hover:text-muted">
                  how it&apos;s scored
                </Link>
              </p>
            </div>
          </section>

          <p className="mt-10 text-2xl leading-snug text-pretty text-score sm:text-[28px]">{report.quip}</p>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile value={repos} label={repos === 1 ? "repo scanned" : "repos scanned"} />
            <Tile value={counts.contradicted} label="contradicted" highlight="text-bad" />
            <Tile value={counts.suspicious} label="suspicious" highlight="text-warn" />
            <Tile value={counts.credit} label={counts.credit === 1 ? "credit" : "credits"} highlight="text-good" />
          </div>
        </div>

        <section className="order-last flex flex-col gap-4 lg:order-none lg:pt-1" aria-labelledby="share">
          <h2 id="share" className="text-[13px] text-muted">
            Share the card
          </h2>
          <CardPicker target={report.target} />
        </section>

        <Panel title="Receipts" aside="points">
          {report.signals.length === 0 ? (
            <p className="px-4.5 py-4 text-sm text-dim">Nothing fired.</p>
          ) : (
            <ul>
              {report.signals.map((signal) => (
                <li key={signal.id + signal.tier} className="flex gap-3.5 border-b border-track px-4.5 py-4 last:border-b-0">
                  <span className={`mt-1 w-1 flex-none self-stretch rounded-full ${TIER_BAR[signal.tier]}`} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span>
                        <span className="text-sm font-bold">{SIGNAL_NAMES[signal.id] ?? signal.id}</span>{" "}
                        <span className={`text-xs ${TIER_COLOUR[signal.tier]}`}>{signal.tier}</span>
                      </span>
                      {/* A credit with nothing left to offset is worth 0 here, so it's dimmed. */}
                      <span className={`font-pixel text-[11px] whitespace-nowrap ${signal.points === 0 ? "text-dim" : "text-paper"}`}>
                        {signed(signal.points)}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1 text-[13px] leading-relaxed text-muted">
                      {signal.receipts.map((receipt) => (
                        <li key={receipt} className="flex gap-2.5 break-words">
                          <span className={TIER_COLOUR[signal.tier]} aria-hidden>
                            ›
                          </span>
                          <span className="min-w-0">{shortReceipt(receipt, report)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-8">
          {report.claims.length > 0 && (
            <Panel title="What it claims">
              <ul className="flex flex-col gap-1.5 px-4.5 py-4 text-sm">
                {report.claims.map((claim) => (
                  <li key={claim}>&ldquo;{claim}&rdquo;</li>
                ))}
              </ul>
            </Panel>
          )}

          <details className="group overflow-hidden rounded-lg border border-rule bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4.5 py-3.5 text-[13px] [&::-webkit-details-marker]:hidden">
              <span>Is this you?</span>
              <span className="text-dim group-open:hidden">show the fix list</span>
              <span className="hidden text-dim group-open:inline">hide</span>
            </summary>
            <div className="border-t border-rule px-4.5 py-4">
              <p className="text-[13px] text-muted">What to fix, biggest drop in score first.</p>
              {report.fixes.length === 0 ? (
                <p className="mt-3 text-sm text-dim">Nothing left to fix.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                  {report.fixes.map((fix) => (
                    <li key={fix.text} className="grid grid-cols-[3rem_1fr] gap-x-3">
                      <span className="text-right text-good tabular-nums">{-fix.points}</span>
                      <span>{fix.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </div>
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

export function Broken() {
  return (
    <div>
      <p className="text-lg">
        <span className="text-bad">!</span> Scanning is down.
      </p>
      <p className="mt-4 max-w-[60ch] text-muted">
        GitHub is refusing the site&apos;s access token, so new scans can&apos;t run. Nothing you typed caused this.
        Reports scanned in the last day still load.
      </p>
    </div>
  );
}
