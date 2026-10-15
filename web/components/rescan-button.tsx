"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { rescan } from "@/app/actions";

export function RescanButton({ target }: { target: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => rescan(target))}
    >
      {pending ? "Rescanning…" : "Rescan"}
    </Button>
  );
}
