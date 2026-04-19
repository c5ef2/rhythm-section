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
const MIN_PER_BAR = 220;
const STACK_BREAKPOINT = 520; // below this, 2 bars stack vertically instead of side by side
const FORMATTER_MARGIN = 20;

const UNITS_PER_BEAT = 12;
const BEATS_PER_BAR = 4;
const UNITS_PER_BAR = UNITS_PER_BEAT * BEATS_PER_BAR;
const UNITS: Readonly<Record<NoteLength, number>> = {
	whole: 48,
	half: 24,
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
	bars: number,
	availableWidth: number
): RenderResult {
	host.innerHTML = '';
	const slices = splitIntoBars(events, bars);

	const voices: Voice[] = [];
	const noteMatrix: StaveNote[][] = [];
	const formatters: Formatter[] = [];
	const minNotesWidths: number[] = [];

	slices.forEach((slice) => {
		const staveNotes = slice.events.map(toStaveNote);
		noteMatrix.push(staveNotes);

		const voice = new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 });
		voice.setStrict(false);
		voice.addTickables(staveNotes);
		voices.push(voice);

		const formatter = new Formatter().joinVoices([voice]);
		minNotesWidths.push(formatter.preCalculateMinTotalWidth([voice]));
		formatters.push(formatter);
	});

	// Below the stack breakpoint and with >1 bar, render bars on separate
	// lines so each bar gets the full viewport width.
	const stacked = bars > 1 && availableWidth > 0 && availableWidth < STACK_BREAKPOINT;
	const rows: number[][] = stacked
		? slices.map((_, i) => [i])
		: [slices.map((_, i) => i)];

	const staveWidths = computeStaveWidths(minNotesWidths, rows, availableWidth);
	const rowWidths = rows.map((row) => row.reduce((sum, i) => sum + staveWidths[i], 0));
	const totalWidth = Math.max(...rowWidths) + STAVE_PADDING * 2;
	const totalHeight = STAVE_HEIGHT * rows.length;

	const renderer = new Renderer(host, Renderer.Backends.SVG);
	renderer.resize(totalWidth, totalHeight);
	const ctx = renderer.getContext();

	const staves: Stave[] = new Array(slices.length);
	rows.forEach((row, rowIdx) => {
		let x = STAVE_PADDING;
		const y = 10 + rowIdx * STAVE_HEIGHT;
		row.forEach((barIndex) => {
			const stave = new Stave(x, y, staveWidths[barIndex]);
			const firstOnRow = row[0] === barIndex;
			// Every stacked row gets its own clef + time sig; side-by-side only the
			// leftmost stave does.
			if (firstOnRow) stave.addClef('bass').addTimeSignature('4/4');
			stave.setContext(ctx).draw();
			staves[barIndex] = stave;
			x += staveWidths[barIndex];
		});
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
	const firstOnRowSet = new Set<number>(rows.map((row) => row[0]));
	const barToRow = new Map<number, number>();
	rows.forEach((row, rowIdx) => row.forEach((barIdx) => barToRow.set(barIdx, rowIdx)));
	slices.forEach((slice, barIndex) => {
		const staveNotes = noteMatrix[barIndex];
		const modifier = firstOnRowSet.has(barIndex) ? FIRST_STAVE_MODIFIERS : MID_STAVE_MODIFIERS;
		const notesWidth = staveWidths[barIndex] - modifier;
		formatters[barIndex].format([voices[barIndex]], notesWidth);
		voices[barIndex].draw(ctx, staves[barIndex]);

		perBarBeams[barIndex].forEach((b) => b.setContext(ctx).draw());
		perBarTuplets[barIndex].forEach((t) => t.setContext(ctx).draw());

		flatNotes.push(...staveNotes);
		flatIndexMap.push(...slice.indexes);
	});

	// Ties: within a row a normal StaveTie spans the two notes; across rows we
	// draw two "half-ties" (one trailing off the previous row, one leading into
	// the next row) so there's no weird diagonal line between stacked bars.
	buildFlatTies(events, flatNotes, flatIndexMap, slices, barToRow).forEach((t) =>
		t.setContext(ctx).draw()
	);

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

/**
 * Compute a width for each bar-stave. If the total natural width fits inside
 * the available viewport, each stave gets exactly what it needs. Otherwise
 * shrink staves down (respecting a per-bar minimum) so the full row fits.
 */
function computeStaveWidths(
	minNotesWidths: number[],
	rows: number[][],
	availableWidth: number
): number[] {
	const widths = new Array(minNotesWidths.length).fill(0) as number[];
	rows.forEach((row) => {
		const rowBudget = Math.max(0, availableWidth - STAVE_PADDING * 2);
		const natural = row.map((i, localIdx) => {
			const modifiers = localIdx === 0 ? FIRST_STAVE_MODIFIERS : MID_STAVE_MODIFIERS;
			return Math.max(minNotesWidths[i] + FORMATTER_MARGIN, MIN_PER_BAR) + modifiers;
		});
		const naturalSum = natural.reduce((a, b) => a + b, 0);
		if (rowBudget === 0 || naturalSum <= rowBudget) {
			row.forEach((i, localIdx) => (widths[i] = natural[localIdx]));
			return;
		}
		// Too wide — scale each bar down proportionally.
		const scale = rowBudget / naturalSum;
		row.forEach((i, localIdx) => {
			const modifiers = localIdx === 0 ? FIRST_STAVE_MODIFIERS : MID_STAVE_MODIFIERS;
			const minimum = Math.max(minNotesWidths[i] * 0.6, MIN_PER_BAR * 0.6) + modifiers;
			widths[i] = Math.max(minimum, natural[localIdx] * scale);
		});
	});
	return widths;
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
			return 'h';
		case 'quarter':
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
	return length === 'dotted-eighth';
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
 * Beam notes so each beat is visually self-contained. We walk the bar a beat
 * at a time (using the absolute 1/12-of-a-beat unit position), collect the
 * beamable runs within each beat, then let VexFlow produce the beams for
 * that single beat. This is the only way to get clean "one beam per beat"
 * output when a beat starts with a rest — generateBeams by itself would
 * otherwise group notes from position zero and drift off the beat grid.
 */
function buildBeams(events: RhythmEvent[], notes: StaveNote[]): Beam[] {
	const beams: Beam[] = [];
	let beatEvents: RhythmEvent[] = [];
	let beatNotes: StaveNote[] = [];
	let positionUnits = 0;

	const flushBeat = () => {
		if (beatEvents.length === 0) return;
		let run: { kind: 'binary' | 'triplet'; notes: StaveNote[] } | null = null;
		const closeRun = () => {
			if (!run) return;
			if (run.kind === 'triplet') {
				if (run.notes.length >= 2) beams.push(new Beam(run.notes));
			} else if (run.notes.length >= 2) {
				// Every binary run in this array totals at most one beat, so a
				// single 1/4 group covers them; generateBeams still produces
				// partial secondary beams for mixed durations (8 + 16).
				beams.push(
					...Beam.generateBeams(run.notes, {
						groups: [new Fraction(1, 4)],
						beamRests: false
					})
				);
			}
			run = null;
		};
		beatEvents.forEach((e, i) => {
			if (!isBeamable(e)) {
				closeRun();
				return;
			}
			if (!run || run.kind !== e.kind) {
				closeRun();
				run = { kind: e.kind, notes: [] };
			}
			run.notes.push(beatNotes[i]);
		});
		closeRun();
		beatEvents = [];
		beatNotes = [];
	};

	events.forEach((e, i) => {
		beatEvents.push(e);
		beatNotes.push(notes[i]);
		positionUnits += UNITS[e.length];
		if (positionUnits % UNITS_PER_BEAT === 0) flushBeat();
	});
	flushBeat();
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
	flatIndexMap: number[],
	slices: BarSlice[],
	barToRow: Map<number, number>
): StaveTie[] {
	const ties: StaveTie[] = [];
	const originalToFlat: number[] = [];
	flatIndexMap.forEach((orig, flat) => (originalToFlat[orig] = flat));

	const originalToBar = new Map<number, number>();
	slices.forEach((slice, barIdx) => slice.indexes.forEach((orig) => originalToBar.set(orig, barIdx)));

	events.forEach((e, i) => {
		if (!e.tiedToNext || i + 1 >= events.length) return;
		const firstNote = flatNotes[originalToFlat[i]];
		const lastNote = flatNotes[originalToFlat[i + 1]];
		if (!firstNote || !lastNote) return;
		const rowA = barToRow.get(originalToBar.get(i) ?? -1);
		const rowB = barToRow.get(originalToBar.get(i + 1) ?? -1);
		if (rowA === rowB) {
			ties.push(new StaveTie({ firstNote, lastNote }));
		} else {
			// Half-ties: firstNote only → curves off the right edge of its row;
			// lastNote only → curves in from the left edge of the next row.
			ties.push(new StaveTie({ firstNote, lastNote: null }));
			ties.push(new StaveTie({ firstNote: null, lastNote }));
		}
	});
	return ties;
}

export function setActiveNote(elements: SVGElement[], activeIndex: number | null): void {
	elements.forEach((el, i) => {
		if (!el) return;
		el.classList.toggle('rhythm-note-active', i === activeIndex);
	});
}
