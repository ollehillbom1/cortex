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
    accessibility:
      "This exercise needs sight — the digits are shown on screen. Sound Span is the same task by ear. Keyboard: digits, Backspace and Enter.",
  },
  "sequence-memory": {
    how: [
      "Watch the tiles light up in order.",
      "When the playback ends, tap the tiles in the same order.",
      "Longer and faster sequences unlock as you improve.",
    ],
    scoring: "Your streak of correct taps from the start of the sequence counts.",
    accessibility:
      "This exercise needs sight: the sequence is shown as lit tiles, with no equivalent by ear. Tone Pattern trains the same recall through sound.",
  },
  "visual-pattern": {
    how: [
      "A pattern of highlighted tiles appears briefly — memorise which tiles were lit.",
      "When the grid clears, tap the tiles that were part of the pattern, then confirm.",
    ],
    scoring:
      "Correct tiles score; wrong tiles subtract. Rebuild the exact pattern for a perfect round.",
    accessibility:
      "This exercise needs sight: the pattern is purely visual and cannot be conveyed by a screen reader.",
  },
  "n-back": {
    how: [
      "A square appears in one of nine positions, step by step.",
      "Tap Match whenever the position is the same as it was N steps earlier. Do nothing when it is not.",
      "You start at 1-back (same as the previous step). Higher levels move to 2-back and 3-back.",
    ],
    scoring:
      "Correct matches and correct passes both count. Tapping Match when there is no match (a false alarm) costs accuracy.",
    accessibility:
      "This exercise needs sight — the stimulus is a square's position. Dual N-Back adds a spoken stream, and Sound Span is fully auditory. Keyboard: space bar instead of tapping Match.",
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
  "dual-n-back": {
    how: [
      "Two streams run at once: a square appears in one of nine positions while a letter is spoken aloud.",
      "Tap Position (or press A) when the position matches N steps back. Tap Sound (or press L) when the sound matches N steps back.",
      "Both, one, or neither can match on any step. Start calm — dual n-back is hard for everyone.",
    ],
    scoring:
      "Each stream is scored separately (matches and false alarms); your result is the average of the two.",
    accessibility:
      "This exercise needs sound for the spoken letters. Keyboard: A for position, L for sound.",
  },
  "tone-pattern": {
    how: [
      "A short melody plays on the numbered sound pads.",
      "When it ends, replay it: tap the pads in the same order, by ear.",
      "More pads and longer melodies unlock as you improve.",
    ],
    scoring: "Each note in the right position counts. The whole melody is a perfect round.",
    accessibility: "This exercise needs sound. Check your volume before starting.",
  },
  "rhythm-recall": {
    how: [
      "Listen to a short rhythm — the pad pulses with every beat.",
      "When it ends, tap the same rhythm back on the pad.",
      "Your overall speed can differ a little; it is the pattern between taps that counts.",
    ],
    scoring:
      "Each gap between taps that lands close enough to the original counts. Missing or extra taps subtract.",
    accessibility: "This exercise needs sound. Check your volume before starting.",
  },
  "reaction-time": {
    how: [
      "Hold steady while the panel is dim — the wait is random on purpose.",
      "The instant it turns bright and says GO, tap (or press the space bar).",
      "Tapping early is a false start and does not count.",
    ],
    scoring:
      "Your reaction time in milliseconds. Lower is better; your average and best are tracked.",
    accessibility:
      "This exercise needs sight: the GO signal is a visual change. Keyboard: the space bar works instead of tapping.",
  },
};
