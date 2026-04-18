import type { MetronomeOptions, NoteLength } from '../rhythm/types';

export type RhythmInstrument = 'drum' | 'bass';

export interface SharedState {
	bpm: number;
	bars: 1 | 2;
	allowedLengths: NoteLength[];
	allowRests: boolean;
	allowTies: boolean;
	metronome: MetronomeOptions;
	rhythmInstrument: RhythmInstrument;
	countIn: boolean;
	seed: number;
}

export function encodeShare(state: SharedState): string {
	return toBase64Url(JSON.stringify(state));
}

export function decodeShare(encoded: string): SharedState | null {
	try {
		const json = fromBase64Url(encoded);
		const parsed = JSON.parse(json);
		return isSharedState(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function toBase64Url(s: string): string {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
	if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
	const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	const bin = atob(padded);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

function isSharedState(v: unknown): v is SharedState {
	if (!v || typeof v !== 'object') return false;
	const s = v as Record<string, unknown>;
	return (
		typeof s.bpm === 'number' &&
		(s.bars === 1 || s.bars === 2) &&
		Array.isArray(s.allowedLengths) &&
		typeof s.allowRests === 'boolean' &&
		typeof s.allowTies === 'boolean' &&
		typeof s.seed === 'number' &&
		typeof s.countIn === 'boolean' &&
		(s.rhythmInstrument === 'drum' || s.rhythmInstrument === 'bass') &&
		isMetronomeOptions(s.metronome)
	);
}

function isMetronomeOptions(v: unknown): v is MetronomeOptions {
	if (!v || typeof v !== 'object') return false;
	const m = v as Record<string, unknown>;
	return (
		typeof m.enabled === 'boolean' &&
		typeof m.emphasizeFirstBeat === 'boolean' &&
		(m.division === 'half' ||
			m.division === 'quarter' ||
			m.division === 'eighth' ||
			m.division === 'triplet' ||
			m.division === 'sixteenth')
	);
}
