import {
	Beam,
	Dot,
	Formatter,
	Fraction,
	Renderer,
	Stave,
	StaveNote,
	StaveTie,
	Tuplet,
	Voice
} from 'vexflow';
import type { NoteLength, RhythmEvent } from '../rhythm/types';

export interface RenderResult {
	noteElements: SVGElement[];
}

const STAVE_HEIGHT = 140;
const STAVE_PADDING = 10;
const FIRST_STAVE_MODIFIERS = 90; // clef + time signature
const MID_STAVE_MODIFIERS = 20;
const MIN_PER_BAR = 260;
const FORMATTER_MARGIN = 20;

const UNITS_PER_BEAT = 12;
const BEATS_PER_BAR = 4;
const UNITS_PER_BAR = UNITS_PER_BEAT * BEATS_PER_BAR;
const UNITS: Readonly<Record<NoteLength, number>> = {
	whole: 48,
	'dotted-half': 36,
	half: 24,
	'dotted-quarter': 18,
	quarter: 12,
	'dotted-eighth': 9,
	eighth: 6,
	'eighth-triplet': 4,
	sixteenth: 3
};

interface BarSlice {
	events: RhythmEvent[];
	// indexes in the original events array (so we can still produce a flat
	// noteElements map for highlighting)
	indexes: number[];
}

export function renderRhythm(
	host: HTMLDivElement,
	events: RhythmEvent[],
	bars: number
): RenderResult {
	host.innerHTML = '';
	const slices = splitIntoBars(events, bars);

	const voices: Voice[] = [];
	const noteMatrix: StaveNote[][] = [];
	const formatters: Formatter[] = [];
	const staveWidths: number[] = [];

	slices.forEach((slice, barIndex) => {
		const staveNotes = slice.events.map(toStaveNote);
		noteMatrix.push(staveNotes);

		const voice = new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 });
		voice.setStrict(false);
		voice.addTickables(staveNotes);
		voices.push(voice);

		const formatter = new Formatter().joinVoices([voice]);
		const minWidth = formatter.preCalculateMinTotalWidth([voice]);
		const notesWidth = Math.max(minWidth + FORMATTER_MARGIN, MIN_PER_BAR);
		formatters.push(formatter);

		const modifierWidth = barIndex === 0 ? FIRST_STAVE_MODIFIERS : MID_STAVE_MODIFIERS;
		staveWidths.push(notesWidth + modifierWidth);
	});

	const totalStaveWidth = staveWidths.reduce((a, b) => a + b, 0);
	const totalWidth = totalStaveWidth + STAVE_PADDING * 2;

	const renderer = new Renderer(host, Renderer.Backends.SVG);
	renderer.resize(totalWidth, STAVE_HEIGHT);
	const ctx = renderer.getContext();

	let x = STAVE_PADDING;
	const staves: Stave[] = [];
	slices.forEach((_slice, barIndex) => {
		const stave = new Stave(x, 10, staveWidths[barIndex]);
		if (barIndex === 0) stave.addClef('bass').addTimeSignature('4/4');
		stave.setContext(ctx).draw();
		staves.push(stave);
		x += staveWidths[barIndex];
	});

	const flatNotes: StaveNote[] = [];
	const flatIndexMap: number[] = [];
	// Beams and tuplets must be constructed BEFORE the voice is drawn so each
	// note knows it is beamed and skips rendering its own flag.
	const perBarBeams: Beam[][] = [];
	const perBarTuplets: Tuplet[][] = [];
	slices.forEach((slice, barIndex) => {
		const staveNotes = noteMatrix[barIndex];
		perBarBeams.push(buildBeams(slice.events, staveNotes));
		perBarTuplets.push(buildTuplets(slice.events, staveNotes));
	});
	slices.forEach((slice, barIndex) => {
		const staveNotes = noteMatrix[barIndex];
		const notesWidth =
			staveWidths[barIndex] - (barIndex === 0 ? FIRST_STAVE_MODIFIERS : MID_STAVE_MODIFIERS);
		formatters[barIndex].format([voices[barIndex]], notesWidth);
		voices[barIndex].draw(ctx, staves[barIndex]);

		perBarBeams[barIndex].forEach((b) => b.setContext(ctx).draw());
		perBarTuplets[barIndex].forEach((t) => t.setContext(ctx).draw());

		flatNotes.push(...staveNotes);
		flatIndexMap.push(...slice.indexes);
	});

	// Cross-bar ties (if an event's tiedToNext is true and its next event lives
	// in the following bar, StaveTie still works across different staves).
	buildFlatTies(events, flatNotes, flatIndexMap).forEach((t) => t.setContext(ctx).draw());

	const noteElements: SVGElement[] = [];
	flatIndexMap.forEach((originalIndex, flatIdx) => {
		const el = flatNotes[flatIdx].getSVGElement();
		if (el instanceof SVGElement) {
			el.dataset.rhythmIndex = String(originalIndex);
			el.classList.add('rhythm-note');
			noteElements[originalIndex] = el;
		}
	});
	return { noteElements };
}

