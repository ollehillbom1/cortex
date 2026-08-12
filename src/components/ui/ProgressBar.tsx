export function ProgressBar({
  fraction,
  label,
  className = "",
}: {
  /** 0..1 */
  fraction: number;
  /** Accessible description, e.g. "Level progress". */
  label: string;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`h-2 w-full overflow-hidden rounded-full bg-[var(--fill-strong)] ${className}`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
