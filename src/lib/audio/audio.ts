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

/**
 * Pentatonic-ish scale for Tone Pattern (C5 D5 E5 G5 A5 C6): up to six pads
 * that stay pleasant in any order and remain easy to tell apart.
 */
export const TONE_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

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
    this.trackVoice(osc);
    return delay(durationMs);
  }

  /**
   * Schedule a tone on the Web Audio clock, `offsetMs` from now. Unlike
   * setTimeout-driven playback this keeps rhythm jitter in the sub-ms range.
   */
  scheduleTone(offsetMs: number, frequency: number, durationMs = 140): void {
    if (!this.ctx || !this.gain || this.effectiveVolume() === 0) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const at = ctx.currentTime + offsetMs / 1000;
    const dur = durationMs / 1000;
    const vol = 0.3 * this.effectiveVolume();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.008);
    env.gain.setValueAtTime(vol, at + dur - 0.03);
    env.gain.linearRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(at);
    osc.stop(at + dur);
    this.trackVoice(osc);
  }

  /**
   * Keep a reference to every voice we start, so playback can be stopped.
   * Without one, a rhythm scheduled on the Web Audio clock kept playing
   * after the view was left — the sound outlived the exercise.
   */
  private voices = new Set<OscillatorNode>();

  private trackVoice(osc: OscillatorNode): void {
    this.voices.add(osc);
    osc.addEventListener("ended", () => this.voices.delete(osc));
  }

  /** Stop everything audible right now: scheduled tones and speech. */
  stopAll(): void {
    for (const osc of this.voices) {
      try {
        osc.stop();
      } catch {
        /* Already stopped or never started; nothing to do. */
      }
    }
    this.voices.clear();
    this.cancelSpeech();
  }

  /** Speak a short text (letter, digit). Resolves when speech ends. */
  speakText(text: string, lang = "en-US", rate = 0.95): Promise<void> {
    if (!AudioEngine.speechSupported() || this.effectiveVolume() === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.volume = this.effectiveVolume();
      utterance.lang = lang;
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

  /** Speak a digit. Resolves when speech ends (with a safety timeout). */
  speakDigit(digit: number, lang = "en-US", rate = 0.95): Promise<void> {
    return this.speakText(String(digit), lang, rate);
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
