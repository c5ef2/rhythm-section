import { describe, expect, it } from 'vitest';
import { BINARY_SLOTS } from './types';

describe('BINARY_SLOTS', () => {
	it('covers one full bar of 4/4 when summed correctly', () => {
		expect(BINARY_SLOTS.whole).toBe(16);
		expect(BINARY_SLOTS.half * 2).toBe(16);
		expect(BINARY_SLOTS.quarter * 4).toBe(16);
		expect(BINARY_SLOTS.eighth * 8).toBe(16);
		expect(BINARY_SLOTS.sixteenth * 16).toBe(16);
	});

	it('dotted-eighth is 1.5x an eighth', () => {
		expect(BINARY_SLOTS['dotted-eighth']).toBe(BINARY_SLOTS.eighth + BINARY_SLOTS.sixteenth);
	});
});
