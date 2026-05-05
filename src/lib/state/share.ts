import { MAELZEL_BPMS, snapBpm } from '../audio/bpm';
import type {
	HihatSubdivision,
	MetronomeDivision,
	MetronomeOptions,
	NoteLength,
	RhythmInstrument
} from '../rhythm/types';

export interface SharedState {
	bpm: number;
	bars: 1 | 2;
	allowedLengths: NoteLength[];
	allowRests: boolean;
	allowTies: boolean;
	metronome: MetronomeOptions;
	rhythmInstrument: RhythmInstrument;
	snareOnBackbeats: boolean;
	hihatSubdivision: HihatSubdivision;
	countIn: boolean;
	rhythmAudio: boolean;
	seed: number;
}

/*
 * Compact binary share format. Goal: a hash short enough to type out by
 * hand.
 *
 * Layout (little-endian, bit-packed):
 *
 *   byte 0          version tag (PACK_VERSION)
 *   bits 8-13   (6) bpm-index into MAELZEL_BPMS
 *   bit  14     (1) bars (0 = 1 bar, 1 = 2 bars)
 *   bits 15-19  (5) allowedLengths bitmask (see LENGTH_BITS below)
 *   bits 20-23  (4) countedBeats bitmask  (bit 0 = beat 1, bit 3 = beat 4)
 *   bits 24-26  (3) metronome.division index (DIVISIONS array)
 *   bit  27     (1) metronome.enabled
 *   bit  28     (1) metronome.emphasizeFirstBeat
 *   bit  29     (1) rhythmInstrument (0 = drum, 1 = bass)
 *   bit  30     (1) rhythmAudio
 *   bit  31     (1) allowRests
 *   bit  32     (1) allowTies
 *   bit  33     (1) countIn
 *   bit  34     (1) snareOnBackbeats
 *   bits 35-36  (2) hihatSubdivision (HIHAT_SUBDIVISIONS index)
 *   bits 40-71 (32) seed (uint32 LE)
 *
 *   total = 9 bytes  →  base64url ≈ 12 characters.
 *
 * Bumping PACK_VERSION breaks every share URL produced before the bump —
 * decodeShare returns null and the page falls back to localStorage / the
 * default settings. We don't attempt forward compatibility.
 */

const PACK_VERSION = 0x04;

const HIHAT_SUBDIVISIONS: HihatSubdivision[] = ['off', 'eighth', 'sixteenth', 'triplet'];

const LENGTH_BITS: NoteLength[] = [
	'quarter',
	'eighth',
	'sixteenth',
	'eighth-triplet',
	'dotted-eighth'
];

const DIVISIONS: MetronomeDivision[] = ['quarter', 'eighth', 'triplet', 'sixteenth'];

export function encodeShare(state: SharedState): string {
	return toBase64Url(packBinary(state));
}

export function decodeShare(encoded: string): SharedState | null {
	const bytes = fromBase64UrlToBytes(encoded);
	if (!bytes || bytes.length === 0 || bytes[0] !== PACK_VERSION) return null;
	const unpacked = unpackBinary(bytes);
	return unpacked && isSharedState(unpacked) ? unpacked : null;
}

// --- compact binary encoding -------------------------------------------------

function packBinary(state: SharedState): Uint8Array {
	const out = new Uint8Array(9);
	out[0] = PACK_VERSION;

	const w = new BitWriter();
	w.write(bpmIndex(state.bpm), 6);
	w.write(state.bars === 2 ? 1 : 0, 1);
	w.write(allowedLengthsToMask(state.allowedLengths), 5);
	w.write(countedBeatsToMask(state.metronome.countedBeats), 4);
	w.write(divisionIndex(state.metronome.division), 3);
	w.write(state.metronome.enabled ? 1 : 0, 1);
	w.write(state.metronome.emphasizeFirstBeat ? 1 : 0, 1);
	w.write(state.rhythmInstrument === 'bass' ? 1 : 0, 1);
	w.write(state.rhythmAudio ? 1 : 0, 1);
	w.write(state.allowRests ? 1 : 0, 1);
	w.write(state.allowTies ? 1 : 0, 1);
	w.write(state.countIn ? 1 : 0, 1);
	w.write(state.snareOnBackbeats ? 1 : 0, 1);
	w.write(hihatSubdivisionIndex(state.hihatSubdivision), 2);
	const flagBytes = w.bytes(); // 4 bytes (31 bits → ceil to 4)
	out.set(flagBytes, 1);

	const seed = state.seed >>> 0;
	out[5] = seed & 0xff;
	out[6] = (seed >>> 8) & 0xff;
	out[7] = (seed >>> 16) & 0xff;
	out[8] = (seed >>> 24) & 0xff;
	return out;
}

