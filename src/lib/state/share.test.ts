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

	it('still decodes legacy base64-of-JSON share URLs', () => {
		// Format the codec used to emit before the binary format landed.
		const json = JSON.stringify(sample);
		const bytes = new TextEncoder().encode(json);
		let bin = '';
		for (const b of bytes) bin += String.fromCharCode(b);
		const legacy = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		expect(decodeShare(legacy)).toEqual(sample);
	});

	it('legacy decode applies the loop / countedBeats migrations', () => {
		// A real-world legacy URL might have `loop: true` (now removed) and
		// no countedBeats (defaults to [true, true, true, true]).
		const legacyState = {
			...sample,
			loop: true,
			metronome: { ...sample.metronome, countedBeats: undefined }
		};
		const json = JSON.stringify(legacyState);
		const bytes = new TextEncoder().encode(json);
		let bin = '';
		for (const b of bytes) bin += String.fromCharCode(b);
		const legacy = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		const decoded = decodeShare(legacy);
		expect(decoded?.metronome.countedBeats).toEqual([true, true, true, true]);
	});

	it('round-trips every Maelzel BPM', () => {
		for (const bpm of [40, 60, 72, 120, 138, 168, 208]) {
			const encoded = encodeShare({ ...sample, bpm });
			expect(decodeShare(encoded)?.bpm).toBe(bpm);
		}
	});
});
