import type { ExerciseId } from "@/lib/domain/types";

/**
 * Instructional copy shown before an exercise starts. Kept short, concrete
 * and free of scientific claims.
 */

export interface ExerciseInstructions {
  how: string[];
  scoring: string;
  accessibility?: string;
}

export const INSTRUCTIONS: Record<ExerciseId, ExerciseInstructions> = {
  "number-span": {
    how: [
      "Digits appear one at a time. Read them silently and hold the sequence in mind.",
      "When the digits disappear, enter them with the keypad — in the same order, or in reverse when the round asks for it.",
      "The sequence grows as you improve.",
    ],
    scoring: "Each digit in the right position counts. A full sequence is a perfect round.",
    accessibility: "You can use your physical keyboard: digits, Backspace and Enter.",
  },
  "sequence-memory": {
    how: [
      "Watch the tiles light up in order.",
      "When the playback ends, tap the tiles in the same order.",
      "Longer and faster sequences unlock as you improve.",
    ],
    scoring: "Your streak of correct taps from the start of the sequence counts.",
  },
  "visual-pattern": {
    how: [
      "A pattern of highlighted tiles appears briefly — memorise which tiles were lit.",
      "When the grid clears, tap the tiles that were part of the pattern, then confirm.",
    ],
    scoring:
      "Correct tiles score; wrong tiles subtract. Rebuild the exact pattern for a perfect round.",
  },
  "n-back": {
    how: [
      "A square appears in one of nine positions, step by step.",
      "Tap Match whenever the position is the same as it was N steps earlier. Do nothing when it is not.",
      "You start at 1-back (same as the previous step). Higher levels move to 2-back and 3-back.",
    ],
    scoring:
      "Correct matches and correct passes both count. Tapping Match when there is no match (a false alarm) costs accuracy.",
    accessibility: "You can press the space bar instead of tapping Match.",
  },
  "auditory-digits": {
    how: [
      "Listen: digits are spoken aloud, one at a time. There is nothing to read.",
      "When the voice stops, enter the digits you heard in the same order.",
      "If speech is not available, the exercise switches to tone sequences: listen to the melody and replay it on the four sound pads.",
    ],
    scoring: "Each digit (or tone) in the right position counts.",
    accessibility:
      "This exercise needs sound. Check your volume and silent-mode switch before starting — you can adjust volume in Profile.",
  },
  "reaction-time": {
    how: [
      "Hold steady while the panel is dim — the wait is random on purpose.",
      "The instant it turns bright and says GO, tap (or press the space bar).",
      "Tapping early is a false start and does not count.",
    ],
    scoring:
      "Your reaction time in milliseconds. Lower is better; your average and best are tracked.",
  },
};
