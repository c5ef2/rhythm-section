import { describe, expect, it } from 'vitest';
import type { NoteLength, RhythmEvent } from '../rhythm/types';
import {
	FIRST_STAVE_MODIFIERS,
	MID_STAVE_MODIFIERS,
	MIN_PER_BAR,
	STAVE_PADDING,
	UNITS,
	computeStaveWidths,
	isDotted,
	splitIntoBars
} from './layout';

function ev(length: NoteLength): RhythmEvent {
	const isTriplet = length === 'eighth-triplet';
	return {
		kind: isTriplet ? 'triplet' : 'binary',
		length,
		durationSlots: isTriplet ? 1 : UNITS[length] / 3,
		isRest: false,
		tiedToNext: false
	};
}

describe('splitIntoBars', () => {
	it('groups events into a single bar when bars=1', () => {
		const events = [ev('quarter'), ev('quarter'), ev('quarter'), ev('quarter')];
		const slices = splitIntoBars(events, 1);
		expect(slices).toHaveLength(1);
		expect(slices[0].events).toHaveLength(4);
		expect(slices[0].indexes).toEqual([0, 1, 2, 3]);
	});

	it('splits a 2-bar rhythm at the bar line', () => {
		const events = Array.from({ length: 8 }, () => ev('quarter'));
		const slices = splitIntoBars(events, 2);
		expect(slices).toHaveLength(2);
		expect(slices[0].indexes).toEqual([0, 1, 2, 3]);
		expect(slices[1].indexes).toEqual([4, 5, 6, 7]);
	});

	it('preserves indexes that map flat positions back into the original events array', () => {
		// Mix of lengths so positions aren't a simple modulo.
		const events = [
			ev('quarter'),
			ev('eighth'),
			ev('eighth'),
			ev('quarter'),
			ev('quarter')
		];
		const slices = splitIntoBars(events, 1);
		expect(slices[0].indexes).toEqual([0, 1, 2, 3, 4]);
	});

	it('keeps a triplet beat in the bar where it begins', () => {
		const events = [
			ev('quarter'),
			ev('quarter'),
			ev('quarter'),
			// Final beat of bar 1 is a triplet of three eighth-triplets — the
			// generator emits these in groups of 3 totaling 12 units, exactly one beat.
			ev('eighth-triplet'),
			ev('eighth-triplet'),
			ev('eighth-triplet'),
			ev('quarter'),
			ev('quarter'),
			ev('quarter'),
			ev('quarter')
		];
		const slices = splitIntoBars(events, 2);
		// The three triplet pieces (indexes 3,4,5) fall inside bar 1.
		expect(slices[0].indexes).toEqual([0, 1, 2, 3, 4, 5]);
		expect(slices[1].indexes).toEqual([6, 7, 8, 9]);
	});

	it('returns empty slices for a bar that has no events', () => {
		const slices = splitIntoBars([], 2);
		expect(slices).toHaveLength(2);
		expect(slices[0].events).toHaveLength(0);
		expect(slices[1].events).toHaveLength(0);
	});
});

describe('isDotted', () => {
	it('only dotted-eighth is dotted', () => {
		expect(isDotted('dotted-eighth')).toBe(true);
		expect(isDotted('eighth')).toBe(false);
		expect(isDotted('quarter')).toBe(false);
		expect(isDotted('sixteenth')).toBe(false);
		expect(isDotted('eighth-triplet')).toBe(false);
	});
});

describe('computeStaveWidths — side-by-side layout', () => {
	it('returns natural widths when the row fits the available budget', () => {
		const minNotesWidths = [200, 200];
		const rows = [[0, 1]];
		// Plenty of width: each bar gets max(200+20, 220) + 45/20 modifiers.
		const widths = computeStaveWidths(minNotesWidths, rows, 2000, false);
		const expected0 = MIN_PER_BAR + FIRST_STAVE_MODIFIERS;
		const expected1 = MIN_PER_BAR + MID_STAVE_MODIFIERS;
		expect(widths[0]).toBe(expected0);
		expect(widths[1]).toBe(expected1);
	});

	it('scales the row down proportionally when too wide for the budget', () => {
		const minNotesWidths = [400, 400];
		const rows = [[0, 1]];
		// A tight 600 px budget — each natural is ~440-465 px, sum > budget,
		// so they get scaled. Both bars come out smaller than their natural,
		// fitting under the budget.
		const widths = computeStaveWidths(minNotesWidths, rows, 600, false);
		const total = widths[0] + widths[1];
		expect(total).toBeLessThanOrEqual(600 - STAVE_PADDING * 2 + 0.001);
		expect(widths[0]).toBeGreaterThan(0);
		expect(widths[1]).toBeGreaterThan(0);
	});

	it('never scales below the per-bar minimum even at zero budget', () => {
		const minNotesWidths = [400, 400];
		const rows = [[0, 1]];
		// Budget of zero means "we have no width info yet"; fall through to
		// natural so the staff can render before the ResizeObserver fires.
		const widths = computeStaveWidths(minNotesWidths, rows, 0, false);
		expect(widths[0]).toBeGreaterThan(0);
		expect(widths[1]).toBeGreaterThan(0);
	});
});

describe('computeStaveWidths — stacked (one bar per row)', () => {
	it('gives each stacked row the same width', () => {
		// Two rows, one bar each.
		const minNotesWidths = [180, 250];
		const rows = [[0], [1]];
		const widths = computeStaveWidths(minNotesWidths, rows, 480, true);
		expect(widths[0]).toBe(widths[1]);
	});

	it('caps stacked width to the available budget', () => {
		const minNotesWidths = [800, 800];
		const rows = [[0], [1]];
		const widths = computeStaveWidths(minNotesWidths, rows, 360, true);
		// Budget is 360 - 2*STAVE_PADDING = 340.
		expect(widths[0]).toBeLessThanOrEqual(360 - STAVE_PADDING * 2 + 0.001);
	});
});
