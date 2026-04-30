import type { MetronomeDivision, MetronomeOptions, NoteLength, RhythmEvent } from '../rhythm/types';
import type { HihatSubdivision } from '../state/share';

const UNITS_PER_BEAT = 12;
const BEATS_PER_BAR = 4;
const UNITS: Readonly<Record<NoteLength, number>> = {
	whole: 48,
	half: 24,
	quarter: 12,
	'dotted-eighth': 9,
	eighth: 6,
	'eighth-triplet': 4,
	sixteenth: 3
};

export type ClickEmphasis = 'downbeat' | 'onbeat' | 'subbeat';
export type RhythmInstrument = 'drum' | 'bass';
export type DrumVoice = 'kick' | 'snare' | 'hihat';

export type AudioEvent =
	| { type: 'metronome'; time: number; emphasis: ClickEmphasis }
	| {
			type: 'kick';
			time: number;
			rhythmEventIndex: number;
	  }
	| {
			type: 'snare';
			time: number;
	  }
	| {
			type: 'hihat';
			time: number;
	  }
	| {
			type: 'bass';
			time: number;
			durationSec: number;
			rhythmEventIndex: number;
	  }
	| { type: 'highlight'; time: number; rhythmEventIndex: number };

export interface BuildEventListInput {
	events: RhythmEvent[];
	bars: number;
	bpm: number;
	startTime: number;
	metronome: MetronomeOptions;
	rhythmAudio?: boolean;
	rhythmInstrument?: RhythmInstrument;
	allowedLengths?: NoteLength[];
	snareOnBackbeats?: boolean;
	hihatSubdivision?: HihatSubdivision;
	countInBars?: number;
}

export function buildEventList(input: BuildEventListInput): AudioEvent[] {
	const {
		events,
		bars,
		bpm,
		startTime,
		metronome,
		rhythmAudio = false,
		rhythmInstrument = 'drum',
		snareOnBackbeats = false,
		hihatSubdivision = 'off',
		countInBars = 0
	} = input;
	const secPerBeat = 60 / bpm;
	const secPerBar = secPerBeat * BEATS_PER_BAR;
	const contentStart = startTime + countInBars * secPerBar;
	const out: AudioEvent[] = [];

	// Count-in always clicks (four steady quarter clicks per bar, downbeat
	// emphasised) even when the metronome is disabled — otherwise the lead-in
	// goes silent and the player is guessing when the rhythm starts.
	if (countInBars > 0) pushCountInClicks(out, countInBars, secPerBeat, startTime);
	if (metronome.enabled) {
		pushMetronomeClicks(out, metronome, bars, secPerBeat, contentStart);
	}
	pushRhythmAndHighlights(out, events, secPerBeat, contentStart, rhythmAudio, rhythmInstrument);
	if (snareOnBackbeats) pushSnareBackbeats(out, bars, secPerBeat, contentStart);
	if (hihatSubdivision !== 'off') {
		pushHihat(out, bars, secPerBeat, contentStart, hihatSubdivision);
	}

	return out.sort((a, b) => a.time - b.time);
}

/** Snare on beats 2 and 4 of every bar — the classic backbeat. */
function pushSnareBackbeats(
	out: AudioEvent[],
	bars: number,
	secPerBeat: number,
	startTime: number
): void {
	for (let bar = 0; bar < bars; bar++) {
		for (const beat of [1, 3]) {
			out.push({ type: 'snare', time: startTime + (bar * BEATS_PER_BAR + beat) * secPerBeat });
		}
	}
}

/** Hihat at the user-chosen subdivision — independent of the rhythm itself. */
function pushHihat(
	out: AudioEvent[],
	bars: number,
	secPerBeat: number,
	startTime: number,
	subdivision: HihatSubdivision
): void {
	const perBeat = hihatHitsPerBeat(subdivision);
	if (perBeat === 0) return;
	const totalHits = perBeat * BEATS_PER_BAR * bars;
	for (let i = 0; i < totalHits; i++) {
		out.push({ type: 'hihat', time: startTime + (i / perBeat) * secPerBeat });
	}
}

