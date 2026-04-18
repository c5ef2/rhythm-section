import { browser } from '$app/environment';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import type { Settings } from './settings';

export function readInitialSettings(): Settings {
	if (!browser) return DEFAULT_SETTINGS;
	return loadSettings({ storage: localStorage, hash: window.location.hash });
}

export function persist(settings: Settings): void {
	if (browser) saveSettings(settings, localStorage);
}
