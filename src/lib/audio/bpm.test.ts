import { describe, expect, it } from 'vitest';
import { bpmStepDown, bpmStepUp, MAELZEL_BPMS, snapBpm } from './bpm';

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
