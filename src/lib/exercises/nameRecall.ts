import { shuffle, type Rng } from "@/lib/engine/rng";
import { generateFaces, type FaceParams } from "@/lib/exercises/faces";

/**
 * Name Recall: study faces with their names, then match each face back to
 * its name from a small line-up. Face-name pairs are the classic
 * paired-associate paradigm, and — unusually for this app — the trained task
 * is itself the everyday task. The instructions teach the imagery strategy
 * (hang the name on a feature you can see); the exercise provides the study
 * time to apply it. What is measured is matching performance in here,
 * nothing more.
 */

export interface NameRecallParams {
  /** Face-name pairs to study. */
  pairs: number;
  /** Choices per quiz question (the right name plus distractors). */
  options: number;
  /** Study time per pair. */
  studyMs: number;
}

/**
 * The ramp: more faces, briefer study, closer choices. The study-time floor
 * binds exactly at the ceiling (26), so every exposed step changes at least
 * one parameter — the shared ladder contract.
 */
export function nameRecallParams(level: number): NameRecallParams {
  return {
    pairs: Math.min(8, 2 + Math.floor((level - 1) / 4)),
    options: Math.min(5, 3 + Math.floor((level - 1) / 8)),
    studyMs: Math.max(2500, 4000 - (level - 1) * 60),
  };
}

/**
 * Bundled name lists, one per locale. Names are content, not chrome, so the
 * list follows the app language: a Swedish profile studies Swedish names.
 * Both lists are matched in size and kept phonetically distinct within
 * themselves — the quiz is recognition among distractors from the same
 * list, which keeps difficulty comparable across languages.
 */
export const NAME_LISTS: Record<"en" | "sv", readonly string[]> = {
  en: [
    "Alice",
    "Ben",
    "Clara",
    "David",
    "Elena",
    "Felix",
    "Grace",
    "Henry",
    "Iris",
    "Jack",
    "Kate",
    "Liam",
    "Mona",
    "Noah",
    "Olive",
    "Paul",
    "Ruby",
    "Sam",
    "Tess",
    "Victor",
    "Wendy",
    "Yara",
    "Zack",
    "Nina",
    "Oscar",
    "Priya",
    "Rex",
    "Sofia",
    "Theo",
    "Uma",
    "Vince",
    "Willa",
  ],
  sv: [
    "Anna",
    "Björn",
    "Cecilia",
    "Dag",
    "Ebba",
    "Folke",
    "Greta",
    "Hasse",
    "Ingrid",
    "Jonas",
    "Karin",
    "Lasse",
    "Maja",
    "Nils",
    "Otto",
    "Pelle",
    "Rut",
    "Sixten",
    "Tuva",
    "Ulf",
    "Vera",
    "Ylva",
    "Åke",
    "Elsa",
    "Gösta",
    "Hedvig",
    "Ivar",
    "Lova",
    "Märta",
    "Nore",
    "Signe",
    "Tore",
  ],
};

export function namesForLocale(locale: string): readonly string[] {
  return locale === "sv" ? NAME_LISTS.sv : NAME_LISTS.en;
}

export interface NameRecallPair {
  face: FaceParams;
  name: string;
}

export interface NameRecallQuizItem {
  /** Which studied pair this question shows. */
  pairIndex: number;
  /** Shuffled choices; exactly one is the pair's name. */
  options: string[];
}

export interface NameRecallRound {
  pairs: NameRecallPair[];
  /** Questions in a different order than study, one per pair. */
  quiz: NameRecallQuizItem[];
}

/**
 * Deterministic per rng: faces, name assignment, quiz order and distractors
 * all come from the same seed. Distractors prefer the OTHER studied names —
 * confusing among what you just learned is the honest test — topped up from
 * unstudied decoys when the round is small.
 */
export function generateNameRecallRound(
  rng: Rng,
  params: NameRecallParams,
  names: readonly string[],
): NameRecallRound {
  const faces = generateFaces(rng, params.pairs);
  const pool = shuffle(rng, names);
  const assigned = pool.slice(0, params.pairs);
  const decoys = pool.slice(params.pairs);
  const pairs = faces.map((face, i) => ({ face, name: assigned[i] }));

  const order = shuffle(
    rng,
    pairs.map((_, i) => i),
  );
  const quiz = order.map((pairIndex) => {
    const correct = pairs[pairIndex].name;
    const others = shuffle(
      rng,
      assigned.filter((n) => n !== correct),
    );
    const distractors = [...others, ...decoys].slice(0, params.options - 1);
    return { pairIndex, options: shuffle(rng, [correct, ...distractors]) };
  });

  return { pairs, quiz };
}

export interface NameRecallScore {
  correct: number;
  accuracy: number;
  perfect: boolean;
}

/** `answers[i]` is the name chosen for quiz item i, or null if unanswered. */
export function scoreNameRecall(
  round: NameRecallRound,
  answers: readonly (string | null)[],
): NameRecallScore {
  const correct = round.quiz.filter(
    (q, i) => answers[i] !== null && answers[i] === round.pairs[q.pairIndex].name,
  ).length;
  const total = round.quiz.length;
  return {
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    perfect: total > 0 && correct === total,
  };
}
