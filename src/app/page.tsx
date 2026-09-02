import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">
          Scientific Environment
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
        <div className="space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            NOVA LAB
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-zinc-400">
            A website that provides an executable scientific environment—
            not a chatbot. Design, approve, run, analyze, and trace experiments
            with provenance.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/experiments"
              className="border border-zinc-100 bg-zinc-100 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-zinc-950 transition hover:bg-white"
            >
              Open experiments
            </Link>
            <Link
              href="/activity"
              className="border border-zinc-700 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
            >
              Activity
            </Link>
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-mono text-sm text-zinc-500">
                Laboratory online
              </span>
            </span>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-4">
        <p className="font-mono text-xs text-zinc-600">
          External agents can discover and operate NOVA through WebMCP.
        </p>
      </footer>
    </div>
  );
}
