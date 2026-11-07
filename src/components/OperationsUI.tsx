import type { ReactNode } from "react";

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 sm:py-10 space-y-8">{children}</div>;
}

export function OperationsPanel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="rounded-[6px] border border-border-primary bg-surface-primary">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>{action}
    </div>{children}
  </section>;
}

export function DataMessage({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className="px-5 py-10 space-y-3">
    <p className="font-medium">{title}</p><div className="text-sm text-text-secondary leading-relaxed">{children}</div>
  </div>;
}

export function LedgerTable({ label, children }: { label: string; children: ReactNode }) {
  return <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ember-orange focus-visible:outline-offset-2">
    <table className="operations-table w-full min-w-[680px] text-sm text-left">{children}</table>
  </div>;
}
