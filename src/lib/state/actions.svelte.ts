import { browser } from '$app/environment';
import { bpmStepDown, bpmStepUp, snapBpm } from '../audio/bpm';
import { Player } from '../audio/player';
import {
	captureStaffImage,
	StaffNotRenderedError,
	updateOgImage
} from '../notation/share-image';
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
 * Latest captured share file, refreshed in the background on every rhythm
 * change so the click handler can call navigator.share synchronously without
 * waiting on canvas rasterisation. iOS Safari is strict about user-gesture
 * propagation across awaits — calling `await captureStaffImage()` first and
 * then `nav.share` afterwards makes iOS treat the share as out-of-gesture
 * and may silently drop the attached file from the share sheet preview.
 */
let cachedShareFile: File | null = null;

export async function captureLatestShareFile(): Promise<void> {
	if (!browser) return;
	try {
		const image = await captureStaffImage(captureInput());
		cachedShareFile = new File([image.png], 'rhythm-section.png', { type: 'image/png' });
	} catch (err) {
		// 'staff not rendered yet' is normal during first paint; the next
		// rhythm-change effect will retry once the events are in place.
		if (err instanceof StaffNotRenderedError) return;
		console.warn('captureStaffImage failed', err);
	}
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
 *
 * Synchronous up to the first nav.share call so iOS preserves the click's
 * user gesture; subsequent fallbacks may run after the gesture has expired
 * but only matter when the platform rejects the first shape.
 */
export function shareCurrent(): void {
	if (!browser) return;
	const url = currentShareUrl();

	const file = cachedShareFile;
	// `text` shows up as the literal message body in apps like iMessage —
	// putting a long share URL there made it dominate the message. Use
	// `url` instead: target apps render it as a link card. If the platform
	// rejects {url, files} together (some do drop the file), the file-only
	// candidate is still tried before falling back to a URL-only share.
	const candidates: ShareData[] = file
		? [
				{ title: 'Rhythm Section', url, files: [file] },
				{ title: 'Rhythm Section', files: [file] },
				{ title: 'Rhythm Section', url }
			]
		: [{ title: 'Rhythm Section', url }];

	const navAny = navigator as unknown as {
		share?: (d: ShareData) => Promise<void>;
		canShare?: (d: ShareData) => boolean;
	};
	if (typeof navAny.share !== 'function') {
		void navigator.clipboard.writeText(url);
		return;
	}

	void runShareSequence(candidates, url);
}

async function runShareSequence(candidates: ShareData[], url: string): Promise<void> {
	const navAny = navigator as unknown as {
		share?: (d: ShareData) => Promise<void>;
		canShare?: (d: ShareData) => boolean;
	};
	for (const payload of candidates) {
		// canShare and share must be invoked with `navigator` as their this
		// context — Safari throws "Can only call Navigator.canShare on
		// instances of Navigator" if you destructure them off and call them
		// as plain functions.
		if (
			payload.files &&
			typeof navAny.canShare === 'function' &&
			!navAny.canShare.call(navigator, payload)
		) {
			continue;
		}
		try {
			await navAny.share!.call(navigator, payload);
			return;
		} catch (err) {
			if ((err as DOMException)?.name === 'AbortError') return;
			console.warn('share attempt failed', Object.keys(payload).join('+'), err);
		}
	}
	await navigator.clipboard.writeText(url);
}

export async function refreshShareImage(): Promise<void> {
	if (!browser) return;
	await updateOgImage(captureInput());
}

function captureInput() {
	return { events: appState.rhythm.events, bars: appState.settings.bars };
}
