// The Suspense fallback while a report scans: the command, a cursor, and an honest
// estimate. No fake progress steps. Without a target it's the bare prompt, shown for
// the moment before the URL is read.
export function Scanning({ target }: { target?: string }) {
  if (!target) {
    return (
      <p className="text-lg">
        <span className="text-score">$</span> <span className="cursor" aria-hidden />
      </p>
    );
  }

  return (
    <div aria-live="polite">
      <p className="text-lg">
        <span className="text-score">$</span> npx deeplarp {target}
      </p>
      <p className="mt-4 text-muted">
        {target.includes("/") ? "scanning 1 repo, a few seconds" : "scanning up to 20 repos, about 10s"}{" "}
        <span className="cursor" aria-hidden />
      </p>
    </div>
  );
}
