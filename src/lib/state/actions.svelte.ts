import { browser } from '$app/environment';
import { bpmStepDown, bpmStepUp, snapBpm } from '../audio/bpm';
import { Player } from '../audio/player';
import { captureStaffImage, updateOgImage } from '../notation/share-image';
import { randomSeed } from '../rng/seeded';
import type { MetronomeDivision, NoteLength } from '../rhythm/types';
import { appState } from './app-state.svelte';
import { encodeShare, type RhythmInstrument } from './share';

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
 * so the synth is ready by the time the user taps Play. Call once on app
 * mount; subsequent calls are a no-op.
 */
export function preloadAudio(): void {
	if (!player || preloadStarted) return;
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

export function currentShareUrl(): string {
	const url = new URL(window.location.href);
	url.hash = 's=' + encodeShare($state.snapshot(appState.settings));
	return url.toString();
}

/**
 * Share the current exercise. Uses navigator.share when available so mobile
 * users get the native share sheet with the rhythm's PNG attached; otherwise
 * falls back to copying the link to the clipboard.
 *
 * Tries several payload shapes in order so the most-preferred combination
 * (URL + image file) is attempted first, falling back to file-only and then
 * URL-only when the platform / target app rejects the richer one. iOS
 * Messages, for example, sometimes silently drops attached files when a URL
 * is also present; on those targets file-only is the only way the staff
 * preview actually rides along.
 */
export async function shareCurrent(): Promise<void> {
	if (!browser) return;
	const url = currentShareUrl();
	const nav = navigator as unknown as {
		share?: (d: ShareData) => Promise<void>;
		canShare?: (d: ShareData) => boolean;
	};

	const file = await captureShareFile();
	if (!file) console.warn('share: no staff image captured, sharing URL only');

	const candidates: ShareData[] = file
		? [
				{ title: 'Rhythm Section', text: url, url, files: [file] },
				{ title: 'Rhythm Section', files: [file] },
				{ title: 'Rhythm Section', text: url, url }
			]
		: [{ title: 'Rhythm Section', text: url, url }];

	if (nav.share) {
		for (const payload of candidates) {
			if (payload.files && nav.canShare && !nav.canShare(payload)) continue;
			try {
				await nav.share(payload);
				return;
			} catch (err) {
				if ((err as DOMException)?.name === 'AbortError') return;
				console.warn(
					'share attempt failed',
					Object.keys(payload).join('+'),
					err
				);
			}
		}
	}
	await navigator.clipboard.writeText(url);
}

async function captureShareFile(): Promise<File | undefined> {
	try {
		const image = await captureStaffImage();
		return new File([image.png], 'rhythm-section.png', { type: 'image/png' });
	} catch (err) {
		console.warn('captureStaffImage failed', err);
		return undefined;
	}
}

export async function refreshShareImage(): Promise<void> {
	if (!browser) return;
	await updateOgImage();
}
