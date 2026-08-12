import { randInt, type Rng } from "@/lib/engine/rng";

/**
 * Parametric faces for Name Recall, generated on-device.
 *
 * The offline-first contract rules out photo sets, and shipping one would
 * drag in likeness/licensing questions besides. A face here is a small
 * feature vector rendered as SVG (see components/game/FaceSvg): enough
 * variety to be memorable and tellable-apart, no attempt at realism.
 */

export interface FaceParams {
  /** Index into the skin palette. */
  skin: number;
  /** 0 bald · 1 short · 2 side part · 3 long · 4 curly · 5 bun. */
  hair: number;
  /** Index into the hair palette (ignored for bald). */
  hairColor: number;
  /** Eye size step, 0-2. */
  eyes: number;
  /** 0 smile · 1 neutral · 2 open. */
  mouth: number;
  /** 0 none · 1 glasses · 2 earrings · 3 freckles. */
  accessory: number;
  /** Face width step, 0-2. */
  faceWidth: number;
}

export const SKIN_TONES = ["#f2c9a0", "#e0ac7e", "#c68a5a", "#9c6b43", "#6f4a2f"] as const;
export const HAIR_COLORS = ["#2b2b2b", "#5b3a1e", "#8a5a2b", "#c9973f", "#b8b8b8"] as const;

const FEATURES = ["skin", "hair", "hairColor", "eyes", "mouth", "accessory", "faceWidth"] as const;

function randomFace(rng: Rng): FaceParams {
  return {
    skin: randInt(rng, 0, SKIN_TONES.length - 1),
    hair: randInt(rng, 0, 5),
    hairColor: randInt(rng, 0, HAIR_COLORS.length - 1),
    eyes: randInt(rng, 0, 2),
    mouth: randInt(rng, 0, 2),
    accessory: randInt(rng, 0, 3),
    faceWidth: randInt(rng, 0, 2),
  };
}

/** Number of features two faces differ in. */
export function faceDistance(a: FaceParams, b: FaceParams): number {
  return FEATURES.filter((f) => a[f] !== b[f]).length;
}

/**
 * `count` faces that are deterministic for the rng and pairwise clearly
 * distinct (≥3 features apart — hair alone is not enough to tell two faces
 * apart at a glance, and the exercise must test memory, not perception).
 * The feature space holds ~16k combinations, so rejection sampling finds 8
 * such faces comfortably; the guard bound is a formality.
 */
export function generateFaces(rng: Rng, count: number): FaceParams[] {
  const faces: FaceParams[] = [];
  for (let guard = 0; faces.length < count && guard < 1000; guard++) {
    const candidate = randomFace(rng);
    if (faces.every((f) => faceDistance(f, candidate) >= 3)) faces.push(candidate);
  }
  return faces;
}
