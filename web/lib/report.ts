// Server-only: runs the core scan behind a shared cache, and sorts its errors into
// the states the pages show.

import { cacheLife, cacheTag } from "next/cache";
import { scan, type Report } from "../../src/report";

export type Scanned = { report: Report; scannedAt: string };

export type Outcome =
  | { kind: "ok"; scanned: Scanned }
  | { kind: "missing" } // no such user or repo, or an organization
  | { kind: "busy"; message: string } // GitHub's rate limit
  | { kind: "broken" }; // the server's token is missing or rejected

export function reportTag(target: string): string {
  return "report:" + target;
}

// "use cache: remote" so every server instance shares one entry per target: the
// GitHub token's hourly budget is the scarce thing, not compute.
// Expected errors come back as values, not throws: in production Next replaces the
// message of an error thrown out of a cached function, so it couldn't be sorted.
export async function loadReport(target: string): Promise<Outcome> {
  "use cache: remote";
  cacheTag(reportTag(target));

  try {
    const report = await scan(target, { server: true });
    cacheLife({ stale: 3600, revalidate: 86_400, expire: 2 * 86_400 });
    return { kind: "ok", scanned: { report, scannedAt: new Date().toISOString() } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Not found on GitHub") || message.startsWith("Not a GitHub user")) {
      cacheLife("hours");
      return { kind: "missing" };
    }
    if (message.startsWith("GitHub's hourly limit") || message.startsWith("GitHub says too many")) {
      // Kept for a minute only, so the next visit after the reset scans for real.
      cacheLife({ stale: 30, revalidate: 60, expire: 120 });
      return { kind: "busy", message };
    }
    if (message.startsWith("No GitHub token") || message.includes(" 401")) {
      // A config problem on the server, not the visitor's. Logged so it shows up in
      // the Vercel logs, and kept for a minute so a fixed token takes effect fast.
      console.error("GITHUB_TOKEN missing or rejected:", message);
      cacheLife({ stale: 30, revalidate: 60, expire: 120 });
      return { kind: "broken" };
    }
    throw error;
  }
}
