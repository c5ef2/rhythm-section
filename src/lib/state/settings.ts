import { decodeShare } from './share';
import type { SharedState } from './share';

export const STORAGE_KEY = 'rhythm-section:v1';
export const HASH_PREFIX = '#s=';

export type Settings = SharedState;

export const DEFAULT_SETTINGS: Settings = {
	bpm: 120,
	bars: 1,
	allowedLengths: ['quarter', 'eighth'],
	allowRests: true,
	allowTies: false,
	metronome: { enabled: true, division: 'quarter', emphasizeFirstBeat: true },
	rhythmInstrument: 'drum',
	countIn: true,
	seed: 1
};

export interface LoadContext {
	storage: Storage;
	hash: string;
}

export function loadSettings(ctx: LoadContext): Settings {
	const fromHash = extractFromHash(ctx.hash);
	if (fromHash) return fromHash;
	return loadFromStorage(ctx.storage) ?? DEFAULT_SETTINGS;
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
		return JSON.parse(raw) as Settings;
	} catch {
		return null;
	}
}