function hihatHitsPerBeat(s: HihatSubdivision): number {
	switch (s) {
		case 'off':
			return 0;
		case 'eighth':
			return 2;
		case 'triplet':
			return 3;
		case 'sixteenth':
			return 4;
	}
}

function pushCountInClicks(
	out: AudioEvent[],
	countInBars: number,
	secPerBeat: number,
	startTime: number
): void {
	for (let bar = 0; bar < countInBars; bar++) {
		for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
			const time = startTime + (bar * BEATS_PER_BAR + beat) * secPerBeat;
			const emphasis: ClickEmphasis = beat === 0 ? 'downbeat' : 'onbeat';
			out.push({ type: 'metronome', time, emphasis });
		}
	}
}

function pushMetronomeClicks(
	out: AudioEvent[],
	metronome: MetronomeOptions,
	bars: number,
	secPerBeat: number,
	startTime: number
): void {
	const clicksPerBeat = clicksPerBeatOf(metronome.division);
	const totalClicks = Math.round(clicksPerBeat * BEATS_PER_BAR * bars);
	for (let i = 0; i < totalClicks; i++) {
		const beatFloat = i / clicksPerBeat;
		const beatInBar = Math.floor(beatFloat) % BEATS_PER_BAR;
		// Skip any click that lands on a beat the user has turned off. The
		// sub-clicks within a counted beat still fire (e.g. both eighths of
		// beat 1 if that beat is counted and the division is eighth).
		if (!isBeatCounted(metronome, beatInBar)) continue;
		const time = startTime + beatFloat * secPerBeat;
		const isFirstBeatOfBar = Math.round(i % (clicksPerBeat * BEATS_PER_BAR)) === 0;
		const isOnBeat = Math.round(i % clicksPerBeat) === 0;
		const emphasis: ClickEmphasis =
			isFirstBeatOfBar && metronome.emphasizeFirstBeat
				? 'downbeat'
				: isOnBeat
					? 'onbeat'
					: 'subbeat';
		out.push({ type: 'metronome', time, emphasis });
	}
}

function isBeatCounted(metronome: MetronomeOptions, beatInBar: number): boolean {
	const counted = metronome.countedBeats;
	// Tolerate older payloads that pre-date the countedBeats field by defaulting
	// to "all beats counted".
	if (!counted) return true;
	return counted[beatInBar] ?? true;
}

function pushRhythmAndHighlights(
	out: AudioEvent[],
	events: RhythmEvent[],
	secPerBeat: number,
	startTime: number,
	rhythmAudio: boolean,
	rhythmInstrument: RhythmInstrument
): void {
	let positionUnits = 0;
	for (let i = 0; i < events.length; i++) {
		const e = events[i];
		const time = startTime + (positionUnits / UNITS_PER_BEAT) * secPerBeat;
		out.push({ type: 'highlight', time, rhythmEventIndex: i });

		const prevTiedToThis = i > 0 && events[i - 1].tiedToNext;
		if (rhythmAudio && !e.isRest && !prevTiedToThis) {
			if (rhythmInstrument === 'bass') {
				out.push({
					type: 'bass',
					time,
					durationSec: totalSustainSec(events, i, secPerBeat),
					rhythmEventIndex: i
				});
			} else {
				out.push({ type: 'kick', time, rhythmEventIndex: i });
			}
		}
		positionUnits += UNITS[e.length];
	}
}

function totalSustainSec(events: RhythmEvent[], start: number, secPerBeat: number): number {
	let units = UNITS[events[start].length];
	let k = start;
	while (events[k].tiedToNext && k + 1 < events.length) {
		k += 1;
		units += UNITS[events[k].length];
	}
	return (units / UNITS_PER_BEAT) * secPerBeat;
}

function clicksPerBeatOf(division: MetronomeDivision): number {
	switch (division) {
		case 'half':
			return 0.5;
		case 'quarter':
			return 1;
		case 'eighth':
			return 2;
		case 'triplet':
			return 3;
		case 'sixteenth':
			return 4;
	}
}
