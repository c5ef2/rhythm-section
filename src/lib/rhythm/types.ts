/**
 * A duration is expressed in sixteenth-note slots for binary beats,
 * and as a 'triplet-eighth' span for triplet beats. We keep both
 * representations so the notation layer can render correctly and the
 * scheduler can compute timing without re-deriving tuplet ratios.
 */

export type NoteLength =
	| 'whole'
	| 'half'
	| 'quarter'
	| 'eighth'
	| 'sixteenth'
	| 'eighth-triplet'
	| 'dotted-eighth';

/** How many sixteenth-slots each binary note length consumes. */
export const BINARY_SLOTS: Readonly<Record<Exclude<NoteLength, 'eighth-triplet'>, number>> = {
	whole: 16,
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

export interface MetronomeOptions {
	enabled: boolean;
	division: MetronomeDivision;
	emphasizeFirstBeat: boolean;
}
