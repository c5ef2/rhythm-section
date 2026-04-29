import { describe, expect, it } from 'vitest';
import { buildEventList, type AudioEvent } from './events';
import type { MetronomeOptions, RhythmEvent } from '../rhythm/types';

function metronome(overrides: Partial<MetronomeOptions> = {}): MetronomeOptions {
	return {
		enabled: true,
		division: 'quarter',
		emphasizeFirstBeat: true,
		countedBeats: [true, true, true, true],
		...overrides
	};
}

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
			metronome: metronome(),
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
			metronome: metronome()
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
			metronome: metronome({ division: 'eighth', emphasizeFirstBeat: false })
		});
		const clicks = list.filter((e) => e.type === 'metronome');
		expect(clicks.length).toBe(8); // 2 per beat × 4 beats
	});

	it('emits a kick at each non-rest event when rhythmAudio is on (drum mode)', () => {
		const list = buildEventList({
			events: [quarter(), eighth({ isRest: true }), eighth(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'drum'
		});
		const hits = list.filter((e) => e.type === 'kick');
		expect(hits.length).toBe(4); // the 8th rest is skipped
	});

	it('emits exactly one kick per tied group regardless of length', () => {
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
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'drum'
		});
		const kicks = list.filter((e) => e.type === 'kick');
		expect(kicks.length).toBe(2);
	});

	it('emits exactly one bass hit per tied group with the summed duration', () => {
		const list = buildEventList({
			events: [eighth({ tiedToNext: true }), eighth(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'bass'
		});
		const hits = list.filter((e): e is Extract<AudioEvent, { type: 'bass' }> => e.type === 'bass');
		expect(hits.length).toBe(2);
		// First hit lasts across the tie: 0.5s + 0.5s = 1s; second is a quarter @60bpm = 1s.
		expect(hits[0].durationSec).toBeCloseTo(1);
		expect(hits[1].durationSec).toBeCloseTo(1);
	});

	it('overlays snare on beats 2 + 4 in drum mode', () => {
		const list = buildEventList({
			events: [quarter(), quarter(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'drum'
		});
		const snares = list.filter((e) => e.type === 'snare');
		expect(snares.map((e) => e.time)).toEqual([1, 3]);
	});

	it('hihat subdivision uses 8ths by default', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'drum',
			allowedLengths: ['quarter', 'eighth']
		});
		const hihats = list.filter((e) => e.type === 'hihat');
		expect(hihats.length).toBe(8);
	});

	it('hihat upgrades to 16ths when sixteenth is in allowedLengths', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'drum',
			allowedLengths: ['quarter', 'eighth', 'sixteenth']
		});
		const hihats = list.filter((e) => e.type === 'hihat');
		expect(hihats.length).toBe(16);
	});

	it('hihat goes triplet when eighth-triplet is allowed (beats 16ths)', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'drum',
			allowedLengths: ['quarter', 'sixteenth', 'eighth-triplet']
		});
		const hihats = list.filter((e) => e.type === 'hihat');
		expect(hihats.length).toBe(12); // 3 per beat × 4 beats
	});

	it('drum overlay only fires when rhythmAudio is on AND instrument is drum', () => {
		const off = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: false,
			rhythmInstrument: 'drum'
		});
		expect(off.filter((e) => e.type === 'snare' || e.type === 'hihat').length).toBe(0);

		const bassMode = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			rhythmAudio: true,
			rhythmInstrument: 'bass'
		});
		expect(bassMode.filter((e) => e.type === 'snare' || e.type === 'hihat').length).toBe(0);
	});

	it('always emits a highlight event for every rhythm event (rest, tied, or not)', () => {
		const list = buildEventList({
			events: [quarter(), eighth({ isRest: true }), eighth(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
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
			metronome: metronome(),
			rhythmAudio: true,
			rhythmInstrument: 'drum',
			countInBars: 1
		});
		const clicks = list.filter((e) => e.type === 'metronome');
		const firstHighlight = list.find((e) => e.type === 'highlight');
		const firstKick = list.find((e) => e.type === 'kick');
		expect(clicks.length).toBe(8); // 2 bars × 4 quarter clicks
		expect(firstHighlight?.time).toBeCloseTo(4); // after one bar of count-in @60bpm
		expect(firstKick?.time).toBeCloseTo(4);
	});

	it('shifts all times by startTime', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 10,
			metronome: metronome({ emphasizeFirstBeat: false })
		});
		const times = list.map((e) => e.time);
		expect(times).toEqual([10, 11, 12, 13]);
	});

	it('skips clicks on beats the user has turned off', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({
				emphasizeFirstBeat: false,
				countedBeats: [true, false, true, false]
			})
		});
		const times = list.filter((e) => e.type === 'metronome').map((e) => e.time);
		// Only beats 1 (t=0) and 3 (t=2) click.
		expect(times).toEqual([0, 2]);
	});

	it('count-in still clicks even when the metronome is disabled', () => {
		const list = buildEventList({
			events: [quarter(), quarter(), quarter(), quarter()],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({ enabled: false, emphasizeFirstBeat: false }),
			countInBars: 1
		});
		const clicks = list.filter(
			(e): e is Extract<AudioEvent, { type: 'metronome' }> => e.type === 'metronome'
		);
		// Count-in = four quarter clicks at t = 0, 1, 2, 3 (at 60 bpm).
		expect(clicks.map((c) => c.time)).toEqual([0, 1, 2, 3]);
		// Downbeat emphasised on the first click; the rest are plain on-beats.
		expect(clicks[0].emphasis).toBe('downbeat');
		expect(clicks.slice(1).every((c) => c.emphasis === 'onbeat')).toBe(true);
	});

	it('count-in clicks on every beat regardless of counted-beats', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({
				enabled: false,
				countedBeats: [true, false, false, false]
			}),
			countInBars: 1
		});
		const clicks = list.filter((e) => e.type === 'metronome');
		// Even though the metronome is configured to count only beat 1, the
		// count-in always clicks all four beats so the lead-in is clear.
		expect(clicks.length).toBe(4);
	});

	it('emits all eighth sub-clicks within a counted beat when division=eighth', () => {
		const list = buildEventList({
			events: [],
			bars: 1,
			bpm: 60,
			startTime: 0,
			metronome: metronome({
				division: 'eighth',
				emphasizeFirstBeat: false,
				countedBeats: [true, false, false, false]
			})
		});
		const times = list.filter((e) => e.type === 'metronome').map((e) => e.time);
		// Both eighths of beat 1 click: t=0 and t=0.5.
		expect(times).toEqual([0, 0.5]);
	});
});
