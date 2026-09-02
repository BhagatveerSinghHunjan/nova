import { notFound } from "next/navigation";

import { ExperimentLabView } from "@/components/experiments/experiment-lab-view";
import { getExperimentView } from "@/lib/experiments/queries";

type ExperimentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ExperimentPage({ params }: ExperimentPageProps) {
  const { id } = await params;
  const view = await getExperimentView(id);

  if (!view) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <ExperimentLabView view={view} />
      <footer className="border-t border-zinc-800 px-6 py-4">
        <p className="mx-auto max-w-3xl font-mono text-xs text-zinc-600">
          External agents can discover and operate NOVA through WebMCP.
        </p>
      </footer>
    </div>
  );
}
