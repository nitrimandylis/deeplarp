import type { Metadata } from "next";
import Link from "next/link";
import { WEIGHTS, MAX_REPEATS, MAX_CREDIT, SUSPICION_CAP, REAL_ONE_BELOW } from "../../../../src/score";
import { OPT_OUT_URL, REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "How deeplarp scores: deeplarp",
  description: "The signals, points and rules behind a deeplarp larp score.",
};

// The text is written here; the points come from src/score.ts so they can't drift.
const SIGNALS = [
  { id: "2", tier: "contradicted", name: "LLM wrapper", what: "Claims \"agentic\", \"autonomous\", \"AI engine\" or \"AI-powered\", but the logic is mostly calls to an LLM SDK. A plain \"agent\" doesn't count: an agent on an SDK is an honest description." },
  { id: "3", tier: "contradicted", name: "Empty claim", what: "Hype words like \"production-ready\" or \"world's first\" in the pitch, over less than 50 lines of code. Docs repos, lists and profile READMEs are skipped." },
  { id: "5", tier: "contradicted", name: "Stack mismatch", what: "The README claims a language that GitHub's language breakdown doesn't show." },
  { id: "4", tier: "contradicted", name: "Template leftovers", what: "create-next-app or Vite defaults, or a tutorial's names, under a \"built from scratch\" claim. Without that claim it counts as suspicious." },
  { id: "8", tier: "contradicted", name: "Backdated commits", what: "Scripted-looking runs of commits (one message repeated, or one clock time) dated before the repo existed. Old author dates on their own count as suspicious." },
  { id: "1", tier: "suspicious", name: "README padding", what: "A README far longer than the code it describes." },
  { id: "6", tier: "suspicious", name: "Big-bang commits", what: "3000+ lines of code arriving in 3 or fewer commits." },
  { id: "7", tier: "suspicious", name: "Fork padding", what: "Most of the profile is forks with no commits of the owner's own." },
  { id: "9", tier: "suspicious", name: "Hosted elsewhere", what: "Pitches a product and links an app on a host like Streamlit or Hugging Face Spaces, but the repo has under 50 lines of code. The claims can't be checked because the engine isn't here. A docs/ or website/ site doesn't count as code." },
  { id: "10", tier: "suspicious", name: "Star farming", what: "The README trades access for a star (\"star the repo to unlock\"). GitHub no longer lists other people's stargazers, so bought stars can't be checked directly." },
];

const CREDITS = [
  { id: "P1", name: "Maintained tests", what: "Real test files (not empty ones, not a template's) that changed in 3+ commits over 2+ weeks. An LLM writes a suite in one go, so tests that merely exist prove little." },
  { id: "P2", name: "Merged PRs", what: "Pull requests merged into other people's repos." },
];

const TIER_COLOUR: Record<string, string> = { contradicted: "text-bad", suspicious: "text-warn", credit: "text-good" };

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

// Biggest points first, the same order a report lists its receipts in.
function signalRows() {
  const rows = SIGNALS.map((s) => ({ key: s.id + s.tier, points: WEIGHTS[`${s.id}:${s.tier}`]!, tier: s.tier, name: s.name, what: s.what }));
  return rows.sort((a, b) => b.points - a.points);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-pretty text-muted">{children}</div>
    </section>
  );
}

