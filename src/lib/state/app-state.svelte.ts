import { browser } from '$app/environment';
import type { PlayInputs, SoundFontStatus } from '../audio/player';
import { generateRhythm, type GeneratedRhythm } from '../rhythm/generator';
import { DEFAULT_SETTINGS, loadSettings } from './settings';
import type { Settings } from './settings';

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

	/** Where the bundled SoundFont is in its lifecycle. */
	soundFontStatus: SoundFontStatus = $state('idle');

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

	/**
	 * The exact bundle the Player needs to start a cycle. `$derived.by` reads
	 * every nested field automatically, so the page's restart effect just
	 * watches this getter — adding a playback-affecting setting is then a
	 * one-line change here, not a copy-paste into a void-list elsewhere.
	 *
	 * `seed` is intentionally excluded from this snapshot: it changes the
	 * generated rhythm (which lives in `events`) but doesn't itself affect
	 * playback shape.
	 */
	playbackInputs: PlayInputs = $derived.by(() => {
		const s = this.settings;
		return {
			events: this.rhythm.events,
			bars: s.bars,
			bpm: s.bpm,
			metronome: s.metronome,
			rhythmAudio: s.rhythmAudio,
			rhythmInstrument: s.rhythmInstrument,
			allowedLengths: s.allowedLengths,
			snareOnBackbeats: s.snareOnBackbeats,
			hihatSubdivision: s.hihatSubdivision,
			countInBars: s.countIn ? 1 : 0,
			loop: true
		};
	});
}

export const appState = new AppState();
