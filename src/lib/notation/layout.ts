import type { NoteLength, RhythmEvent } from '../rhythm/types';

/**
 * Pure layout / math utilities used by the VexFlow renderer in `render.ts`.
 * Kept in a separate module so the bar-splitting and width-fitting logic
 * stays testable without spinning up an SVG DOM.
 */

export const STAVE_HEIGHT = 140;
export const STAVE_PADDING = 10;
export const FIRST_STAVE_MODIFIERS = 45; // time signature only (no clef)
export const MID_STAVE_MODIFIERS = 20;
export const MIN_PER_BAR = 220;
/** Below this width, 2 bars stack vertically instead of side by side. */
export const STACK_BREAKPOINT = 520;
export const FORMATTER_MARGIN = 20;

export const UNITS_PER_BEAT = 12;
export const BEATS_PER_BAR = 4;
export const UNITS_PER_BAR = UNITS_PER_BEAT * BEATS_PER_BAR;

/**
 * 1/12-of-a-beat units consumed by each note length. Triplet eighths are 4
 * units, ordinary eighths are 6, etc — chosen so accumulated triplet
 * positions don't drift away from beat boundaries with integer arithmetic.
 */
export const UNITS: Readonly<Record<NoteLength, number>> = {
	quarter: 12,
	'dotted-eighth': 9,
	eighth: 6,
	'eighth-triplet': 4,
	sixteenth: 3
};

export interface BarSlice {
	events: RhythmEvent[];
	/** Indexes in the original events array — needed to map flat note refs back to rhythm indexes for highlighting. */
	indexes: number[];
}

/**
 * Distribute a flat rhythm-event list into `bars` slots based on accumulated
 * note duration. An event whose start position falls inside bar `b` belongs
 * to bar `b`, even if it spills slightly past the bar line — the generator
 * is responsible for not producing oversized binary events that cross bars.
 */
export function splitIntoBars(events: RhythmEvent[], bars: number): BarSlice[] {
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

/**
 * Compute a width for each bar-stave. When bars sit on their own rows
 * (stacked layout) we return the same width for every bar so rows line up
 * visually. Otherwise each bar gets its own natural width, scaled down if
 * the whole row overflows the viewport budget.
 */
export function computeStaveWidths(
	minNotesWidths: number[],
	rows: number[][],
	availableWidth: number,
	stacked: boolean
): number[] {
	const widths = new Array(minNotesWidths.length).fill(0) as number[];

	if (stacked) {
		// All rows are single-bar rows. Pick one width = max of each row's
		// natural width, capped at the available budget.
		const rowBudget = Math.max(0, availableWidth - STAVE_PADDING * 2);
		const naturalPerRow = rows.map((row) => {
			const i = row[0];
			return (
				Math.max(minNotesWidths[i] + FORMATTER_MARGIN, MIN_PER_BAR) + FIRST_STAVE_MODIFIERS
			);
		});
		const target =
			rowBudget > 0 ? Math.min(rowBudget, Math.max(...naturalPerRow)) : Math.max(...naturalPerRow);
		rows.forEach((row) => (widths[row[0]] = target));
		return widths;
	}

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

export function isDotted(length: NoteLength): boolean {
	return length === 'dotted-eighth';
}
