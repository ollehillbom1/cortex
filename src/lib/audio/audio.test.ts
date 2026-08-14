// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "./audio";

/**
 * iOS interrupts the Web Audio context when a phone call, Siri or another
 * audio app takes over, and does not auto-resume — the context lands in a
 * non-standard "interrupted" state that resume() cannot restore. Before the
 * fix the auditory exercises read that as "audio unavailable" for the rest
 * of the session. unlock() must recover by recreating the context.
 */

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  /** State a freshly-constructed context starts in (iOS: "suspended"). */
  static initialState = "suspended";
  state: string;
  constructor() {
    this.state = FakeAudioContext.initialState;
    FakeAudioContext.instances.push(this);
  }
  createGain() {
    return {
      connect() {},
      gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
    };
  }
  get destination() {
    return {};
  }
  async resume() {
    // A suspended context resumes; an interrupted one stays stuck, like iOS.
    if (this.state === "suspended") this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}

describe("AudioEngine.unlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = "suspended";
  });

  it("resumes a suspended context on the first unlock", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const engine = new AudioEngine();
    expect(await engine.unlock()).toBe(true);
    expect(engine.unlocked).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("recreates a context iOS left interrupted after a phone call", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const engine = new AudioEngine();
    await engine.unlock();
    expect(engine.unlocked).toBe(true);

    // A call interrupts the live context; resume() cannot bring it back.
    FakeAudioContext.instances[0].state = "interrupted";
    expect(engine.unlocked).toBe(false);

    // The next start (a user gesture) must recover, not surrender to the
    // "audio unavailable" panel.
    expect(await engine.unlock()).toBe(true);
    expect(engine.unlocked).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(2); // recreated
    expect(FakeAudioContext.instances[0].state).toBe("closed"); // old one released
  });
});
