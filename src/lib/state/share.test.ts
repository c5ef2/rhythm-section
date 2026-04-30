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
	snareOnBackbeats: true,
	hihatSubdivision: 'sixteenth',
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

	it('encodes to a short payload (≤ 16 chars)', () => {
		const encoded = encodeShare(sample);
		expect(encoded.length).toBeLessThanOrEqual(16);
	});

	it('returns null for malformed input', () => {
		expect(decodeShare('not-valid-base64!!')).toBeNull();
		expect(decodeShare('')).toBeNull();
	});

	it('returns null for base64 that does not decode to the expected shape', () => {
		const bogus = btoa(JSON.stringify({ foo: 'bar' }));
		const urlSafe = bogus.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		expect(decodeShare(urlSafe)).toBeNull();
	});

	it('produces the same encoding for structurally identical states', () => {
		const a = { ...sample };
		const b = { ...sample };
		expect(encodeShare(a)).toBe(encodeShare(b));
	});

	it('returns null for share URLs from any older version', () => {
		// Old base64-of-JSON payload — current decoder requires the binary
		// version tag and falls through to default settings otherwise.
		const json = JSON.stringify(sample);
		const bytes = new TextEncoder().encode(json);
		let bin = '';
		for (const b of bytes) bin += String.fromCharCode(b);
		const legacy = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		expect(decodeShare(legacy)).toBeNull();
	});

	it('round-trips every Maelzel BPM', () => {
		for (const bpm of [40, 60, 72, 120, 138, 168, 208]) {
			const encoded = encodeShare({ ...sample, bpm });
			expect(decodeShare(encoded)?.bpm).toBe(bpm);
		}
	});
});
