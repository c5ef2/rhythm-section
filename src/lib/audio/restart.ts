/**
 * The look-ahead scheduler commits up to ~100 ms of `noteOn` events into the
 * spessasynth worklet's internal queue. spessasynth has no public API to
 * cancel a future-scheduled noteOn, so when the user regenerates we can't
 * simply stop the old scheduler and start a new one at `currentTime + 0.05`
 * — the queued kicks/clicks for the old rhythm fire on top of the new
 * rhythm's first beats.
 *
 * The fix is to schedule the next cycle past the previous scheduler's tail.
 * `previousTail` is the latest audio-context time the previous scheduler
 * dispatched (including bass sustain). A small extra gap absorbs the
 * worklet's own scheduling jitter.
 */
export const RESTART_GAP_SEC = 0.005;

export function pickRestartTime(currentTime: number, previousTail: number): number {
	const earliest = currentTime + 0.05;
	const safeAfterTail = previousTail + RESTART_GAP_SEC;
	return Math.max(earliest, safeAfterTail);
}
