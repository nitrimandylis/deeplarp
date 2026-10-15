import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <p className="text-lg">
        <span className="text-bad">!</span> No GitHub user or repo by that name.
      </p>
      <p className="mt-4 max-w-[60ch] text-muted">
        Check the spelling. Organizations can&apos;t be scanned as a whole, so try one of their repos as owner/repo.
      </p>
      <Link href="/" className="mt-8 inline-block underline decoration-rule underline-offset-4 hover:decoration-paper">
        Scan someone else
      </Link>
    </div>
  );
}
