import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler, type Synth } from './scheduler';
import type { RhythmEvent } from '../rhythm/types';

/**
 * Minimal fake of the bits of AudioContext the Scheduler reaches for. We let
 * the test advance `currentTime` in lock-step with the fake setInterval that
 * drives `tick()`, which is enough to exercise the look-ahead window logic.
 */
class FakeAudioContext {
	currentTime = 0;
}

interface SynthCall {
	method: string;
	time: number;
	extra?: unknown;
}

function recordingSynth(): Synth & { calls: SynthCall[] } {
	const calls: SynthCall[] = [];
	return {
		calls,
		playClick(time, emphasis) {
			calls.push({ method: 'playClick', time, extra: emphasis });
		},
		playKick(time) {
			calls.push({ method: 'playKick', time });
		},
		playSnare(time) {
			calls.push({ method: 'playSnare', time });
		},
		playHihat(time) {
			calls.push({ method: 'playHihat', time });
		},
		playBass(time, durationSec) {
			calls.push({ method: 'playBass', time, extra: durationSec });
		},
		stopAll() {
			calls.push({ method: 'stopAll', time: -1 });
		},
		destroy() {}
	};
}

function quarter(): RhythmEvent {
	return {
		kind: 'binary',
		length: 'quarter',
		durationSlots: 4,
		isRest: false,
		tiedToNext: false
	};
}

const RHYTHM_4Q: RhythmEvent[] = [quarter(), quarter(), quarter(), quarter()];

const QUIET_METRONOME = {
	enabled: false,
	division: 'quarter' as const,
	emphasizeFirstBeat: true,
	countedBeats: [true, true, true, true] as [boolean, boolean, boolean, boolean]
};

// The Scheduler reaches for DOM globals (window.setInterval,
// requestAnimationFrame). We're running under Node — vitest's default
// environment — so stub them onto globalThis before each test. With fake
// timers driving setTimeout, a setTimeout-backed rAF shim is enough for
// the highlight loop to advance in step with `currentTime`.
const ORIGINAL_GLOBALS = {
	window: (globalThis as { window?: unknown }).window,
	requestAnimationFrame: (globalThis as { requestAnimationFrame?: unknown })
		.requestAnimationFrame,
	cancelAnimationFrame: (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame
};

beforeEach(() => {
	vi.useFakeTimers();
	Object.assign(globalThis, {
		window: globalThis,
		requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16),
		cancelAnimationFrame: (id: number) => clearTimeout(id)
	});
});

afterEach(() => {
	vi.useRealTimers();
	Object.assign(globalThis, ORIGINAL_GLOBALS);
});

/**
 * Crank the fake timer forward in 25 ms slices (one tick interval each) and
 * advance the AudioContext clock with it. Returns once `seconds` have
 * elapsed in audio-time.
 */
async function advance(ctx: FakeAudioContext, seconds: number): Promise<void> {
	const stepMs = 25;
	const steps = Math.round((seconds * 1000) / stepMs);
	for (let i = 0; i < steps; i++) {
		ctx.currentTime += stepMs / 1000;
		await vi.advanceTimersByTimeAsync(stepMs);
	}
}

describe('Scheduler', () => {
	it('dispatches rhythm hits in time order at 120 BPM', async () => {
		const ctx = new FakeAudioContext();
		const synth = recordingSynth();
		const sched = new Scheduler({
			ctx: ctx as unknown as AudioContext,
			synth,
			events: RHYTHM_4Q,
			bars: 1,
			bpm: 120,
			metronome: QUIET_METRONOME,
			rhythmAudio: true,
			rhythmInstrument: 'drum',
			snareOnBackbeats: false,
			hihatSubdivision: 'off',
			loop: false,
			onHighlight: () => {}
		});
		sched.start();

		// 4 quarters at 120 BPM = 2 s of content. Plus the 50 ms pre-roll start
		// offset and a generous tail so the look-ahead has had time to drain.
		await advance(ctx, 2.5);

		const kicks = synth.calls.filter((c) => c.method === 'playKick');
		expect(kicks).toHaveLength(4);
		// Quarters 50 ms after start, then every 0.5 s.
		expect(kicks.map((c) => c.time)).toEqual([0.05, 0.55, 1.05, 1.55]);
	});

	it('stop() halts dispatch and clears the highlight', async () => {
		const ctx = new FakeAudioContext();
		const synth = recordingSynth();
		const highlights: (number | null)[] = [];
		const sched = new Scheduler({
			ctx: ctx as unknown as AudioContext,
			synth,
			events: RHYTHM_4Q,
			bars: 1,
			bpm: 120,
			metronome: QUIET_METRONOME,
			rhythmAudio: true,
			rhythmInstrument: 'drum',
			snareOnBackbeats: false,
			hihatSubdivision: 'off',
			loop: false,
			onHighlight: (i) => highlights.push(i)
		});
		sched.start();
		await advance(ctx, 0.6); // Through the first kick + a bit.
		const kicksBefore = synth.calls.filter((c) => c.method === 'playKick').length;
		sched.stop();
		await advance(ctx, 1); // Rest of the cycle.

		expect(synth.calls.filter((c) => c.method === 'playKick').length).toBe(kicksBefore);
		expect(highlights[highlights.length - 1]).toBeNull();
	});

	it('continues looping past cycleEndTime when loop=true', async () => {
		const ctx = new FakeAudioContext();
		const synth = recordingSynth();
		const sched = new Scheduler({
			ctx: ctx as unknown as AudioContext,
			synth,
			events: RHYTHM_4Q,
			bars: 1,
			bpm: 120,
			metronome: QUIET_METRONOME,
			rhythmAudio: true,
			rhythmInstrument: 'drum',
			snareOnBackbeats: false,
			hihatSubdivision: 'off',
			loop: true,
			onHighlight: () => {}
		});
		sched.start();
		// Run for 5 s — should cover the first cycle + at least one full
		// re-priming cycle past the original cycleEndTime (~2.05 s).
		await advance(ctx, 5);

		const kicks = synth.calls.filter((c) => c.method === 'playKick');
		// Two complete cycles minimum; allow a bit more in case the look-ahead
		// brought the third cycle's first kick in early.
		expect(kicks.length).toBeGreaterThanOrEqual(8);
	});

	it('skips audio dispatch on highlight events but still drives onHighlight', async () => {
		const ctx = new FakeAudioContext();
		const synth = recordingSynth();
		const indices: (number | null)[] = [];
		const sched = new Scheduler({
			ctx: ctx as unknown as AudioContext,
			synth,
			events: RHYTHM_4Q,
			bars: 1,
			bpm: 120,
			metronome: QUIET_METRONOME,
			// Rhythm audio off → no kicks at all, but highlights still fire.
			rhythmAudio: false,
			rhythmInstrument: 'drum',
			snareOnBackbeats: false,
			hihatSubdivision: 'off',
			loop: false,
			onHighlight: (i) => indices.push(i)
		});
		sched.start();
		await advance(ctx, 2.5);

		expect(synth.calls.filter((c) => c.method === 'playKick')).toHaveLength(0);
		// Highlight indices march through 0..3 (with intervening nulls allowed).
		const seenIndices = new Set(indices.filter((i): i is number => i !== null));
		expect(seenIndices.has(0)).toBe(true);
		expect(seenIndices.has(3)).toBe(true);
	});
});
