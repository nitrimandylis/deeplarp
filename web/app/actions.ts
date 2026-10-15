"use server";

import { updateTag } from "next/cache";
import { parseTarget } from "@/lib/target";
import { loadReport, reportTag } from "@/lib/report";
import { RESCAN_AFTER_MS } from "@/lib/site";

// Throws the cached report away so the page scans again. Only for reports over an
// hour old, checked here too so a hand-made request can't burn the token's budget.
export async function rescan(target: string): Promise<void> {
  const parsed = parseTarget(target);
  if ("error" in parsed) return;
  const outcome = await loadReport(parsed.target);
  if (outcome.kind !== "ok") return;
  if (Date.now() - Date.parse(outcome.scanned.scannedAt) < RESCAN_AFTER_MS) return;
  updateTag(reportTag(parsed.target));
}
