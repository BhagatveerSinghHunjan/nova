import type { ReactNode } from "react";

export function LabPanel({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "attention" | "action" | "muted";
}) {
  const tones = {
    default: "border-zinc-800 bg-zinc-950/40",
    attention: "border-amber-500/40 bg-amber-950/20",
    action: "border-zinc-700 bg-zinc-900/50",
    muted: "border-zinc-900 bg-zinc-950/20",
  };

  return (
    <div className={`border px-4 py-5 sm:px-5 sm:py-6 ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function LabEmpty({
  title,
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="border border-dashed border-zinc-800 px-4 py-6 text-sm">
      {title ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          {title}
        </p>
      ) : null}
      <p className={`text-zinc-500 ${title ? "mt-2" : ""}`}>{message}</p>
    </div>
  );
}

export function LabError({ message }: { message: string }) {
  return (
    <div
      className="mt-3 border border-rose-500/40 bg-rose-950/30 px-3 py-2 font-mono text-xs text-rose-200"
      role="alert"
    >
      {message}
    </div>
  );
}

export function labButtonClass(
  variant: "primary" | "secondary" | "approve" | "reject" | "run" | "analyze",
  pending?: boolean,
) {
  const base =
    "inline-flex items-center justify-center border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50";

  const variants = {
    primary:
      "border-zinc-100 bg-zinc-100 text-zinc-950 hover:bg-white",
    secondary:
      "border-zinc-600 bg-transparent text-zinc-200 hover:border-zinc-400 hover:text-zinc-50",
    approve:
      "border-emerald-400/70 bg-emerald-950/50 text-emerald-100 hover:bg-emerald-900/60",
    reject:
      "border-rose-400/70 bg-rose-950/40 text-rose-100 hover:bg-rose-900/50",
    run: "border-sky-300/70 bg-sky-950/40 text-sky-100 hover:bg-sky-900/50",
    analyze:
      "border-violet-300/70 bg-violet-950/40 text-violet-100 hover:bg-violet-900/50",
  };

  return `${base} ${variants[variant]} ${pending ? "opacity-70" : ""}`;
}

export function LabField({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-sm text-zinc-200 ${mono ? "font-mono" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}