function splitIntoBars(events: RhythmEvent[], bars: number): BarSlice[] {
	const slices: BarSlice[] = [];
	for (let i = 0; i < bars; i++) slices.push({ events: [], indexes: [] });
	let position = 0;
	events.forEach((e, i) => {
		const barIndex = Math.min(Math.floor(position / UNITS_PER_BAR), bars - 1);
		slices[barIndex].events.push(e);
		slices[barIndex].indexes.push(i);
		position += UNITS[e.length];
	});
	return slices;
}

function toStaveNote(e: RhythmEvent): StaveNote {
	const duration = vexDuration(e.length);
	const note = new StaveNote({
		clef: 'bass',
		keys: ['a/2'],
		duration: e.isRest ? duration + 'r' : duration
	});
	if (!e.isRest && isDotted(e.length)) Dot.buildAndAttach([note], { all: true });
	return note;
}

function vexDuration(length: NoteLength): string {
	switch (length) {
		case 'whole':
			return 'w';
		case 'half':
		case 'dotted-half':
			return 'h';
		case 'quarter':
		case 'dotted-quarter':
			return 'q';
		case 'eighth':
		case 'dotted-eighth':
		case 'eighth-triplet':
			return '8';
		case 'sixteenth':
			return '16';
	}
}

function isDotted(length: NoteLength): boolean {
	return length === 'dotted-half' || length === 'dotted-quarter' || length === 'dotted-eighth';
}

function isBeamable(e: RhythmEvent): boolean {
	if (e.isRest) return false;
	return (
		e.length === 'eighth' ||
		e.length === 'sixteenth' ||
		e.length === 'dotted-eighth' ||
		e.length === 'eighth-triplet'
	);
}

/**
 * Split the bar into contiguous runs of beamable notes of the same kind, then
 * let VexFlow auto-beam each run:
 * - Binary runs use generateBeams with beat grouping so mixed note lengths
 *   (e.g. dotted-8th + 16th) get a full primary beam and a correct partial
 *   secondary beam.
 * - Triplet runs are grouped into consecutive triplet-beats (3 notes each).
 */
function buildBeams(events: RhythmEvent[], notes: StaveNote[]): Beam[] {
	const beams: Beam[] = [];
	let run: { kind: 'binary' | 'triplet'; notes: StaveNote[] } | null = null;

	const flush = () => {
		if (!run) return;
		if (run.kind === 'triplet') {
			for (let j = 0; j < run.notes.length; j += 3) {
				const chunk = run.notes.slice(j, j + 3);
				if (chunk.length >= 2) beams.push(new Beam(chunk));
			}
		} else {
			beams.push(
				...Beam.generateBeams(run.notes, {
					groups: [new Fraction(1, 4)],
					beamRests: false
				})
			);
		}
		run = null;
	};

	for (let i = 0; i < events.length; i++) {
		const e = events[i];
		if (!isBeamable(e)) {
			flush();
			continue;
		}
		if (!run || run.kind !== e.kind) {
			flush();
			run = { kind: e.kind, notes: [] };
		}
		run.notes.push(notes[i]);
	}
	flush();
	return beams;
}

function buildTuplets(events: RhythmEvent[], notes: StaveNote[]): Tuplet[] {
	const tuplets: Tuplet[] = [];
	for (let i = 0; i < events.length; i++) {
		if (events[i].kind === 'triplet') {
			const group = notes.slice(i, i + 3);
			if (group.length === 3) tuplets.push(new Tuplet(group));
			i += 2;
		}
	}
	return tuplets;
}

function buildFlatTies(
	events: RhythmEvent[],
	flatNotes: StaveNote[],
	flatIndexMap: number[]
): StaveTie[] {
	const ties: StaveTie[] = [];
	// flatIndexMap[j] = original index, so flat position of original index `k`
	// is the j for which flatIndexMap[j] === k. Since slices preserve order and
	// every event appears exactly once, the map is a permutation whose inverse
	// we compute once for quick lookup.
	const originalToFlat: number[] = [];
	flatIndexMap.forEach((orig, flat) => (originalToFlat[orig] = flat));
	events.forEach((e, i) => {
		if (!e.tiedToNext || i + 1 >= events.length) return;
		const firstNote = flatNotes[originalToFlat[i]];
		const lastNote = flatNotes[originalToFlat[i + 1]];
		if (firstNote && lastNote) ties.push(new StaveTie({ firstNote, lastNote }));
	});
	return ties;
}

export function setActiveNote(elements: SVGElement[], activeIndex: number | null): void {
	elements.forEach((el, i) => {
		if (!el) return;
		el.classList.toggle('rhythm-note-active', i === activeIndex);
	});
}
