"use client";

import { HAIR_COLORS, SKIN_TONES, type FaceParams } from "@/lib/exercises/faces";

/**
 * Renders one parametric face (see lib/exercises/faces.ts). Pure SVG, no
 * dependencies; sized by the parent via className. Deliberately stylised —
 * a friendly avatar, not an attempt at a person.
 */
export function FaceSvg({
  face,
  className = "h-40 w-40",
}: {
  face: FaceParams;
  className?: string;
}) {
  const skin = SKIN_TONES[face.skin];
  const hair = HAIR_COLORS[face.hairColor];
  const rx = 26 + face.faceWidth * 4; // 26 / 30 / 34
  const eyeR = 2.5 + face.eyes * 0.7;
  const cx = 60;

  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      {/* Long hair sits behind the head. */}
      {face.hair === 3 && (
        <rect x={cx - rx - 4} y={40} width={2 * rx + 8} height={54} rx={16} fill={hair} />
      )}

      {/* Head */}
      <ellipse cx={cx} cy={62} rx={rx} ry={38} fill={skin} />
      {/* Ears */}
      <circle cx={cx - rx} cy={62} r={5} fill={skin} />
      <circle cx={cx + rx} cy={62} r={5} fill={skin} />

      {/* Hair styles (bald = none) */}
      {face.hair === 1 && (
        <path
          d={`M ${cx - rx} 56 A ${rx} 34 0 0 1 ${cx + rx} 56 L ${cx + rx - 4} 44 A ${rx - 6} 24 0 0 0 ${cx - rx + 4} 44 Z`}
          fill={hair}
        />
      )}
      {face.hair === 1 && <ellipse cx={cx} cy={36} rx={rx - 2} ry={12} fill={hair} />}
      {face.hair === 2 && (
        <path
          d={`M ${cx - rx} 60 Q ${cx - rx} 24 ${cx + 6} 26 Q ${cx + rx} 28 ${cx + rx} 54 Q ${cx + 10} 34 ${cx - rx + 8} 44 Z`}
          fill={hair}
        />
      )}
      {face.hair === 3 && <ellipse cx={cx} cy={34} rx={rx} ry={14} fill={hair} />}
      {face.hair === 4 && (
        <>
          <circle cx={cx - 18} cy={34} r={11} fill={hair} />
          <circle cx={cx} cy={28} r={12} fill={hair} />
          <circle cx={cx + 18} cy={34} r={11} fill={hair} />
          <circle cx={cx - 27} cy={46} r={9} fill={hair} />
          <circle cx={cx + 27} cy={46} r={9} fill={hair} />
        </>
      )}
      {face.hair === 5 && (
        <>
          <ellipse cx={cx} cy={36} rx={rx - 4} ry={11} fill={hair} />
          <circle cx={cx} cy={20} r={9} fill={hair} />
        </>
      )}

      {/* Eyes + brows */}
      <circle cx={cx - 11} cy={56} r={eyeR} fill="#20242c" />
      <circle cx={cx + 11} cy={56} r={eyeR} fill="#20242c" />
      <path
        d={`M ${cx - 16} ${48.5} q 5 -3 10 0`}
        stroke="#20242c"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx + 6} ${48.5} q 5 -3 10 0`}
        stroke="#20242c"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />

      {/* Nose */}
      <path
        d={`M ${cx} 60 q -2.5 7 1.5 9`}
        stroke="#20242c"
        strokeWidth={1.3}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />

      {/* Mouth */}
      {face.mouth === 0 && (
        <path
          d={`M ${cx - 9} 80 q 9 8 18 0`}
          stroke="#20242c"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {face.mouth === 1 && (
        <path
          d={`M ${cx - 8} 82 h 16`}
          stroke="#20242c"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {face.mouth === 2 && (
        <ellipse cx={cx} cy={82} rx={5.5} ry={4} fill="#20242c" opacity={0.85} />
      )}

      {/* Accessories */}
      {face.accessory === 1 && (
        <>
          <circle cx={cx - 11} cy={56} r={8} stroke="#20242c" strokeWidth={1.7} fill="none" />
          <circle cx={cx + 11} cy={56} r={8} stroke="#20242c" strokeWidth={1.7} fill="none" />
          <path d={`M ${cx - 3} 56 h 6`} stroke="#20242c" strokeWidth={1.7} />
        </>
      )}
      {face.accessory === 2 && (
        <>
          <circle cx={cx - rx} cy={68} r={2.4} fill="#e8c34e" />
          <circle cx={cx + rx} cy={68} r={2.4} fill="#e8c34e" />
        </>
      )}
      {face.accessory === 3 && (
        <>
          <circle cx={cx - 15} cy={66} r={1.1} fill="#20242c" opacity={0.5} />
          <circle cx={cx - 19} cy={69} r={1.1} fill="#20242c" opacity={0.5} />
          <circle cx={cx - 12} cy={70} r={1.1} fill="#20242c" opacity={0.5} />
          <circle cx={cx + 15} cy={66} r={1.1} fill="#20242c" opacity={0.5} />
          <circle cx={cx + 19} cy={69} r={1.1} fill="#20242c" opacity={0.5} />
          <circle cx={cx + 12} cy={70} r={1.1} fill="#20242c" opacity={0.5} />
        </>
      )}
    </svg>
  );
}
