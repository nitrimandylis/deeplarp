"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <p className="text-lg">
        <span className="text-bad">!</span> The scan failed.
      </p>
      <p className="mt-4 text-muted">GitHub returned something the scanner didn&apos;t expect. Try once more.</p>
      <Button variant="outline" className="mt-8" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
