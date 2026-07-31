"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { HomeIcon, ProfileIcon, StatsIcon, TrainIcon } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/useT";

const TABS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/exercises", label: "Train", Icon: TrainIcon },
  { href: "/stats", label: "Stats", Icon: StatsIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

export default function TabsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <main className="flex-1 px-4 pb-28 pt-safe">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[#0a101d]/90 backdrop-blur-xl"
      >
        <ul className="mx-auto flex w-full max-w-md items-stretch justify-around pb-safe pt-1">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`touch-target mx-auto flex w-full max-w-24 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "text-[var(--color-accent-2)]"
                      : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)]"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {t(label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
