import {
	Beam,
	Dot,
	Formatter,
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
const MODIFIER_WIDTH = 90; // clef + time signature
const MIN_PER_BAR = 260;
const FORMATTER_MARGIN = 20;

// Units of 1/12 of a beat, so every supported note length is a whole number of
// units. One beat = 12 units, one 4/4 bar = 48 units. Triplet-eighth fits
// (12 / 3 = 4) and sixteenth fits (12 / 4 = 3).
const UNITS_PER_BEAT = 12;
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

export function renderRhythm(
	host: HTMLDivElement,
	events: RhythmEvent[],
	bars: number
): RenderResult {
	host.innerHTML = '';

	const staveNotes = events.map(toStaveNote);
	const beams = buildBeams(events, staveNotes);
	const tuplets = buildTuplets(events, staveNotes);
	const ties = buildTies(events, staveNotes);

	const voice = new Voice({ numBeats: 4 * bars, beatValue: 4 });
	voice.setStrict(false);
	voice.addTickables(staveNotes);

	const formatter = new Formatter().joinVoices([voice]);
	const minNotesWidth = formatter.preCalculateMinTotalWidth([voice]);
	const notesWidth = Math.max(minNotesWidth + FORMATTER_MARGIN, MIN_PER_BAR * bars);
	const staveWidth = notesWidth + MODIFIER_WIDTH;
	const totalWidth = staveWidth + STAVE_PADDING * 2;

	const renderer = new Renderer(host, Renderer.Backends.SVG);
	renderer.resize(totalWidth, STAVE_HEIGHT);
	const ctx = renderer.getContext();

	const stave = new Stave(STAVE_PADDING, 10, staveWidth);
	stave.addClef('percussion').addTimeSignature('4/4');
	stave.setContext(ctx).draw();

	formatter.format([voice], notesWidth);
	voice.draw(ctx, stave);
	beams.forEach((b) => b.setContext(ctx).draw());
	tuplets.forEach((t) => t.setContext(ctx).draw());
	ties.forEach((t) => t.setContext(ctx).draw());

	const noteElements = staveNotes.map((n) => n.getSVGElement()).filter(isSvg);
	noteElements.forEach((el, i) => {
		el.dataset.rhythmIndex = String(i);
		el.classList.add('rhythm-note');
	});
	return { noteElements };
}

function isSvg(el: SVGElement | undefined): el is SVGElement {
	return el instanceof SVGElement;
}

function toStaveNote(e: RhythmEvent): StaveNote {
	const duration = vexDuration(e.length);
	const note = new StaveNote({
		keys: ['b/4'],
		duration: e.isRest ? duration + 'r' : duration
	});
	if (!e.isRest && isDotted(e.length)) {
		Dot.buildAndAttach([note], { all: true });
	}
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
 * Group beamable notes into beams that never cross a beat boundary.
 * For triplets, a beat's three triplet-eighths always form one beam.
 */
function buildBeams(events: RhythmEvent[], notes: StaveNote[]): Beam[] {
	const beams: Beam[] = [];
	let group: StaveNote[] = [];
	let groupKind: 'binary' | 'triplet' | null = null;
	let positionUnits = 0;

	const flush = () => {
		if (group.length >= 2) beams.push(new Beam(group));
		group = [];
		groupKind = null;
	};

	for (let i = 0; i < events.length; i++) {
		const e = events[i];
		const onBeatBoundary = positionUnits % UNITS_PER_BEAT === 0;

		if (!isBeamable(e)) {
			flush();
		} else {
			if (e.kind !== groupKind || onBeatBoundary) flush();
			group.push(notes[i]);
			groupKind = e.kind;
		}
		positionUnits += UNITS[e.length];
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

function buildTies(events: RhythmEvent[], notes: StaveNote[]): StaveTie[] {
	const ties: StaveTie[] = [];
	events.forEach((e, i) => {
		if (e.tiedToNext && i + 1 < notes.length) {
			ties.push(new StaveTie({ firstNote: notes[i], lastNote: notes[i + 1] }));
		}
	});
	return ties;
}

export function setActiveNote(elements: SVGElement[], activeIndex: number | null): void {
	elements.forEach((el, i) => {
		el.classList.toggle('rhythm-note-active', i === activeIndex);
	});
}
