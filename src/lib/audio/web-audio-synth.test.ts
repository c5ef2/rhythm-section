import { describe, expect, it } from 'vitest';
import { BT_LATENCY_THRESHOLD_SEC, isBluetoothLikely } from './web-audio-synth';

describe('isBluetoothLikely', () => {
	it('returns false when outputLatency is missing or non-numeric', () => {
		expect(isBluetoothLikely(undefined)).toBe(false);
		expect(isBluetoothLikely(null)).toBe(false);
		expect(isBluetoothLikely(NaN)).toBe(false);
	});

	it('returns false when outputLatency is zero', () => {
		expect(isBluetoothLikely(0)).toBe(false);
	});

	it('returns false for built-in / wired latencies', () => {
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

	it('rejects negative or infinite values', () => {
		expect(isBluetoothLikely(-1)).toBe(false);
		expect(isBluetoothLikely(Number.POSITIVE_INFINITY)).toBe(false);
	});
});
