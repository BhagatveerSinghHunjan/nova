import Link from "next/link";

import { LabEmpty } from "@/components/experiments/lab-ui";
import { StatusBadge } from "@/components/experiments/status-badge";
import { listExperiments } from "@/lib/experiments/queries";

export default async function ExperimentsPage() {
  const experiments = await listExperiments();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500 transition hover:text-zinc-300"
          >
            NOVA LAB
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/activity"
              className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-600 transition hover:text-zinc-300"
            >
              Activity
            </Link>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
              Experiments
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Experiments
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
          Open a persisted experiment. The laboratory surface treats one
          experiment as the composition—not a dashboard of widgets.
        </p>

        {experiments.length === 0 ? (
          <div className="mt-12">
            <LabEmpty
              title="No experiments"
              message="No experiments in the database yet. Create one through the domain layer or tests, then refresh."
            />
          </div>
        ) : (
          <ul className="mt-10 divide-y divide-zinc-800 border-y border-zinc-800">
            {experiments.map((experiment) => (
              <li key={experiment.id}>
                <Link
                  href={`/experiments/${experiment.id}`}
                  className="flex flex-col gap-3 px-1 py-5 transition hover:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <p className="text-base leading-snug text-zinc-100">
                      {experiment.question}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-600">
                      Updated{" "}
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(experiment.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={experiment.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
