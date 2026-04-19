import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from './share';
import type { SharedState } from './share';

const sample: SharedState = {
	bpm: 120,
	bars: 2,
	allowedLengths: ['eighth', 'sixteenth', 'eighth-triplet'],
	allowRests: true,
	allowTies: true,
	metronome: {
		enabled: true,
		division: 'eighth',
		emphasizeFirstBeat: true,
		countedBeats: [true, false, true, false]
	},
	rhythmInstrument: 'bass',
	countIn: true,
	rhythmAudio: true,
	seed: 123456789
};

describe('share codec', () => {
	it('round-trips an arbitrary state', () => {
		const encoded = encodeShare(sample);
		expect(decodeShare(encoded)).toEqual(sample);
	});

	it('is URL-safe (base64url: no +, /, = or whitespace)', () => {
		const encoded = encodeShare(sample);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('returns null for malformed input', () => {
		expect(decodeShare('not-valid-base64!!')).toBeNull();
		expect(decodeShare('')).toBeNull();
	});

	it('returns null for base64 that does not decode to the expected shape', () => {
		const bogus = btoa(JSON.stringify({ foo: 'bar' }));
		expect(decodeShare(bogus)).toBeNull();
	});

	it('produces the same encoding for structurally identical states', () => {
		const a = { ...sample };
		const b = { ...sample };
		expect(encodeShare(a)).toBe(encodeShare(b));
	});
});
