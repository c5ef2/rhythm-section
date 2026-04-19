import { browser } from '$app/environment';
import { bpmStepDown, bpmStepUp, snapBpm } from '../audio/bpm';
import { Player } from '../audio/player';
import { randomSeed } from '../rng/seeded';
import type {
	MetronomeDivision,
	NoteLength
} from '../rhythm/types';
import { appState } from './app-state.svelte';
import { encodeShare, type RhythmInstrument } from './share';

const player = browser
	? new Player({
			onActiveNote: (i) => (appState.activeIndex = i),
			onStopped: () => {
				appState.isPlaying = false;
				appState.activeIndex = null;
			}
		})
	: null;

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
		loop: s.loop
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

export function toggleLoop(): void {
	appState.settings.loop = !appState.settings.loop;
}

export async function loadSoundFontFile(file: File): Promise<void> {
	if (!player) return;
	appState.soundFontName = file.name;
	appState.soundFontStatus = 'loading';
	try {
		const buffer = await file.arrayBuffer();
		await player.loadSoundFont(buffer, appState.settings.rhythmInstrument);
		appState.soundFontStatus = 'loaded';
	} catch (err) {
		console.error(err);
		appState.soundFontStatus = 'error';
	}
}

export async function copyShareLink(): Promise<void> {
	if (!browser) return;
	const url = new URL(window.location.href);
	url.hash = 's=' + encodeShare($state.snapshot(appState.settings));
	await navigator.clipboard.writeText(url.toString());
}
