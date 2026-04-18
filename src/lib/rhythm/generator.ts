import { mulberry32, type Rng } from '../rng/seeded';
import { BINARY_SLOTS } from './types';
import type { GeneratorOptions, NoteLength, RhythmEvent } from './types';

const REST_PROBABILITY = 0.2;
const LONG_CHAIN_CHANCE = 0.05; // 5% of picks may produce a 3-note tied chain
const TRIPLET_WEIGHT_WHEN_MIXED = 0.3;
const SLOTS_PER_BAR = 16;
const SLOTS_PER_BEAT = 4;

const LENGTH_BY_SLOTS: Readonly<Record<1 | 2 | 3 | 4, BinaryLength>> = {
	1: 'sixteenth',
	2: 'eighth',
	3: 'dotted-eighth',
	4: 'quarter'
};

// 1/12 of a beat; lets us track positions with only integer arithmetic across
// binary subdivisions (3, 6, 9, 12, ...) and triplet eighths (4), so accumulated
// triplet positions don't drift away from beat boundaries.
const UNITS_PER_BEAT = 12;
const UNITS_PER_SIXTEENTH = 3;
const TRIPLET_UNITS = 4;

type BinaryLength = Exclude<NoteLength, 'eighth-triplet'>;

const BINARY_LENGTHS_SET = new Set<NoteLength>([
	'whole',
	'half',
	'quarter',
	'eighth',
	'sixteenth',
	'dotted-half',
	'dotted-quarter',
	'dotted-eighth'
]);

export interface GeneratedRhythm {
	events: RhythmEvent[];
	seed: number;
}

export function generateRhythm(options: GeneratorOptions): GeneratedRhythm {
	const rng = mulberry32(options.seed);
	const totalSlots = SLOTS_PER_BAR * options.bars;
	const binary = pickAllowedBinary(options.allowedLengths);
	const tripletAllowed = options.allowedLengths.includes('eighth-triplet');
	const binaryExplicitlyAllowed = options.allowedLengths.some((l) => BINARY_LENGTHS_SET.has(l));
	const canFill = buildCanFillTable(binary, totalSlots);

	const events: RhythmEvent[] = [];
	let position = 0; // consumed binary slots from the start of the piece

	while (position < totalSlots) {
		const remaining = totalSlots - position;
		const atBeatBoundary = position % SLOTS_PER_BEAT === 0 && remaining >= SLOTS_PER_BEAT;

		if (atBeatBoundary && shouldPickTriplet(rng, tripletAllowed, binaryExplicitlyAllowed)) {
			emitTripletBeat(events, rng, options.allowRests);
			position += SLOTS_PER_BEAT;
			continue;
		}

		// When ties are disallowed, never pick a duration that would cross the
		// next beat boundary — otherwise splitAtBeatBoundaries would need to
		// introduce ties to keep the notation readable.
		const slotsLeftInBeat = SLOTS_PER_BEAT - (position % SLOTS_PER_BEAT);
		const maxSlots = options.allowTies ? remaining : Math.min(remaining, slotsLeftInBeat);
		// 95 % of picks must stay inside a 2-piece chain (one tie); 5 % can go
		// to 3 pieces (two ties). Never 4+.
		const maxChain = options.allowTies ? (rng() < LONG_CHAIN_CHANCE ? 3 : 2) : 1;
		const length = pickFillingLength(rng, binary, maxSlots, canFill, position, maxChain);
		const slots = BINARY_SLOTS[length];
		events.push({
			kind: 'binary',
			length,
			durationSlots: slots,
			isRest: options.allowRests && rng() < REST_PROBABILITY,
			tiedToNext: false
		});
		position += slots;
	}

	return { events: splitAtBeatBoundaries(events), seed: options.seed };
}

/**
 * Splits any binary event that crosses a beat boundary into per-beat pieces
 * connected by ties. Triplet events always fit within one beat and are left
 * alone. Rest pieces are split too (for readability) but never tied.
 */
