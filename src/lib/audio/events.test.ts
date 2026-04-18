import { describe, expect, it } from 'vitest';
import { buildEventList, type AudioEvent } from './events';
import type { RhythmEvent } from '../rhythm/types';

function quarter(): RhythmEvent {
	return {
		kind: 'binary',
		length: 'quarter',
		durationSlots: 4,
		isRest: false,
		tiedToNext: false
	};
}

function eighth(opts: Partial<RhythmEvent> = {}): RhythmEvent {
	return {
		kind: 'binary',
		length: 'eighth',
		durationSlots: 2,
		isRest: false,
		tiedToNext: false,
		...opts
	};
}

describe('buildEventList', () => {
	it('emits one metronome click per beat when division=quarter', () => {
		const list = buildEventList({
			events: [quarter(), quarter(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: { enabled: true, division: 'quarter', emphasizeFirstBeat: true },
			rhythmAudio: false
		});
		const clicks = list.filter((e): e is Extract<AudioEvent, { type: 'metronome' }> => e.type === 'metronome');
		expect(clicks.length).toBe(4);
		expect(clicks.map((c) => c.time)).toEqual([0, 1, 2, 3]);
	});

	it('marks the first click of the bar as downbeat when emphasis is on', () => {
		const list = buildEventList({
			events: [],
			bars: 2,
			bpm: 60,
			startTime: 0,
			metronome: { enabled: true, division: 'quarter', emphasizeFirstBeat: true }
		});
		const accents = list
			.filter((e) => e.type === 'metronome')
			.map((e) => (e as Extract<AudioEvent, { type: 'metronome' }>).emphasis);
		expect(accents[0]).toBe('downbeat');
		expect(accents[4]).toBe('downbeat');
		expect(accents[1]).toBe('onbeat');
	});

	it('produces 8th-division clicks when division=eighth', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 120,
			startTime: 0,
			metronome: { enabled: true, division: 'eighth', emphasizeFirstBeat: false }
		});
		const clicks = list.filter((e) => e.type === 'metronome');
		expect(clicks.length).toBe(8); // 2 per beat × 4 beats
	});

	it('emits a rhythm hit at each non-rest event when rhythmAudio is on', () => {
		const list = buildEventList({
			events: [quarter(), eighth({ isRest: true }), eighth(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: { enabled: false, division: 'quarter', emphasizeFirstBeat: false },
			rhythmAudio: true
		});
		const hits = list.filter((e) => e.type === 'rhythm');
		expect(hits.length).toBe(4); // the 8th rest is skipped
	});

	it('drum hits only once per tied group, regardless of length', () => {
		// Tied sequence of 3 events (e.g. from a cross-beat split of a dotted-half):
		// eighth --tie-- quarter --tie-- eighth
		const list = buildEventList({
			events: [
				{ kind: 'binary', length: 'eighth', durationSlots: 2, isRest: false, tiedToNext: true },
				{ kind: 'binary', length: 'quarter', durationSlots: 4, isRest: false, tiedToNext: true },
				{ kind: 'binary', length: 'eighth', durationSlots: 2, isRest: false, tiedToNext: false },
				{ kind: 'binary', length: 'quarter', durationSlots: 4, isRest: false, tiedToNext: false }
			],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: { enabled: false, division: 'quarter', emphasizeFirstBeat: false },
			rhythmAudio: true
		});
		const hits = list.filter((e): e is Extract<AudioEvent, { type: 'rhythm' }> => e.type === 'rhythm');
		expect(hits.length).toBe(2);
		// First hit sustains for 8th + quarter + 8th = one full beat + two 8ths = 2 beats = 2s @60bpm
		expect(hits[0].durationSec).toBeCloseTo(2);
	});

	it('skips rhythm hits for tied continuations', () => {
		const list = buildEventList({
			events: [eighth({ tiedToNext: true }), eighth(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: { enabled: false, division: 'quarter', emphasizeFirstBeat: false },
			rhythmAudio: true
		});
		const hits = list.filter((e): e is Extract<AudioEvent, { type: 'rhythm' }> => e.type === 'rhythm');
		expect(hits.length).toBe(2);
		// First hit lasts across the tie: 0.5s (8th @60bpm) + 0.5s (8th) = 1s
		expect(hits[0].durationSec).toBeCloseTo(1);
		expect(hits[1].durationSec).toBeCloseTo(1);
	});

	it('always emits a highlight event for every rhythm event (rest, tied, or not)', () => {
		const list = buildEventList({
			events: [quarter(), eighth({ isRest: true }), eighth(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: { enabled: false, division: 'quarter', emphasizeFirstBeat: false },
			rhythmAudio: false
		});
		const highlights = list.filter(
			(e): e is Extract<AudioEvent, { type: 'highlight' }> => e.type === 'highlight'
		);
		expect(highlights.map((h) => h.rhythmEventIndex)).toEqual([0, 1, 2, 3, 4]);
	});

	it('count-in shifts rhythm and highlights but keeps metronome clicking through the lead-in', () => {
		const list = buildEventList({
			events: [quarter(), quarter(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: { enabled: true, division: 'quarter', emphasizeFirstBeat: true },
			rhythmAudio: true,
			countInBars: 1
		});
		const clicks = list.filter((e) => e.type === 'metronome');
		const firstHighlight = list.find((e) => e.type === 'highlight');
		const firstHit = list.find((e) => e.type === 'rhythm');
		expect(clicks.length).toBe(8); // 2 bars × 4 quarter clicks
		expect(firstHighlight?.time).toBeCloseTo(4); // after one bar of count-in @60bpm
		expect(firstHit?.time).toBeCloseTo(4);
	});

	it('shifts all times by startTime', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 10,
			metronome: { enabled: true, division: 'quarter', emphasizeFirstBeat: false }
		});
		const times = list.map((e) => e.time);
		expect(times).toEqual([10, 11, 12, 13]);
	});
});
