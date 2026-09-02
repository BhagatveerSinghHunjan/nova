import Link from "next/link";

import { ActivityTimeline } from "@/components/experiments/activity-timeline";
import { listRecentEvents } from "@/domain/persistence";
import { listExperiments } from "@/lib/experiments/queries";

type ActivityPageProps = {
  searchParams: Promise<{ experimentId?: string }>;
};

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const params = await searchParams;
  const experimentId = params.experimentId?.trim() || undefined;
  const [events, experiments] = await Promise.all([
    listRecentEvents({ experimentId }),
    listExperiments(),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500 transition hover:text-zinc-300"
          >
            NOVA LAB
          </Link>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
            Activity
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Experiment history
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
          Chronological audit of persisted events. Each entry reflects an
          action that changed application state and was written to the event
          log—not a live WebMCP transcript.
        </p>

        <form className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="experimentId"
              className="block font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500"
            >
              Filter by experiment
            </label>
            <select
              id="experimentId"
              name="experimentId"
              defaultValue={experimentId ?? ""}
              className="mt-2 w-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400"
            >
              <option value="">All experiments</option>
              {experiments.map((experiment) => (
                <option key={experiment.id} value={experiment.id}>
                  {experiment.question}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="border border-zinc-100 bg-zinc-100 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-zinc-950 transition hover:bg-white"
          >
            Apply
          </button>
        </form>

        {experimentId ? (
          <p className="mt-4 font-mono text-[11px] text-zinc-600">
            Showing events for{" "}
            <Link
              href={`/experiments/${experimentId}`}
              className="text-zinc-400 underline-offset-2 hover:underline"
            >
              {experimentId}
            </Link>
          </p>
        ) : null}

        <div className="mt-10">
          <ActivityTimeline
            events={events}
            showExperimentLink
            emptyMessage={
              experimentId
                ? "No persisted events for this experiment."
                : "No persisted events in the database yet."
            }
          />
        </div>
      </main>
    </div>
  );
}
