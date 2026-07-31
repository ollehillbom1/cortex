"use client";

import { useT } from "@/lib/i18n/useT";

/**
 * Tiny dependency-free SVG charts. Each chart has an aria-label summary so
 * the information is available to screen readers without reading the SVG.
 */

function NoData() {
  const { t } = useT();
  return <p className="text-sm text-[var(--color-ink-faint)]">{t("No data yet.")}</p>;
}

export function Sparkline({
  values,
  label,
  height = 56,
  formatValue = (v) => v.toFixed(0),
  invert = false,
}: {
  values: number[];
  label: string;
  height?: number;
  formatValue?: (v: number) => string;
  /** For lower-is-better metrics, colour improvement accordingly. */
  invert?: boolean;
}) {
  const { t } = useT();
  if (values.length === 0) {
    // Callers render this only inside client pages; keep the string simple
    // and translated at the one place charts show text.
    return <NoData />;
  }
  const w = 280;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const improved = invert ? last <= first : last >= first;

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        role="img"
        aria-label={t("{label}: latest {last}, {n} data points, from {first}.", {
          label,
          last: formatValue(last),
          n: values.length,
          first: formatValue(first),
        })}
      >
        <path d={path} fill="none" stroke="url(#spark)" strokeWidth={2.5} strokeLinecap="round" />
        <defs>
          <linearGradient id="spark" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-accent-2)" />
          </linearGradient>
        </defs>
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r={4}
          fill={improved ? "var(--color-good)" : "var(--color-warn)"}
        />
      </svg>
    </div>
  );
}

export function DayBars({
  values,
  label,
  height = 64,
  highlightLast = true,
}: {
  /** One value per day, oldest first. */
  values: number[];
  label: string;
  height?: number;
  highlightLast?: boolean;
}) {
  const { t } = useT();
  const max = Math.max(...values, 1);
  const active = values.filter((v) => v > 0).length;
  return (
    <div
      role="img"
      aria-label={t("{label}: active on {active} of the last {n} days.", {
        label,
        active,
        n: values.length,
      })}
      className="flex items-end gap-1"
      style={{ height }}
    >
      {values.map((v, i) => {
        const h = v <= 0 ? 4 : Math.max(8, (v / max) * height);
        const isLast = highlightLast && i === values.length - 1;
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${
              v > 0
                ? isLast
                  ? "bg-[var(--color-accent-2)]"
                  : "bg-[var(--color-accent)]/70"
                : "bg-white/10"
            }`}
            style={{ height: h }}
          />
        );
      })}
    </div>
  );
}

export function BalanceBars({ entries }: { entries: { label: string; fraction: number }[] }) {
  const { t } = useT();
  return (
    <ul className="space-y-2.5">
      {entries.map((e) => (
        <li key={e.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-sm text-[var(--color-ink-dim)]">{e.label}</span>
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/8"
            role="img"
            aria-label={t("{label}: {pct} percent of recent training", {
              label: e.label,
              pct: (e.fraction * 100).toFixed(0),
            })}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)]"
              style={{ width: `${Math.round(e.fraction * 100)}%` }}
            />
          </div>
          <span className="w-10 text-right text-sm tabular-nums text-[var(--color-ink-dim)]">
            {(e.fraction * 100).toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
