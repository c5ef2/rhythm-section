import { describe, expect, it } from 'vitest';
import { generateRhythm } from './generator';
import { BINARY_SLOTS } from './types';
import type { NoteLength } from './types';

function totalSlots(events: ReturnType<typeof generateRhythm>['events']): number {
	return events
		.filter((e) => e.kind === 'binary')
		.reduce((sum, e) => sum + e.durationSlots, 0);
}

describe('generateRhythm (binary)', () => {
	const allBinary: NoteLength[] = [
		'whole',
		'half',
		'quarter',
		'eighth',
		'sixteenth',
		'dotted-half',
		'dotted-quarter',
		'dotted-eighth'
	];

	it('is deterministic for a given seed', () => {
		const a = generateRhythm({
			bars: 1,
			allowedLengths: allBinary,
			allowRests: false,
			allowTies: false,
			seed: 123
		});
		const b = generateRhythm({
			bars: 1,
			allowedLengths: allBinary,
			allowRests: false,
			allowTies: false,
			seed: 123
		});
		expect(a.events).toEqual(b.events);
	});

	it('fills 16 sixteenth slots per bar', () => {
		for (let seed = 0; seed < 50; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: allBinary,
				allowRests: false,
				allowTies: false,
				seed
			});
			expect(totalSlots(events)).toBe(16);
		}
	});

	it('fills 32 sixteenth slots for 2 bars', () => {
		const { events } = generateRhythm({
			bars: 2,
			allowedLengths: allBinary,
			allowRests: false,
			allowTies: false,
			seed: 7
		});
		expect(totalSlots(events)).toBe(32);
	});

	it('only produces note lengths from the allowed set', () => {
		const allowed: NoteLength[] = ['eighth', 'sixteenth'];
		for (let seed = 0; seed < 20; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: allowed,
				allowRests: false,
				allowTies: false,
				seed
			});
			for (const e of events) {
				expect(allowed).toContain(e.length);
			}
		}
	});

	it('falls back to quarter when allowed set is empty or only impossible lengths', () => {
		const { events } = generateRhythm({
			bars: 1,
			allowedLengths: [],
			allowRests: false,
			allowTies: false,
			seed: 1
		});
		expect(totalSlots(events)).toBe(16);
	});

	it('emits rests when allowRests=true for some seeds', () => {
		let sawRest = false;
		for (let seed = 0; seed < 100; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: ['eighth', 'sixteenth', 'quarter'],
				allowRests: true,
				allowTies: false,
				seed
			});
			if (events.some((e) => e.isRest)) sawRest = true;
		}
		expect(sawRest).toBe(true);
	});

	it('durationSlots matches BINARY_SLOTS for each emitted binary note', () => {
		const { events } = generateRhythm({
			bars: 1,
			allowedLengths: allBinary,
			allowRests: false,
			allowTies: false,
			seed: 42
		});
		for (const e of events) {
			if (e.kind === 'binary' && e.length !== 'eighth-triplet') {
				expect(e.durationSlots).toBe(BINARY_SLOTS[e.length]);
			}
		}
	});
});
