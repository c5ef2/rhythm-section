import { browser } from '$app/environment';
import { bpmStepDown, bpmStepUp, snapBpm } from '../audio/bpm';
import { Player } from '../audio/player';
import { randomSeed } from '../rng/seeded';
import type { MetronomeDivision, NoteLength } from '../rhythm/types';
import { appState } from './app-state.svelte';
import { environment } from './environment.svelte';
import { encodeShare, type HihatSubdivision, type RhythmInstrument } from './share';

const player = browser
	? new Player({
			onActiveNote: (i) => (appState.activeIndex = i),
			onStopped: () => {
				appState.isPlaying = false;
				appState.activeIndex = null;
			},
			onSoundFontStatus: (status) => (appState.soundFontStatus = status)
		})
	: null;

let preloadStarted = false;

/**
 * Eagerly create the AudioContext and start fetching the bundled SoundFont
 * so the synth is ready by the time the user taps Play. Called once on app
 * mount; subsequent calls are a no-op.
 *
 * Skipped in standalone PWA mode: iOS suspends the AudioContext / its
 * AudioWorklet across home-screen launches, leaving the synth in a state
 * where `noteOn` is silently dropped. Creating it inside the first Play
 * click instead avoids the corpse and the user just sees the normal
 * "Loading…" spinner on the very first press.
 */
export function preloadAudio(): void {
	if (!player || preloadStarted) return;
	if (environment.isStandalone) return;
	preloadStarted = true;
	void player.preload();
}

function currentInputs() {
	const s = appState.settings;
	return {
		events: appState.rhythm.events,
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
}

export async function togglePlay(): Promise<void> {
	if (appState.isPlaying) stop();
	else await start();
}

export async function start(): Promise<void> {
	if (!player) return;
	await player.run(currentInputs());
	appState.isPlaying = true;
}

export function stop(): void {
	player?.stop();
	appState.isPlaying = false;
}

export async function restartIfPlaying(): Promise<void> {
	if (!appState.isPlaying || !player) return;
	await player.run(currentInputs());
}

export function regenerate(): void {
	appState.settings.seed = randomSeed();
}

export function stepBpm(direction: 1 | -1): void {
	const current = appState.settings.bpm;
	appState.settings.bpm = direction === 1 ? bpmStepUp(current) : bpmStepDown(current);
}

export function normaliseBpm(): void {
	const snapped = snapBpm(appState.settings.bpm);
	if (snapped !== appState.settings.bpm) appState.settings.bpm = snapped;
}

export function setBars(bars: 1 | 2): void {
	appState.settings.bars = bars;
}

export function setAllowedLengths(next: NoteLength[]): void {
	appState.settings.allowedLengths = next;
}

export function toggleAllowRests(): void {
	appState.settings.allowRests = !appState.settings.allowRests;
}

export function toggleAllowTies(): void {
	appState.settings.allowTies = !appState.settings.allowTies;
}

export function toggleCountIn(): void {
	appState.settings.countIn = !appState.settings.countIn;
}

export function toggleMetronome(): void {
	appState.settings.metronome = {
		...appState.settings.metronome,
		enabled: !appState.settings.metronome.enabled
	};
}

export function toggleEmphasizeFirstBeat(): void {
	appState.settings.metronome = {
		...appState.settings.metronome,
		emphasizeFirstBeat: !appState.settings.metronome.emphasizeFirstBeat
	};
}

export function setMetronomeDivision(division: MetronomeDivision): void {
	appState.settings.metronome = { ...appState.settings.metronome, division };
}

export function toggleCountedBeat(beatIndex: 0 | 1 | 2 | 3): void {
	const current = appState.settings.metronome.countedBeats;
	const next = [current[0], current[1], current[2], current[3]] as [
		boolean,
		boolean,
		boolean,
		boolean
	];
	next[beatIndex] = !next[beatIndex];
	// Require at least one counted beat, otherwise the metronome goes silent
	// and "on" becomes indistinguishable from "off".
	if (!next.some((b) => b)) return;
	appState.settings.metronome = { ...appState.settings.metronome, countedBeats: next };
}

export function setInstrument(inst: RhythmInstrument): void {
	appState.settings.rhythmInstrument = inst;
}

export function toggleRhythmAudio(): void {
	appState.settings.rhythmAudio = !appState.settings.rhythmAudio;
}

/**
 * One-shot setter for the combined "rhythm audio + instrument" control.
 *  - 'off'  → rhythm audio disabled (metronome only)
 *  - 'drum' → rhythm audio on, kick drum plays every note
 *  - 'bass' → rhythm audio on, fretless bass plays every note
 */
export function setRhythmMode(mode: 'off' | RhythmInstrument): void {
	if (mode === 'off') {
		appState.settings.rhythmAudio = false;
		return;
	}
	appState.settings.rhythmAudio = true;
	appState.settings.rhythmInstrument = mode;
}

export function toggleSnareOnBackbeats(): void {
	appState.settings.snareOnBackbeats = !appState.settings.snareOnBackbeats;
}

export function setSnareOnBackbeats(on: boolean): void {
	appState.settings.snareOnBackbeats = on;
}

export function setHihatSubdivision(s: HihatSubdivision): void {
	appState.settings.hihatSubdivision = s;
}

export function currentShareUrl(): string {
	const url = new URL(window.location.href);
	url.hash = 's=' + encodeShare($state.snapshot(appState.settings));
	return url.toString();
}

/**
 * Replace the current URL with one that encodes the current settings, without
 * pushing a new history entry — call this whenever any persisted setting
 * changes so the address bar always reflects what the user is hearing.
 */
export function updateUrlFromState(): void {
	if (!browser) return;
	const url = currentShareUrl();
	if (url === window.location.href) return;
	history.replaceState(history.state, '', url);
}

/**
 * Open the native share sheet with the current exercise URL when possible;
 * otherwise copy the URL to the clipboard. No image attachment — link
 * previews are the destination app's responsibility.
 */
export function shareCurrent(): void {
	if (!browser) return;
	const url = currentShareUrl();

	const navAny = navigator as unknown as {
		share?: (d: ShareData) => Promise<void>;
	};
	if (typeof navAny.share !== 'function') {
		void navigator.clipboard.writeText(url);
		return;
	}

	// Call share inside the user gesture; .call(navigator, …) keeps the
	// receiver Safari demands.
	void navAny.share.call(navigator, { title: 'Rhythm Section', url }).catch((err) => {
		if ((err as DOMException)?.name === 'AbortError') return;
		console.warn('share failed, copying URL instead', err);
		void navigator.clipboard.writeText(url);
	});
}
