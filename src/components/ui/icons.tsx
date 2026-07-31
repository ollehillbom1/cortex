/** Minimal inline icon set (stroke style, 24px grid). Decorative by default. */

type IconProps = { className?: string; title?: string };

function Svg({
  children,
  className = "h-6 w-6",
  title,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9h4.5v-5h3v5H18v-9" />
  </Svg>
);

export const TrainIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a4.5 4.5 0 0 0-4.4 5.5A4 4 0 0 0 8 16h1" />
    <path d="M12 3a4.5 4.5 0 0 1 4.4 5.5A4 4 0 0 1 16 16h-1" />
    <path d="M12 3v18" />
    <path d="M9 21h6" />
  </Svg>
);

export const StatsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Svg>
);

export const ProfileIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const FlameIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3s1 2.5 3 4.5c1.9 1.9 3 3.7 3 6a6 6 0 0 1-12 0c0-1.6.5-3 1.6-4.4.4 1 1 1.9 1.9 2.4C9.5 9 10 6 12 3Z" />
  </Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" />
  </Svg>
);

export const TrophyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5H4a3 3 0 0 0 3 4.5M17 5h3a3 3 0 0 1-3 4.5" />
    <path d="M12 13v4m-4 4h8m-6.5 0v-2.5a1.5 1.5 0 0 1 3 0V21" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const SoundIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9v6h3.5L12 19V5L7.5 9H4Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" />
  </Svg>
);
