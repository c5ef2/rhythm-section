import { mulberry32, type Rng } from '../rng/seeded';
import { BINARY_SLOTS } from './types';
import type { GeneratorOptions, NoteLength, RhythmEvent } from './types';

const REST_PROBABILITY = 0.2;
const TIE_PROBABILITY = 0.15;
const TRIPLET_WEIGHT_WHEN_MIXED = 0.3;
const SLOTS_PER_BAR = 16;
const SLOTS_PER_BEAT = 4;

const LENGTH_BY_SLOTS: Readonly<Record<1 | 2 | 3 | 4, BinaryLength>> = {
	1: 'sixteenth',
	2: 'eighth',
	3: 'dotted-eighth',
	4: 'quarter'
};

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

		const candidates = binary.filter((l) => BINARY_SLOTS[l] <= remaining);
		const length = candidates.length > 0 ? pickOne(rng, candidates) : forceFit(remaining);
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

	if (options.allowTies) applyTiePass(events, rng);
	return { events: splitAtBeatBoundaries(events), seed: options.seed };
}

/**
 * Splits any binary event that crosses a beat boundary into per-beat pieces
 * connected by ties. Triplet events always fit within one beat and are left
 * alone. Rest pieces are split too (for readability) but never tied.
 */
function splitAtBeatBoundaries(events: RhythmEvent[]): RhythmEvent[] {
	const out: RhythmEvent[] = [];
	let pos = 0; // in sixteenth-equivalent slots; triplets advance by 4/3
	for (const e of events) {
		if (e.kind === 'triplet') {
			out.push(e);
			pos += 4 / 3;
			continue;
		}
		let remaining = e.durationSlots;
		while (remaining > 0) {
			const slotsLeftInBeat = SLOTS_PER_BEAT - (pos % SLOTS_PER_BEAT);
			const take = Math.min(remaining, slotsLeftInBeat) as 1 | 2 | 3 | 4;
			const isFinalPiece = remaining === take;
			out.push({
				kind: 'binary',
				length: LENGTH_BY_SLOTS[take],
				durationSlots: take,
				isRest: e.isRest,
				tiedToNext: e.isRest ? false : !isFinalPiece || e.tiedToNext
			});
			pos += take;
			remaining -= take;
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

function applyTiePass(events: RhythmEvent[], rng: Rng): void {
	for (let i = 0; i < events.length - 1; i++) {
		const a = events[i];
		const b = events[i + 1];
		if (a.isRest || b.isRest) continue;
		if (a.kind !== b.kind) continue;
		if (rng() < TIE_PROBABILITY) a.tiedToNext = true;
	}
}

function pickAllowedBinary(requested: NoteLength[]): BinaryLength[] {
	const binary = requested.filter((l) => BINARY_LENGTHS_SET.has(l)) as BinaryLength[];
	return binary.length > 0 ? binary : ['quarter'];
}

function pickOne<T>(rng: Rng, items: T[]): T {
	return items[Math.floor(rng() * items.length)];
}

function forceFit(remaining: number): BinaryLength {
	const entries = Object.entries(BINARY_SLOTS) as Array<[BinaryLength, number]>;
	const fitting = entries.filter(([, slots]) => slots <= remaining);
	fitting.sort((a, b) => b[1] - a[1]);
	return fitting[0]?.[0] ?? 'sixteenth';
}