function Ledger({ rows }: { rows: { key: string; points: number; tier: string; name: string; what: string }[] }) {
  return (
    <ul className="mt-6 overflow-hidden rounded-lg border border-rule bg-panel">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[3.5rem_1fr] gap-x-4 border-b border-track px-4.5 py-4 last:border-b-0">
          <span className="text-right text-paper tabular-nums">{signed(row.points)}</span>
          <span>
            <span className="font-bold text-paper">{row.name}</span>{" "}
            <span className={`text-sm ${TIER_COLOUR[row.tier]}`}>{row.tier}</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">{row.what}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function About() {
  return (
    <article>
      <p className="flex gap-3 text-sm text-muted">
        <span className="text-score">$</span> npx deeplarp --help
      </p>
      <h1 className="mt-6 text-4xl leading-tight font-bold tracking-[-0.02em] sm:text-5xl">How the score works</h1>
      <p className="mt-6 text-[17px] leading-relaxed text-pretty text-muted">
        deeplarp reads a GitHub profile or repo and checks what it claims, in the bio, descriptions and READMEs, against
        what the code shows. Every point on a report comes from a rule on this page, and every rule leaves a receipt you
        can check on GitHub yourself. It&apos;s a measure of claims against code, not a verdict on anyone&apos;s intent.
      </p>

      <Section title="Signals">
        <p>
          Each signal adds points. A <span className="text-bad">contradicted</span> signal means the code says the
          opposite of a claim. A <span className="text-warn">suspicious</span> one is a pattern that often goes with
          larping but has innocent explanations too.
        </p>
      </Section>
      <Ledger rows={signalRows()} />

      <Section title="Credits">
        <p>
          Evidence of real work takes points off, up to {Math.abs(MAX_CREDIT)} in total. Credits only offset suspicious points. Tests
          in one repo don&apos;t undo a painted contribution graph or an empty claim in another.
        </p>
      </Section>
      <Ledger rows={CREDITS.map((c) => ({ key: c.id, points: WEIGHTS[`${c.id}:credit`]!, tier: "credit", name: c.name, what: c.what }))} />

      <Section title="Adding it up">
        <p>
          The same signal on another repo adds half its weight again, for up to {MAX_REPEATS} extra repos. One empty
          claim proves the point. Four make it a pattern.
        </p>
        <p>
          Suspicion alone stops at {SUSPICION_CAP}. Reaching 75 or more needs at least one contradicted signal.
        </p>
        <p>
          Under {REAL_ONE_BELOW} with a credit is a <span className="text-good">Real One</span>. Under {REAL_ONE_BELOW}{" "}
          without one is Unproven: nothing contradicted, nothing proven. Fewer than 3 repos of its own, or an account under
          30 days old, is an NPC and gets no score. Everything else is named after its biggest group of signals (Wrapper,
          Tutorial or Farmer), or a combination when the second group is close behind.
        </p>
      </Section>

      <Section title="Which repos">
        <p>
          A profile scan reads the pinned repos plus the top 20 by stars. Tutorial patterns (README padding, template
          leftovers, big-bang commits) only count on the repos a profile shows off: its pinned repos, or the six GitHub
          shows when nothing is pinned. A template left in an old bug repro isn&apos;t anyone&apos;s portfolio.
        </p>
        <p>
          Repos that call themselves a learning exercise (&quot;course project&quot;, &quot;followed a tutorial&quot;,
          practice or assignment in the name) skip those patterns too.
        </p>
      </Section>

      <Section title="What it doesn't judge">
        <p>
          Stars (bought stars aren&apos;t the owner&apos;s larp), years of experience, or abandoned projects (an abandoned
          side project isn&apos;t a lie). The site doesn&apos;t use an AI model: the score, the claims and the roast line
          all come from fixed rules.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          deeplarp only reads public data through GitHub&apos;s API. A report is kept for a day and then scanned again on
          the next visit. Reports are hidden from search engines. To stop your profile being scanned,{" "}
          <a href={OPT_OUT_URL} className="text-paper underline decoration-rule underline-offset-4 hover:decoration-paper">
            open an opt-out issue
          </a>
          .
        </p>
        <p>
          The same scanner runs in your terminal with <code className="text-paper">npx deeplarp &lt;user&gt;</code>, and{" "}
          <a href={REPO_URL} className="text-paper underline decoration-rule underline-offset-4 hover:decoration-paper">
            the source is on GitHub
          </a>
          .
        </p>
      </Section>

      <Link href="/" className="mt-14 inline-block underline decoration-rule underline-offset-4 hover:decoration-paper">
        Scan a profile
      </Link>
    </article>
  );
}
