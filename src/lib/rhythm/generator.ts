import { mulberry32, type Rng } from '../rng/seeded';
import { BINARY_SLOTS } from './types';
import type { GeneratorOptions, NoteLength, RhythmEvent } from './types';

const REST_PROBABILITY = 0.2;
const SLOTS_PER_BAR = 16;

const BINARY_LENGTHS = new Set<NoteLength>([
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
	const allowed = pickAllowedBinary(options.allowedLengths);

	const events: RhythmEvent[] = [];
	let remaining = totalSlots;

	while (remaining > 0) {
		const candidates = allowed.filter((l) => BINARY_SLOTS[l] <= remaining);
		const length = candidates.length > 0 ? pickOne(rng, candidates) : forceFit(remaining);
		const slots = BINARY_SLOTS[length];
		events.push({
			kind: 'binary',
			length,
			durationSlots: slots,
			isRest: options.allowRests && rng() < REST_PROBABILITY,
			tiedToNext: false
		});
		remaining -= slots;
	}

	return { events, seed: options.seed };
}

function pickAllowedBinary(
	requested: NoteLength[]
): Array<Exclude<NoteLength, 'eighth-triplet'>> {
	const binary = requested.filter((l) => BINARY_LENGTHS.has(l)) as Array<
		Exclude<NoteLength, 'eighth-triplet'>
	>;
	return binary.length > 0 ? binary : ['quarter'];
}

function pickOne<T>(rng: Rng, items: T[]): T {
	return items[Math.floor(rng() * items.length)];
}

function forceFit(remaining: number): Exclude<NoteLength, 'eighth-triplet'> {
	// Reached by corner case: nothing in allowed set fits. Pick the largest
	// binary length that does.
	const entries = Object.entries(BINARY_SLOTS) as Array<
		[Exclude<NoteLength, 'eighth-triplet'>, number]
	>;
	const fitting = entries.filter(([, slots]) => slots <= remaining);
	fitting.sort((a, b) => b[1] - a[1]);
	return fitting[0]?.[0] ?? 'sixteenth';
}
