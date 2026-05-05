import { describe, expect, it } from 'vitest';
import { generateRhythm } from './generator';
import { BINARY_SLOTS } from './types';
import type { NoteLength, RhythmEvent } from './types';

function binarySlots(events: RhythmEvent[]): number {
	return events.filter((e) => e.kind === 'binary').reduce((s, e) => s + e.durationSlots, 0);
}

function tripletBeats(events: RhythmEvent[]): number {
	const tripletEvents = events.filter((e) => e.kind === 'triplet');
	// Each triplet beat contributes 3 triplet-eighth events.
	return tripletEvents.length / 3;
}

function totalBeats(events: RhythmEvent[]): number {
	return binarySlots(events) / 4 + tripletBeats(events);
}

function totalSlots(events: RhythmEvent[]): number {
	return binarySlots(events);
}

describe('generateRhythm (binary)', () => {
	const allBinary: NoteLength[] = ['quarter', 'eighth', 'sixteenth', 'dotted-eighth'];

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

describe('generateRhythm (triplets)', () => {
	it('emits only triplets when only triplet is allowed', () => {
		const { events } = generateRhythm({
			bars: 1,
			allowedLengths: ['eighth-triplet'],
			allowRests: false,
			allowTies: false,
			seed: 3
		});
		for (const e of events) {
			expect(e.kind).toBe('triplet');
			expect(e.length).toBe('eighth-triplet');
			expect(e.durationSlots).toBe(1);
		}
		// One bar = 4 beats × 3 triplet-eighths = 12 events
		expect(events.length).toBe(12);
	});

	it('fills exactly 4 beats per bar when mixing binary and triplet', () => {
		const mixed: NoteLength[] = ['eighth', 'sixteenth', 'eighth-triplet'];
		for (let seed = 0; seed < 50; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: mixed,
				allowRests: false,
				allowTies: false,
				seed
			});
			expect(totalBeats(events)).toBe(4);
		}
	});

	it('sometimes chooses triplet when both binary and triplet are allowed', () => {
		let sawTriplet = false;
		for (let seed = 0; seed < 50; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: ['eighth', 'sixteenth', 'eighth-triplet'],
				allowRests: false,
				allowTies: false,
				seed
			});
			if (events.some((e) => e.kind === 'triplet')) sawTriplet = true;
		}
		expect(sawTriplet).toBe(true);
	});

	it('triplet events appear in groups of three (one per beat)', () => {
		for (let seed = 0; seed < 30; seed++) {
			const { events } = generateRhythm({
				bars: 2,
				allowedLengths: ['eighth', 'eighth-triplet'],
				allowRests: false,
				allowTies: false,
				seed
			});
			// Triplet count must be a multiple of 3.
			const trips = events.filter((e) => e.kind === 'triplet').length;
			expect(trips % 3).toBe(0);
		}
	});
});

describe('beat-boundary splitting', () => {
	it('never emits a binary event that crosses a beat boundary', () => {
		for (let seed = 0; seed < 200; seed++) {
			const { events } = generateRhythm({
				bars: 2,
				allowedLengths: ['quarter', 'eighth', 'sixteenth', 'dotted-eighth'],
				allowRests: true,
				allowTies: false,
				seed
			});
			let pos = 0;
			for (const e of events) {
				if (e.kind === 'binary') {
					const beatStart = Math.floor(pos / 4);
					const beatEnd = Math.floor((pos + e.durationSlots - 1) / 4);
					expect(beatEnd).toBe(beatStart);
					pos += e.durationSlots;
				} else {
					pos += 4 / 3;
				}
			}
		}
	});

	it('ties non-rest pieces that used to be one cross-beat note (when allowTies=true)', () => {
		let sawTiedSplit = false;
		for (let seed = 0; seed < 200; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: ['eighth', 'quarter'],
				allowRests: false,
				allowTies: true,
				seed
			});
			for (let i = 0; i < events.length - 1; i++) {
				if (events[i].tiedToNext && !events[i].isRest && !events[i + 1].isRest) {
					sawTiedSplit = true;
				}
			}
		}
		expect(sawTiedSplit).toBe(true);
	});
});

