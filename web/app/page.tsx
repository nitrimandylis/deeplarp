import Image from "next/image";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";
import exampleCard from "@/public/example-card.png";

export default function Home() {
  return (
    <div>
      <h1 className="max-w-[24ch] text-3xl leading-tight font-bold text-balance sm:text-4xl">
        Is this GitHub larping?
      </h1>
      <p className="mt-4 max-w-[60ch] text-muted">
        deeplarp checks what a profile or repo claims against what the code shows. You get a score from 0 to 100, an
        archetype and the receipts.
      </p>

      <div className="mt-10">
        <ScanForm />
      </div>

      <ul className="mt-6 space-y-2 text-sm text-muted">
        <li>
          Swap <span className="text-paper">github.com</span> for <span className="text-paper">deeplarp.nicktrim.com</span> in
          any GitHub link.
        </li>
        <li>
          In a terminal: <code className="text-paper">npx deeplarp &lt;user&gt;</code>
        </li>
      </ul>

      <section className="mt-16">
        <h2 className="text-muted">What you get back</h2>
        <Link href="/nitrimandylis" className="mt-4 block rounded-lg focus-visible:ring-2 focus-visible:ring-muted focus-visible:outline-none">
          <Image
            src={exampleCard}
            alt="Example card: nitrimandylis scores 0/100, Real One, backed by tests in four repos"
            className="w-full max-w-md rounded-lg border border-rule"
            sizes="(min-width: 640px) 28rem, 100vw"
            priority
          />
        </Link>
        <p className="mt-3 text-sm text-dim">The author&apos;s own profile. Click it for the full report.</p>
      </section>
    </div>
  );
}
