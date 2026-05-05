import { describe, expect, it } from 'vitest';
import { pickRestartTime, RESTART_GAP_SEC } from './restart';

describe('pickRestartTime', () => {
	it('uses currentTime + 0.05 when there is no previous tail', () => {
		expect(pickRestartTime(10, 0)).toBeCloseTo(10.05, 6);
	});

	it('uses currentTime + 0.05 when the previous tail is already in the past', () => {
		// Previous schedule finished at time 9, now is 10 → no overlap risk.
		expect(pickRestartTime(10, 9)).toBeCloseTo(10.05, 6);
	});

	it('delays past the tail when previous events extend past now', () => {
		// Previous schedule reached 10.08 (worklet has those queued);
		// starting at currentTime + 0.05 = 10.05 would overlap.
		expect(pickRestartTime(10, 10.08)).toBeCloseTo(10.08 + RESTART_GAP_SEC, 6);
	});

	it('delays well past a long bass sustain', () => {
		// Bass note running till 12.5; new cycle must start after that to avoid
		// hearing the old rhythm's bass under the new one.
		expect(pickRestartTime(10, 12.5)).toBeCloseTo(12.5 + RESTART_GAP_SEC, 6);
	});
});