describe('allowed-set fidelity', () => {
	it('never emits a length the user did not select', () => {
		const allowed: NoteLength[] = ['quarter', 'eighth'];
		for (let seed = 0; seed < 500; seed++) {
			const { events } = generateRhythm({
				bars: 2,
				allowedLengths: allowed,
				allowRests: true,
				allowTies: true,
				seed
			});
			for (const e of events) {
				expect(allowed).toContain(e.length);
			}
		}
	});

	it('respects the set even when the choices force a specific partition', () => {
		// Only quarter and 16th allowed — every beat must be either [quarter]
		// or [16th, 16th, 16th, 16th]. Never a lone 16th at the end of a beat.
		const allowed: NoteLength[] = ['quarter', 'sixteenth'];
		for (let seed = 0; seed < 500; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: allowed,
				allowRests: false,
				allowTies: false,
				seed
			});
			for (const e of events) expect(allowed).toContain(e.length);
		}
	});
});

describe('allowTies=false', () => {
	it('never produces a tied note', () => {
		for (let seed = 0; seed < 500; seed++) {
			const { events } = generateRhythm({
				bars: 2,
				allowedLengths: ['quarter', 'eighth', 'sixteenth', 'dotted-eighth'],
				allowRests: true,
				allowTies: false,
				seed
			});
			expect(events.some((e) => e.tiedToNext)).toBe(false);
		}
	});
});

describe('tie chain cap', () => {
	it('never produces a tied chain longer than 3 events', () => {
		for (let seed = 0; seed < 500; seed++) {
			const { events } = generateRhythm({
				bars: 2,
				allowedLengths: ['quarter', 'eighth', 'sixteenth', 'dotted-eighth'],
				allowRests: false,
				allowTies: true,
				seed
			});
			let chain = 1;
			for (let i = 0; i < events.length; i++) {
				if (events[i].tiedToNext) chain++;
				else {
					expect(chain).toBeLessThanOrEqual(3);
					chain = 1;
				}
			}
			expect(chain).toBeLessThanOrEqual(3);
		}
	});

	it('3-event chains (2 ties) stay under ~10% across many seeds', () => {
		let totalChains = 0;
		let longChains = 0;
		for (let seed = 0; seed < 500; seed++) {
			const { events } = generateRhythm({
				bars: 2,
				allowedLengths: ['quarter', 'eighth', 'sixteenth', 'dotted-eighth'],
				allowRests: false,
				allowTies: true,
				seed
			});
			let chain = 1;
			for (let i = 0; i < events.length; i++) {
				if (events[i].tiedToNext) chain++;
				else {
					if (chain >= 2) totalChains++;
					if (chain >= 3) longChains++;
					chain = 1;
				}
			}
		}
		// Loose upper bound — our target is 5%, leave head-room for variance.
		if (totalChains > 0) {
			expect(longChains / totalChains).toBeLessThan(0.15);
		}
	});
});

describe('generateRhythm (ties)', () => {
	it('produces at least one tied note across many seeds when allowTies=true', () => {
		let sawTie = false;
		for (let seed = 0; seed < 200; seed++) {
			const { events } = generateRhythm({
				bars: 2,
				allowedLengths: ['eighth', 'sixteenth', 'quarter'],
				allowRests: false,
				allowTies: true,
				seed
			});
			if (events.some((e) => e.tiedToNext)) sawTie = true;
		}
		expect(sawTie).toBe(true);
	});

	it('never ties a rest or a last event', () => {
		for (let seed = 0; seed < 50; seed++) {
			const { events } = generateRhythm({
				bars: 1,
				allowedLengths: ['eighth', 'sixteenth', 'quarter'],
				allowRests: true,
				allowTies: true,
				seed
			});
			events.forEach((e, i) => {
				if (e.tiedToNext) {
					expect(e.isRest).toBe(false);
					expect(i).toBeLessThan(events.length - 1);
					expect(events[i + 1].isRest).toBe(false);
				}
			});
		}
	});
});

