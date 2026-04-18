import { browser } from '$app/environment';
import { generateRhythm, type GeneratedRhythm } from '../rhythm/generator';
import { DEFAULT_SETTINGS, loadSettings } from './settings';
import type { Settings } from './settings';

export type SoundFontStatus = 'none' | 'loading' | 'loaded' | 'error';

function readInitialSettings(): Settings {
	if (!browser) return DEFAULT_SETTINGS;
	return loadSettings({ storage: localStorage, hash: window.location.hash });
}

class AppState {
	/** User-visible preferences + current rhythm seed. Persisted and shareable. */
	settings: Settings = $state(readInitialSettings());

	/** Live playback status. Not persisted. */
	isPlaying: boolean = $state(false);

	/** Currently-highlighted rhythm event index, or null when stopped. */
	activeIndex: number | null = $state(null);

	/** SoundFont load progress. Not persisted (each session re-loads). */
	soundFontStatus: SoundFontStatus = $state('none');
	soundFontName: string = $state('');

	/**
	 * Deterministic regeneration: `rhythm` is derived purely from settings, so
	 * any setting change (including seed) instantly produces the new rhythm.
	 */
	rhythm: GeneratedRhythm = $derived.by(() =>
		generateRhythm({
			bars: this.settings.bars,
			allowedLengths: this.settings.allowedLengths,
			allowRests: this.settings.allowRests,
			allowTies: this.settings.allowTies,
			seed: this.settings.seed
		})
	);
}

export const appState = new AppState();
