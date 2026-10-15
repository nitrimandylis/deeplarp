import Image from "next/image";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";
import exampleCard from "@/public/example-card.png";

// The nine archetypes, in the order a score climbs. The colour is the score's, not the
// archetype's: the six group archetypes land anywhere from 20 to 100, yellow under 75
// and red from 75, so they get both colours.
const ROSTER = [
  { name: "Real One", reason: "tests or merged PRs back it up", band: "0-19", colors: ["#5ccf8a"] },
  { name: "Unproven", reason: "nothing contradicted, nothing proven", band: "0-19", colors: ["#8a8f98"] },
  { name: "NPC", reason: "under 3 repos or 30 days", band: "--", colors: ["#8a8f98"] },
  { name: "Wrapper Founder", reason: "an SDK call pitched as an engine", band: "20+", colors: ["#f2b134", "#ff5c39"] },
  { name: "Tutorial Graduate", reason: "template leftovers, README padding", band: "20+", colors: ["#f2b134", "#ff5c39"] },
  { name: "Contribution Farmer", reason: "backdated commits, fork padding", band: "20+", colors: ["#f2b134", "#ff5c39"] },
  { name: "Prompt Engineer", reason: "tutorial + wrapper", band: "20+", colors: ["#f2b134", "#ff5c39"] },
  { name: "Hype Merchant", reason: "farmer + wrapper", band: "20+", colors: ["#f2b134", "#ff5c39"] },
  { name: "Portfolio Speedrunner", reason: "farmer + tutorial", band: "20+", colors: ["#f2b134", "#ff5c39"] },
];

export default function Home() {
  return (
    <div data-wide className="flex flex-col gap-16 lg:gap-18">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        <div className="flex flex-col gap-7">
          <p className="flex gap-3 text-sm text-muted">
            <span className="text-score">$</span> claims against code, for GitHub
          </p>
          <h1 className="text-5xl leading-none font-bold tracking-[-0.025em] text-pretty sm:text-[64px]">
            Zero larp tolerance.
          </h1>
          <p className="text-[17px] leading-relaxed text-pretty text-muted">
            Type a user or a repo. About ten seconds later you get a score out of 100, which of the nine archetypes it
            is, and the receipts.
          </p>
          <ScanForm />
          <div className="flex flex-col gap-1.5 text-[13px] text-muted">
            <p>
              Or swap <span className="text-paper">github.com</span> for{" "}
              <span className="text-paper">deeplarp.nicktrim.com</span> in any GitHub link.
            </p>
            <p>
              In a terminal: <code className="text-paper">npx deeplarp &lt;user&gt;</code>
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border border-rule bg-panel" aria-labelledby="roster">
          <h2 id="roster" className="flex justify-between border-b border-rule px-4.5 py-3.5 text-[13px] text-muted">
            <span>The nine archetypes</span>
            <span className="text-dim">score</span>
          </h2>
          <ul>
            {ROSTER.map((r) => (
              <li key={r.name} className="flex items-center gap-3.5 border-b border-track px-4.5 py-3 last:border-b-0">
                <span className="flex h-7 w-1 flex-none flex-col overflow-hidden rounded-full" aria-hidden>
                  {r.colors.map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-bold">{r.name}</span>
                  <span className="truncate text-xs text-muted">{r.reason}</span>
                </span>
                <span className="font-pixel text-[10px] whitespace-nowrap" style={{ color: r.colors[0] }}>
                  {r.band}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        <Link
          href="/nitrimandylis"
          className="block overflow-hidden rounded-lg border border-rule focus-visible:ring-2 focus-visible:ring-muted focus-visible:outline-none"
        >
          <Image
            src={exampleCard}
            alt="Example card: nitrimandylis scores 0/100, Real One, backed by tests in six repos"
            className="block w-full"
            sizes="(min-width: 1024px) 620px, 100vw"
            priority
          />
        </Link>
        <div className="flex flex-col gap-3.5 lg:pt-2">
          <h2 className="text-[15px]">What you get back</h2>
          <p className="text-sm leading-relaxed text-pretty text-muted">
            A report page and this card, in wide, square and story sizes. This one is the author&apos;s own profile.
            Click it for the full report.
          </p>
          <ul className="flex flex-col gap-1.5 text-[13px] text-muted">
            <li className="flex gap-2.5">
              <span className="text-score">›</span>score, archetype, roast line
            </li>
            <li className="flex gap-2.5">
              <span className="text-score">›</span>receipts, with the points each one cost
            </li>
            <li className="flex gap-2.5">
              <span className="text-score">›</span>a fix list, if it&apos;s you
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
