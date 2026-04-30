import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, STORAGE_KEY } from './settings';
import { encodeShare } from './share';

class MemStorage {
	private store = new Map<string, string>();
	getItem(k: string) {
		return this.store.get(k) ?? null;
	}
	setItem(k: string, v: string) {
		this.store.set(k, v);
	}
	removeItem(k: string) {
		this.store.delete(k);
	}
}

describe('settings persistence', () => {
	let storage: MemStorage;

	beforeEach(() => {
		storage = new MemStorage();
	});

	it('returns defaults when no hash and no stored value', () => {
		const s = loadSettings({ storage: storage as unknown as Storage, hash: '' });
		// seed is randomised on a fresh load so users don't get the same
		// rhythm twice; everything else matches DEFAULT_SETTINGS.
		expect({ ...s, seed: 0 }).toEqual({ ...DEFAULT_SETTINGS, seed: 0 });
		expect(typeof s.seed).toBe('number');
	});

	it('round-trips via localStorage', () => {
		const custom = { ...DEFAULT_SETTINGS, bpm: 144, bars: 2 as const };
		saveSettings(custom, storage as unknown as Storage);
		expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
		const loaded = loadSettings({ storage: storage as unknown as Storage, hash: '' });
		expect(loaded).toEqual(custom);
	});

	it('prefers hash over storage', () => {
		const stored = { ...DEFAULT_SETTINGS, bpm: 90 };
		saveSettings(stored, storage as unknown as Storage);
		const shared = { ...DEFAULT_SETTINGS, bpm: 200, seed: 777 };
		const hash = '#s=' + encodeShare(shared);
		const loaded = loadSettings({ storage: storage as unknown as Storage, hash });
		expect(loaded).toEqual(shared);
	});

	it('ignores invalid hash and falls back to storage', () => {
		const stored = { ...DEFAULT_SETTINGS, bpm: 90 };
		saveSettings(stored, storage as unknown as Storage);
		const loaded = loadSettings({
			storage: storage as unknown as Storage,
			hash: '#s=not-valid!!'
		});
		expect(loaded).toEqual(stored);
	});

	it('ignores corrupt stored JSON and returns defaults', () => {
		storage.setItem(STORAGE_KEY, '{not json');
		const loaded = loadSettings({ storage: storage as unknown as Storage, hash: '' });
		expect({ ...loaded, seed: 0 }).toEqual({ ...DEFAULT_SETTINGS, seed: 0 });
	});
});
