/**
 * Audio engine for exercise sounds and spoken digits.
 *
 * Browsers refuse to autoplay audio, so the engine must be `unlock()`ed from
 * a user gesture before anything can play. Spoken digits use the browser's
 * SpeechSynthesis where available; tone playback uses Web Audio. UI code
 * checks the capability flags and never silently downgrades the auditory
 * exercise to a visual one.
 */

export interface AudioCapabilities {
  /** Web Audio available and unlocked. */
  tones: boolean;
  /** SpeechSynthesis available. */
  speech: boolean;
}

/** Frequencies for tone-sequence exercises (C5 E5 G5 B5 — clearly distinct). */
export const TONE_FREQUENCIES = [523.25, 659.25, 783.99, 987.77];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  volume = 0.8;
  muted = false;

  static webAudioSupported(): boolean {
    return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
  }

  static speechSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.SpeechSynthesisUtterance !== "undefined"
    );
  }

  /** Must be called from a user gesture. Returns true when audio is ready. */
  async unlock(): Promise<boolean> {
    if (!AudioEngine.webAudioSupported()) return false;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx.state === "running";
    } catch {
      return false;
    }
  }

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  capabilities(): AudioCapabilities {
    return { tones: this.unlocked, speech: AudioEngine.speechSupported() };
  }

  private effectiveVolume(): number {
    return this.muted ? 0 : this.volume;
  }

  /** Play a short tone. Resolves when the tone ends. */
  playTone(frequency: number, durationMs = 320, type: OscillatorType = "sine"): Promise<void> {
    if (!this.ctx || !this.gain || this.effectiveVolume() === 0) {
      return delay(durationMs);
    }
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const vol = 0.28 * this.effectiveVolume();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(vol, now + 0.02);
    env.gain.setValueAtTime(vol, now + dur - 0.06);
    env.gain.linearRampToValueAtTime(0.0001, now + dur);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(now);
    osc.stop(now + dur);
    return delay(durationMs);
  }

  /** Speak a digit. Resolves when speech ends (with a safety timeout). */
  speakDigit(digit: number, rate = 0.95): Promise<void> {
    if (!AudioEngine.speechSupported() || this.effectiveVolume() === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(String(digit));
      utterance.rate = rate;
      utterance.volume = this.effectiveVolume();
      utterance.lang = "en-US";
      const timer = setTimeout(() => resolve(), 2500);
      utterance.onend = () => {
        clearTimeout(timer);
        resolve();
      };
      utterance.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  cancelSpeech(): void {
    if (AudioEngine.speechSupported()) window.speechSynthesis.cancel();
  }

  playSuccess(): void {
    void this.playTone(659.25, 110, "sine").then(() => this.playTone(987.77, 160, "sine"));
  }

  playError(): void {
    void this.playTone(196, 200, "triangle");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
