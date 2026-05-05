/**
 * A duration is expressed in sixteenth-note slots for binary beats,
 * and as a 'triplet-eighth' span for triplet beats. We keep both
 * representations so the notation layer can render correctly and the
 * scheduler can compute timing without re-deriving tuplet ratios.
 */

/**
 * `half` is here only because the metronome can click on the half-note
 * subdivision and the segmented control renders a half-note glyph for that
 * choice — the rhythm generator itself never emits a half note. A whole-note
 * length used to be in the list too, but nothing referenced it any more, so
 * it's gone.
 */
export type NoteLength =
	| 'half'
	| 'quarter'
	| 'eighth'
	| 'sixteenth'
	| 'eighth-triplet'
	| 'dotted-eighth';

/** How many sixteenth-slots each binary note length consumes. */
export const BINARY_SLOTS: Readonly<Record<Exclude<NoteLength, 'eighth-triplet'>, number>> = {
	half: 8,
	quarter: 4,
	eighth: 2,
	sixteenth: 1,
	'dotted-eighth': 3
} as const;

export type BeatKind = 'binary' | 'triplet';

/**
 * One rendered musical event in the generated bar.
 * `durationSlots` is in sixteenths for binary, in triplet-eighths for triplet.
 * `tiedToNext` indicates the renderer should draw a tie curve to the next event.
 */
export interface RhythmEvent {
	kind: BeatKind;
	length: NoteLength;
	durationSlots: number;
	isRest: boolean;
	tiedToNext: boolean;
}

/** Which group of notes the user is allowed to pick from. */
export interface GeneratorOptions {
	bars: 1 | 2;
	allowedLengths: NoteLength[];
	allowRests: boolean;
	allowTies: boolean;
	seed: number;
}

/** Quarter-note subdivisions used by the metronome click scheduler. */
export type MetronomeDivision = 'half' | 'quarter' | 'eighth' | 'triplet' | 'sixteenth';

/** Which voice the rhythm hits play through when audio is on. */
export type RhythmInstrument = 'drum' | 'bass';

/** How often the hihat fires under the rhythm — independent of the rhythm itself. */
export type HihatSubdivision = 'off' | 'eighth' | 'sixteenth' | 'triplet';

export interface MetronomeOptions {
	enabled: boolean;
	division: MetronomeDivision;
	emphasizeFirstBeat: boolean;
	/**
	 * One flag per beat of the bar (4 entries for 4/4). A click is only emitted
	 * on a beat if its flag is true. When the division is finer than a quarter
	 * (e.g. eighth), every sub-click within a counted beat also fires, so
	 * "count only beat 1 at eighth division" produces two clicks at the start
	 * of the bar, not one.
	 */
	countedBeats: [boolean, boolean, boolean, boolean];
}
