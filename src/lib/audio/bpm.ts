/**
 * Classic Maelzel metronome steps, from 40 through 208. The scale is roughly
 * geometric (2 between 40–60, 3 between 60–72, 4 between 72–120, 6 between
 * 120–144, 8 between 144–208), which is how mechanical metronomes clicked.
 * We snap the BPM selector to these values so a "click" up/down feels the
 * same size regardless of tempo.
 */
export const MAELZEL_BPMS: readonly number[] = [
	40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108,
	112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208
];

export const MIN_BPM = MAELZEL_BPMS[0];
export const MAX_BPM = MAELZEL_BPMS[MAELZEL_BPMS.length - 1];

/** Snap an arbitrary BPM to the nearest Maelzel step. */
export function snapBpm(value: number): number {
	let best = MAELZEL_BPMS[0];
	let bestDelta = Math.abs(value - best);
	for (const step of MAELZEL_BPMS) {
		const d = Math.abs(value - step);
		if (d < bestDelta) {
			best = step;
			bestDelta = d;
		}
	}
	return best;
}

/** One step up the scale (clamped at the top). */
export function bpmStepUp(value: number): number {
	const idx = MAELZEL_BPMS.indexOf(snapBpm(value));
	return MAELZEL_BPMS[Math.min(idx + 1, MAELZEL_BPMS.length - 1)];
}

/** One step down the scale (clamped at the bottom). */
export function bpmStepDown(value: number): number {
	const idx = MAELZEL_BPMS.indexOf(snapBpm(value));
	return MAELZEL_BPMS[Math.max(idx - 1, 0)];
}

/**
 * Inclusive lower / upper bounds (in BPM) for the "I'm feeling lucky" tempo
 * roll. 60–120 covers the slow-practice → groove zone — fast enough to feel
 * the rhythm, slow enough to read clean sixteenths.
 */
export const LUCKY_BPM_MIN = 60;
export const LUCKY_BPM_MAX = 120;

/** Pick a uniformly-random Maelzel notch in the lucky range using `rng`. */
export function pickLuckyBpm(rng: () => number): number {
	const candidates = MAELZEL_BPMS.filter((n) => n >= LUCKY_BPM_MIN && n <= LUCKY_BPM_MAX);
	const idx = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
	return candidates[idx];
}
