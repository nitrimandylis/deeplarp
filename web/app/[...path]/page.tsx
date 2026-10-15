import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { parseTarget } from "@/lib/target";
import { loadReport } from "@/lib/report";
import { RESCAN_AFTER_MS } from "@/lib/site";
import { ReportView, Busy, Broken } from "@/components/report-view";
import { Scanning } from "@/components/scanning";

// /<user> and /<owner>/<repo>, so swapping github.com for this domain works. Anything
// deeper (/tree/main, /blob/...) redirects to the repo.

export async function generateMetadata({ params }: PageProps<"/[...path]">): Promise<Metadata> {
  const { path } = await params;
  const parsed = parseTarget(path.join("/"));
  if ("error" in parsed) return {};
  const target = parsed.target.toLowerCase();
  const card = `/api/card?${new URLSearchParams({ target, layout: "wide", theme: "auto" })}`;
  return {
    title: `${target}: deeplarp`,
    description: `Larp score for ${target}: what it claims against what the code shows.`,
    robots: { index: false, follow: false },
    openGraph: { images: [{ url: card, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [card] },
  };
}

export default function Page({ params }: PageProps<"/[...path]">) {
  return (
    <Suspense fallback={<Scanning />}>
      <Target params={params} />
    </Suspense>
  );
}

// Reads the URL, then shows the wait state with the target in it while the scan runs.
async function Target({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const asked = path.join("/");
  const parsed = parseTarget(asked);
  if ("error" in parsed) notFound();

  const target = parsed.target.toLowerCase();
  if (asked !== target) redirect("/" + target);

  return (
    <Suspense fallback={<Scanning target={target} />}>
      <Report target={target} />
    </Suspense>
  );
}

function isOld(scannedAt: string): boolean {
  return Date.now() - Date.parse(scannedAt) > RESCAN_AFTER_MS;
}

async function Report({ target }: { target: string }) {
  const outcome = await loadReport(target);
  if (outcome.kind === "missing") notFound();
  if (outcome.kind === "busy") return <Busy message={outcome.message} />;
  if (outcome.kind === "broken") return <Broken />;

  const { report, scannedAt } = outcome.scanned;
  // The report's age is a request-time fact, not part of the cached page.
  await connection();
  return <ReportView report={report} scannedAt={scannedAt} canRescan={isOld(scannedAt)} />;
}
