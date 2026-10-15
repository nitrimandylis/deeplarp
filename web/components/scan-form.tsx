"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { parseTarget } from "@/lib/target";

// The home page input, set inside a shell prompt: typing the target is typing the command.
export function ScanForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("target");
    const parsed = parseTarget(String(text ?? ""));
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError("");
    router.push("/" + parsed.target.toLowerCase());
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-rule bg-panel p-4 sm:p-5">
      <label htmlFor="target" className="flex items-center gap-3 text-lg sm:text-xl">
        <span className="shrink-0 text-score">$</span>
        <span className="shrink-0 text-muted">npx deeplarp</span>
        <Input
          id="target"
          name="target"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="username or owner/repo"
          aria-invalid={error !== "" || undefined}
          aria-describedby="target-help"
          className="h-auto border-0 bg-transparent px-0 py-0 text-lg text-paper caret-score placeholder:text-dim focus-visible:ring-0 sm:text-xl dark:bg-transparent"
        />
      </label>
      <p id="target-help" className={`mt-3 text-sm ${error ? "text-bad" : "text-dim"}`} role={error ? "alert" : undefined}>
        {error || "Press Enter to scan. A pasted github.com link works too."}
      </p>
    </form>
  );
}
