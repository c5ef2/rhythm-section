import { randomSeed } from '../rng/seeded';
import type { NoteLength } from '../rhythm/types';
import { decodeShare, isSharedState } from './share';
import type { SharedState } from './share';

// `half` is in the NoteLength union for the metronome's half-division glyph
// but is never picked by the user as a rhythm length. Storage / hash payloads
// are filtered to this set on every load so a stale `'half'` entry can't
// sneak into `allowedLengths`.
const VALID_LENGTHS: ReadonlySet<NoteLength> = new Set([
	'quarter',
	'eighth',
	'sixteenth',
	'eighth-triplet',
	'dotted-eighth'
]);

export const STORAGE_KEY = 'rhythm-section:v1';
export const HASH_PREFIX = '#s=';

export type Settings = SharedState;

/**
 * Default state for a fresh user — `seed` is deliberately a *function*
 * because we want a fresh random rhythm every time someone opens the app
 * without any saved settings or share hash. {@link defaultSettings} returns
 * a copy with the seed materialised; the constant `DEFAULT_SETTINGS` (kept
 * for tests / the merge fallback) holds a deterministic seed of 1.
 */
const DEFAULT_SETTINGS_TEMPLATE: Omit<Settings, 'seed'> = {
	bpm: 72,
	bars: 1,
	allowedLengths: ['quarter', 'eighth', 'sixteenth'],
	allowRests: true,
	allowTies: false,
	metronome: {
		enabled: false,
		division: 'quarter',
		emphasizeFirstBeat: true,
		countedBeats: [true, true, true, true]
	},
	rhythmInstrument: 'drum',
	snareOnBackbeats: true,
	hihatSubdivision: 'eighth',
	countIn: false,
	rhythmAudio: true
};

export const DEFAULT_SETTINGS: Settings = { ...DEFAULT_SETTINGS_TEMPLATE, seed: 1 };

export function defaultSettings(): Settings {
	return { ...DEFAULT_SETTINGS_TEMPLATE, seed: randomSeed() };
}

export interface LoadContext {
	storage: Storage;
	hash: string;
	/**
	 * When true, the URL hash is ignored and only localStorage / defaults are
	 * consulted. iOS Safari (and some other shells) capture the URL the user
	 * installed from and re-launch the PWA at THAT URL every cold launch,
	 * ignoring later `history.replaceState` rewrites. So if the user
	 * installed while the URL carried a `#s=…` hash, every cold launch would
	 * resurrect those install-moment settings and overwrite whatever the
	 * user has since saved. The Share button in standalone mode goes through
	 * `navigator.share` and computes its URL from the current state, so we
	 * don't need the hash to round-trip inside the app.
	 */
	standalone?: boolean;
}

export function loadSettings(ctx: LoadContext): Settings {
	const fromHash = ctx.standalone ? null : extractFromHash(ctx.hash);
	if (fromHash) return sanitise(fromHash);
	return sanitise(loadFromStorage(ctx.storage) ?? defaultSettings());
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
		// (rhythmAudio, snareOnBackbeats, hihatSubdivision, …) still produce
		// a complete Settings object.
		const merged = {
			...DEFAULT_SETTINGS,
			...parsed,
			metronome: {
				...DEFAULT_SETTINGS.metronome,
				...(parsed.metronome ?? {})
			}
		};
		// Schema-check the merged result. If a Settings field gets added
		// without a matching DEFAULT_SETTINGS entry the merge silently
		// leaves `undefined`; the validator catches that and we fall back
		// to defaults instead of letting the runtime trip on a bad shape.
		return isSharedState(merged) ? merged : null;
	} catch {
		return null;
	}
}
