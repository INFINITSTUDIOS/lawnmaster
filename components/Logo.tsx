export function LeafIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 20c0-9 5-15 16-16 0 10-5 16-13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20c2-5 5-8 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ name = "LawnMaster" }: { name?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-brand-dark">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <LeafIcon className="h-5 w-5" />
      </span>
      {name}
    </span>
  );
}
