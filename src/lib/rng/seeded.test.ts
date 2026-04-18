import { describe, expect, it } from 'vitest';
import { mulberry32, randomSeed } from './seeded';

describe('mulberry32', () => {
	it('produces deterministic output for a given seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const samplesA = Array.from({ length: 10 }, () => a());
		const samplesB = Array.from({ length: 10 }, () => b());
		expect(samplesA).toEqual(samplesB);
	});

	it('produces different output for different seeds', () => {
		const a = mulberry32(1);
		const b = mulberry32(2);
		expect(a()).not.toEqual(b());
	});

	it('produces values in [0, 1)', () => {
		const rng = mulberry32(12345);
		for (let i = 0; i < 1000; i++) {
			const v = rng();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe('randomSeed', () => {
	it('returns a non-negative 32-bit integer', () => {
		for (let i = 0; i < 100; i++) {
			const s = randomSeed();
			expect(Number.isInteger(s)).toBe(true);
			expect(s).toBeGreaterThanOrEqual(0);
			expect(s).toBeLessThan(2 ** 32);
		}
	});
});
