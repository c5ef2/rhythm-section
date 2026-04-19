import type { NoteLength } from '../rhythm/types';
import { decodeShare } from './share';
import type { SharedState } from './share';

const VALID_LENGTHS: ReadonlySet<NoteLength> = new Set([
	'whole',
	'half',
	'quarter',
	'eighth',
	'sixteenth',
	'eighth-triplet',
	'dotted-eighth'
]);

export const STORAGE_KEY = 'rhythm-section:v1';
export const HASH_PREFIX = '#s=';

export type Settings = SharedState;

export const DEFAULT_SETTINGS: Settings = {
	bpm: 120,
	bars: 1,
	allowedLengths: ['quarter', 'eighth'],
	allowRests: true,
	allowTies: false,
	metronome: {
		enabled: true,
		division: 'quarter',
		emphasizeFirstBeat: true,
		countedBeats: [true, true, true, true]
	},
	rhythmInstrument: 'drum',
	countIn: true,
	rhythmAudio: false,
	seed: 1
};

export interface LoadContext {
	storage: Storage;
	hash: string;
}

export function loadSettings(ctx: LoadContext): Settings {
	const fromHash = extractFromHash(ctx.hash);
	if (fromHash) return sanitise(fromHash);
	return sanitise(loadFromStorage(ctx.storage) ?? DEFAULT_SETTINGS);
}

/** Strip out any note-lengths that this version of the app no longer supports. */
function sanitise(s: Settings): Settings {
	const filtered = s.allowedLengths.filter((l) => VALID_LENGTHS.has(l));
	const allowedLengths = filtered.length > 0 ? filtered : [...DEFAULT_SETTINGS.allowedLengths];
	return { ...s, allowedLengths };
}

export function saveSettings(settings: Settings, storage: Storage): void {
	storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function extractFromHash(hash: string): Settings | null {
	if (!hash.startsWith(HASH_PREFIX)) return null;
	return decodeShare(hash.slice(HASH_PREFIX.length));
}

function loadFromStorage(storage: Storage): Settings | null {
	const raw = storage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<Settings>;
		// Merge with defaults so older stored payloads missing newer fields
		// (e.g. rhythmAudio, loop) still produce a complete Settings object.
		return { ...DEFAULT_SETTINGS, ...parsed, metronome: {
			...DEFAULT_SETTINGS.metronome,
			...(parsed.metronome ?? {})
		} };
	} catch {
		return null;
	}
}
