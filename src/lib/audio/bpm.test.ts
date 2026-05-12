import { describe, expect, it } from 'vitest';
import { bpmStepDown, bpmStepUp, MAELZEL_BPMS, pickLuckyBpm, snapBpm } from './bpm';

describe('Maelzel BPM scale', () => {
	it('covers 40 through 208', () => {
		expect(MAELZEL_BPMS[0]).toBe(40);
		expect(MAELZEL_BPMS[MAELZEL_BPMS.length - 1]).toBe(208);
	});

	it('snaps arbitrary values to the nearest notch', () => {
		expect(snapBpm(121)).toBe(120);
		expect(snapBpm(124)).toBe(126);
		expect(snapBpm(59)).toBe(58);
		expect(snapBpm(0)).toBe(40);
		expect(snapBpm(1000)).toBe(208);
	});

	it('steps up and down one notch at a time', () => {
		expect(bpmStepUp(120)).toBe(126);
		expect(bpmStepDown(120)).toBe(116);
		expect(bpmStepUp(208)).toBe(208); // clamp at top
		expect(bpmStepDown(40)).toBe(40); // clamp at bottom
	});

	it('snaps before stepping when given a non-notch value', () => {
		expect(bpmStepUp(121)).toBe(126);
		expect(bpmStepDown(121)).toBe(116);
	});
});

describe('pickLuckyBpm', () => {
	const ALLOWED = MAELZEL_BPMS.filter((n) => n >= 60 && n <= 120);

	it('always returns a Maelzel notch in [60, 120]', () => {
		for (let i = 0; i < 200; i++) {
			const v = pickLuckyBpm(Math.random);
			expect(ALLOWED).toContain(v);
		}
	});

	it('uses the rng — different rng outputs map to different bpms', () => {
		const lowest = pickLuckyBpm(() => 0);
		const highest = pickLuckyBpm(() => 0.999999);
		expect(lowest).toBe(60);
		expect(highest).toBe(120);
	});

	it('covers the full lucky range across many seeds', () => {
		const seen = new Set<number>();
		// A tiny LCG so the test is deterministic across runs.
		let s = 1;
		const rng = () => {
			s = (s * 48271) % 2147483647;
			return s / 2147483647;
		};
		for (let i = 0; i < 500; i++) seen.add(pickLuckyBpm(rng));
		// Expect to have seen most of the allowed notches.
		expect(seen.size).toBeGreaterThanOrEqual(ALLOWED.length - 1);
	});
});
