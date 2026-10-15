"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

  // The border goes green while typing and red on an error.
  const border = error ? "border-bad" : "border-rule focus-within:border-score";

  return (
    <form onSubmit={submit} className={`rounded-lg border bg-panel px-5 py-5 transition-colors sm:px-6 ${border}`}>
      {/* On a phone the input wraps under "npx deeplarp", like a long terminal line. */}
      <label htmlFor="target" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg sm:text-[22px]">
        <span className="shrink-0 text-score">$</span>
        <span className="shrink-0">npx deeplarp</span>
        <input
          id="target"
          name="target"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="username or owner/repo"
          aria-invalid={error !== "" || undefined}
          aria-describedby="target-help"
          onChange={() => setError("")}
          className="min-w-[18ch] flex-1 bg-transparent text-paper caret-score outline-none placeholder:text-dim"
        />
      </label>
      <p id="target-help" className={`mt-3 text-[13px] ${error ? "text-bad" : "text-dim"}`} role={error ? "alert" : undefined}>
        {error || "Press Enter to scan. A pasted github.com link works too."}
      </p>
    </form>
  );
}