function splitAtBeatBoundaries(events: RhythmEvent[]): RhythmEvent[] {
	const out: RhythmEvent[] = [];
	let posUnits = 0; // integer 1/12-of-a-beat units
	for (const e of events) {
		if (e.kind === 'triplet') {
			out.push(e);
			posUnits += TRIPLET_UNITS;
			continue;
		}
		let remainingUnits = e.durationSlots * UNITS_PER_SIXTEENTH;
		while (remainingUnits > 0) {
			const unitsLeftInBeat = UNITS_PER_BEAT - (posUnits % UNITS_PER_BEAT);
			const takeUnits = Math.min(remainingUnits, unitsLeftInBeat);
			const takeSlots = (takeUnits / UNITS_PER_SIXTEENTH) as 1 | 2 | 3 | 4;
			const isFinalPiece = remainingUnits === takeUnits;
			out.push({
				kind: 'binary',
				length: LENGTH_BY_SLOTS[takeSlots],
				durationSlots: takeSlots,
				isRest: e.isRest,
				tiedToNext: e.isRest ? false : !isFinalPiece || e.tiedToNext
			});
			posUnits += takeUnits;
			remainingUnits -= takeUnits;
		}
	}
	return out;
}

function shouldPickTriplet(
	rng: Rng,
	tripletAllowed: boolean,
	binaryExplicitlyAllowed: boolean
): boolean {
	if (!tripletAllowed) return false;
	if (!binaryExplicitlyAllowed) return true;
	return rng() < TRIPLET_WEIGHT_WHEN_MIXED;
}

function emitTripletBeat(events: RhythmEvent[], rng: Rng, allowRests: boolean): void {
	for (let i = 0; i < 3; i++) {
		events.push({
			kind: 'triplet',
			length: 'eighth-triplet',
			durationSlots: 1,
			isRest: allowRests && rng() < REST_PROBABILITY,
			tiedToNext: false
		});
	}
}

function pickAllowedBinary(requested: NoteLength[]): BinaryLength[] {
	const binary = requested.filter((l) => BINARY_LENGTHS_SET.has(l)) as BinaryLength[];
	return binary.length > 0 ? binary : ['quarter'];
}

function pickOne<T>(rng: Rng, items: T[]): T {
	return items[Math.floor(rng() * items.length)];
}

/**
 * canFill[t] = can `t` remaining slots be completely filled using only the
 * allowed binary lengths? Lets the picker stay inside the allowed set instead
 * of falling back to a length the user never selected.
 */
function buildCanFillTable(binary: BinaryLength[], maxSlots: number): boolean[] {
	const dp = new Array(maxSlots + 1).fill(false);
	dp[0] = true;
	for (let t = 1; t <= maxSlots; t++) {
		for (const l of binary) {
			const s = BINARY_SLOTS[l];
			if (s <= t && dp[t - s]) {
				dp[t] = true;
				break;
			}
		}
	}
	return dp;
}

function pickFillingLength(
	rng: Rng,
	binary: BinaryLength[],
	maxSlots: number,
	canFill: boolean[],
	position: number,
	maxChainPieces: number
): BinaryLength {
	// Keep only the durations that fit, leave a fillable remainder, and stay
	// under the chain-length cap when split at beat boundaries.
	const withinChain = (slots: number) => beatsSpanning(position, slots) <= maxChainPieces;
	const candidates = binary.filter((l) => {
		const s = BINARY_SLOTS[l];
		return s <= maxSlots && (canFill[maxSlots - s] ?? false) && withinChain(s);
	});
	if (candidates.length > 0) return pickOne(rng, candidates);

	// Relax the chain cap before giving up (pathological allowed sets).
	const relaxedCandidates = binary.filter((l) => {
		const s = BINARY_SLOTS[l];
		return s <= maxSlots && (canFill[maxSlots - s] ?? false);
	});
	if (relaxedCandidates.length > 0) return pickOne(rng, relaxedCandidates);

	// Last resort: largest length that at least fits.
	const fitting = binary.filter((l) => BINARY_SLOTS[l] <= maxSlots);
	if (fitting.length > 0) {
		fitting.sort((a, b) => BINARY_SLOTS[b] - BINARY_SLOTS[a]);
		return fitting[0];
	}
	return 'sixteenth';
}

function beatsSpanning(position: number, duration: number): number {
	if (duration <= 0) return 0;
	const startBeat = Math.floor(position / SLOTS_PER_BEAT);
	const endBeat = Math.floor((position + duration - 1) / SLOTS_PER_BEAT);
	return endBeat - startBeat + 1;
}
