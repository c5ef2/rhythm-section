import { describe, expect, it } from 'vitest';
import { BT_LATENCY_THRESHOLD_SEC, isBluetoothLikely } from './web-audio-synth';

describe('isBluetoothLikely', () => {
	it('returns true when outputLatency is missing or non-numeric (unknown → assume BT)', () => {
		// Browsers that don't expose outputLatency leave it undefined; we'd
		// rather pay -78 dB of noise on wired than lose half the BT clicks.
		expect(isBluetoothLikely(undefined)).toBe(true);
		expect(isBluetoothLikely(null)).toBe(true);
		expect(isBluetoothLikely(NaN)).toBe(true);
	});

	it('returns true when outputLatency is zero (not yet populated)', () => {
		// iOS Safari and others can report 0 before audio actually flows
		// through the context, even with BT paired — treat as unknown.
		expect(isBluetoothLikely(0)).toBe(true);
	});

	it('returns false for clearly built-in / wired latencies', () => {
		// Typical built-in speaker / wired headphone latencies.
		expect(isBluetoothLikely(0.005)).toBe(false);
		expect(isBluetoothLikely(0.02)).toBe(false);
		expect(isBluetoothLikely(BT_LATENCY_THRESHOLD_SEC - 0.001)).toBe(false);
	});

	it('returns true at and above the threshold', () => {
		expect(isBluetoothLikely(BT_LATENCY_THRESHOLD_SEC)).toBe(true);
		// Typical BT headphone latencies.
		expect(isBluetoothLikely(0.15)).toBe(true);
		expect(isBluetoothLikely(0.3)).toBe(true);
	});

	it('treats degenerate values as unknown (assume BT)', () => {
		expect(isBluetoothLikely(-1)).toBe(true);
		expect(isBluetoothLikely(Number.POSITIVE_INFINITY)).toBe(true);
	});
});
