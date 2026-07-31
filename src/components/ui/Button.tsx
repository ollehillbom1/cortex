"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "subtle";

const styles: Record<Variant, string> = {
  primary: "btn-primary font-semibold",
  ghost: "border border-white/12 bg-white/5 text-[var(--color-ink)] hover:bg-white/10",
  danger:
    "border border-[color-mix(in_srgb,var(--color-bad)_50%,transparent)] text-[var(--color-bad)] bg-white/5",
  subtle: "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`touch-target inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base transition-[transform,filter] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