function unpackBinary(bytes: Uint8Array): SharedState | null {
	if (bytes.length < 9) return null;
	const r = new BitReader(bytes.subarray(1, 5));
	const bpmIdx = r.read(6);
	const bars = r.read(1) === 1 ? 2 : 1;
	const lengthsMask = r.read(5);
	const countedMask = r.read(4);
	const divisionIdx = r.read(3);
	const metronomeEnabled = r.read(1) === 1;
	const emphasizeFirstBeat = r.read(1) === 1;
	const rhythmInstrument: RhythmInstrument = r.read(1) === 1 ? 'bass' : 'drum';
	const rhythmAudio = r.read(1) === 1;
	const allowRests = r.read(1) === 1;
	const allowTies = r.read(1) === 1;
	const countIn = r.read(1) === 1;
	const snareOnBackbeats = r.read(1) === 1;
	const hihatIdx = r.read(2);
	if (hihatIdx >= HIHAT_SUBDIVISIONS.length) return null;
	const hihatSubdivision = HIHAT_SUBDIVISIONS[hihatIdx];

	const seed =
		bytes[5] | (bytes[6] << 8) | (bytes[7] << 16) | ((bytes[8] << 24) >>> 0);

	if (bpmIdx >= MAELZEL_BPMS.length) return null;
	if (divisionIdx >= DIVISIONS.length) return null;

	return {
		bpm: MAELZEL_BPMS[bpmIdx],
		bars: bars as 1 | 2,
		allowedLengths: maskToAllowedLengths(lengthsMask),
		allowRests,
		allowTies,
		metronome: {
			enabled: metronomeEnabled,
			division: DIVISIONS[divisionIdx],
			emphasizeFirstBeat,
			countedBeats: maskToCountedBeats(countedMask)
		},
		rhythmInstrument,
		snareOnBackbeats,
		hihatSubdivision,
		countIn,
		rhythmAudio,
		seed: seed >>> 0
	};
}

function hihatSubdivisionIndex(s: HihatSubdivision): number {
	const i = HIHAT_SUBDIVISIONS.indexOf(s);
	return i >= 0 ? i : 0;
}

function bpmIndex(bpm: number): number {
	const snapped = snapBpm(bpm);
	const idx = MAELZEL_BPMS.indexOf(snapped);
	return idx >= 0 ? idx : 0;
}

function divisionIndex(division: MetronomeDivision): number {
	const idx = DIVISIONS.indexOf(division);
	return idx >= 0 ? idx : 1; // default to 'quarter'
}

function allowedLengthsToMask(lengths: NoteLength[]): number {
	let mask = 0;
	for (const l of lengths) {
		const i = LENGTH_BITS.indexOf(l);
		if (i >= 0) mask |= 1 << i;
	}
	return mask;
}

function maskToAllowedLengths(mask: number): NoteLength[] {
	const out: NoteLength[] = [];
	for (let i = 0; i < LENGTH_BITS.length; i++) {
		if (mask & (1 << i)) out.push(LENGTH_BITS[i]);
	}
	return out;
}

function countedBeatsToMask(beats: readonly boolean[]): number {
	let mask = 0;
	for (let i = 0; i < 4; i++) if (beats[i]) mask |= 1 << i;
	return mask;
}

function maskToCountedBeats(mask: number): [boolean, boolean, boolean, boolean] {
	return [
		(mask & 1) !== 0,
		(mask & 2) !== 0,
		(mask & 4) !== 0,
		(mask & 8) !== 0
	];
}

class BitWriter {
	private buf: number[] = [];
	private cur = 0;
	private bits = 0;
	write(value: number, width: number): void {
		this.cur |= (value & ((1 << width) - 1)) << this.bits;
		this.bits += width;
		while (this.bits >= 8) {
			this.buf.push(this.cur & 0xff);
			this.cur >>>= 8;
			this.bits -= 8;
		}
	}
	bytes(): Uint8Array {
		const out = [...this.buf];
		if (this.bits > 0) out.push(this.cur & 0xff);
		while (out.length < 4) out.push(0);
		return new Uint8Array(out);
	}
}

class BitReader {
	private buf: Uint8Array;
	private cur = 0;
	private bits = 0;
	private idx = 0;
	constructor(buf: Uint8Array) {
		this.buf = buf;
	}
	read(width: number): number {
		while (this.bits < width && this.idx < this.buf.length) {
			this.cur |= this.buf[this.idx++] << this.bits;
			this.bits += 8;
		}
		const value = this.cur & ((1 << width) - 1);
		this.cur >>>= width;
		this.bits -= width;
		return value;
	}
}

// --- base64url helpers -------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64UrlToBytes(s: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
	try {
		const padded =
			s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
		const bin = atob(padded);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

// --- shape validator ---------------------------------------------------------

export function isSharedState(v: unknown): v is SharedState {
	if (!v || typeof v !== 'object') return false;
	const s = v as Record<string, unknown>;
	const hihatOk =
		s.hihatSubdivision === 'off' ||
		s.hihatSubdivision === 'eighth' ||
		s.hihatSubdivision === 'sixteenth' ||
		s.hihatSubdivision === 'triplet';
	return (
		typeof s.bpm === 'number' &&
		(s.bars === 1 || s.bars === 2) &&
		Array.isArray(s.allowedLengths) &&
		typeof s.allowRests === 'boolean' &&
		typeof s.allowTies === 'boolean' &&
		typeof s.seed === 'number' &&
		typeof s.countIn === 'boolean' &&
		typeof s.rhythmAudio === 'boolean' &&
		typeof s.snareOnBackbeats === 'boolean' &&
		hihatOk &&
		(s.rhythmInstrument === 'drum' || s.rhythmInstrument === 'bass') &&
		isMetronomeOptions(s.metronome)
	);
}

function isMetronomeOptions(v: unknown): v is MetronomeOptions {
	if (!v || typeof v !== 'object') return false;
	const m = v as Record<string, unknown>;
	const divisionOk =
		m.division === 'quarter' ||
		m.division === 'eighth' ||
		m.division === 'triplet' ||
		m.division === 'sixteenth';
	const beats = m.countedBeats;
	const beatsOk =
		Array.isArray(beats) && beats.length === 4 && beats.every((b) => typeof b === 'boolean');
	return (
		typeof m.enabled === 'boolean' &&
		typeof m.emphasizeFirstBeat === 'boolean' &&
		divisionOk &&
		beatsOk
	);
}
