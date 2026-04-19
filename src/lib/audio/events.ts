import type { MetronomeDivision, MetronomeOptions, NoteLength, RhythmEvent } from '../rhythm/types';

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

export type AudioEvent =
	| { type: 'metronome'; time: number; emphasis: ClickEmphasis }
	| {
			type: 'rhythm';
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
	countInBars?: number;
}

export function buildEventList(input: BuildEventListInput): AudioEvent[] {
	const { events, bars, bpm, startTime, metronome, rhythmAudio = false, countInBars = 0 } = input;
	const secPerBeat = 60 / bpm;
	const secPerBar = secPerBeat * BEATS_PER_BAR;
	const contentStart = startTime + countInBars * secPerBar;
	const out: AudioEvent[] = [];

	if (metronome.enabled) {
		pushMetronomeClicks(out, metronome, bars + countInBars, secPerBeat, startTime);
	}
	pushRhythmAndHighlights(out, events, secPerBeat, contentStart, rhythmAudio);

	return out.sort((a, b) => a.time - b.time);
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
		const time = startTime + (i / clicksPerBeat) * secPerBeat;
		const isFirstBeatOfBar =
			Math.round(i % (clicksPerBeat * BEATS_PER_BAR)) === 0;
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

function pushRhythmAndHighlights(
	out: AudioEvent[],
	events: RhythmEvent[],
	secPerBeat: number,
	startTime: number,
	rhythmAudio: boolean
): void {
	let positionUnits = 0;
	for (let i = 0; i < events.length; i++) {
		const e = events[i];
		const time = startTime + (positionUnits / UNITS_PER_BEAT) * secPerBeat;
		out.push({ type: 'highlight', time, rhythmEventIndex: i });

		const prevTiedToThis = i > 0 && events[i - 1].tiedToNext;
		if (rhythmAudio && !e.isRest && !prevTiedToThis) {
			out.push({
				type: 'rhythm',
				time,
				durationSec: totalSustainSec(events, i, secPerBeat),
				rhythmEventIndex: i
			});
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
