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
import type { RhythmEvent } from '../rhythm/types';

export interface RenderResult {
	noteElements: SVGElement[];
}

export function renderRhythm(
	host: HTMLDivElement,
	events: RhythmEvent[],
	bars: number
): RenderResult {
	host.innerHTML = '';
	const width = Math.max(360, 180 * bars + 90);
	const renderer = new Renderer(host, Renderer.Backends.SVG);
	renderer.resize(width, 140);
	const ctx = renderer.getContext();

	const stave = new Stave(10, 10, width - 20);
	stave.addClef('percussion').addTimeSignature('4/4');
	stave.setContext(ctx).draw();

	const staveNotes = events.map(toStaveNote);
	const beams = buildBeams(events, staveNotes);
	const tuplets = buildTuplets(events, staveNotes);
	const ties = buildTies(events, staveNotes);

	const voice = new Voice({ numBeats: 4 * bars, beatValue: 4 });
	voice.setStrict(false);
	voice.addTickables(staveNotes);
	new Formatter().joinVoices([voice]).format([voice], width - 60);
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
	const duration = vexDuration(e);
	const note = new StaveNote({
		keys: e.isRest ? ['b/4'] : ['b/4'],
		duration: e.isRest ? duration + 'r' : duration
	});
	if (!e.isRest && needsDot(e.length)) {
		Dot.buildAndAttach([note], { all: true });
	}
	return note;
}

function vexDuration(e: RhythmEvent): string {
	switch (e.length) {
		case 'whole':
			return 'w';
		case 'half':
			return 'h';
		case 'quarter':
			return 'q';
		case 'eighth':
			return '8';
		case 'sixteenth':
			return '16';
		case 'eighth-triplet':
			return '8';
		case 'dotted-half':
			return 'h';
		case 'dotted-quarter':
			return 'q';
		case 'dotted-eighth':
			return '8';
	}
}

function needsDot(length: RhythmEvent['length']): boolean {
	return length === 'dotted-half' || length === 'dotted-quarter' || length === 'dotted-eighth';
}

function buildBeams(events: RhythmEvent[], notes: StaveNote[]): Beam[] {
	const beams: Beam[] = [];
	let group: StaveNote[] = [];
	const flush = () => {
		if (group.length >= 2) beams.push(new Beam(group));
		group = [];
	};
	events.forEach((e, i) => {
		const beamable =
			!e.isRest &&
			(e.length === 'eighth' ||
				e.length === 'sixteenth' ||
				e.length === 'dotted-eighth' ||
				e.length === 'eighth-triplet');
		if (beamable) group.push(notes[i]);
		else flush();
	});
	flush();
	return beams;
}

function buildTuplets(events: RhythmEvent[], notes: StaveNote[]): Tuplet[] {
	const tuplets: Tuplet[] = [];
	let i = 0;
	while (i < events.length) {
		if (events[i].kind === 'triplet') {
			const group = notes.slice(i, i + 3);
			if (group.length === 3) tuplets.push(new Tuplet(group));
			i += 3;
		} else {
			i++;
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
