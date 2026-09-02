import Link from "next/link";

export default function ExperimentNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-2xl font-semibold text-zinc-50">Experiment not found</h1>
      <p className="mt-3 text-sm text-zinc-400">
        That experiment ID is not in the database.
      </p>
      <Link
        href="/experiments"
        className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-zinc-300 underline-offset-2 hover:underline"
      >
        Back to experiments
      </Link>
    </div>
  );
}
