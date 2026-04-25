import { browser } from '$app/environment';

/**
 * Tracks whether the app is being viewed inside a browser tab or as a
 * standalone PWA (installed to home screen / dock). The standalone case
 * matters for the Share button: a browser-tab user can always copy the
 * URL from the address bar, but a PWA user has no address bar and needs
 * an in-app share affordance.
 */

function detectStandalone(): boolean {
	if (!browser) return false;
	if (window.matchMedia('(display-mode: standalone)').matches) return true;
	// iOS Safari home-screen pages expose this non-standard flag.
	if ((navigator as unknown as { standalone?: boolean }).standalone) return true;
	return false;
}

function detectShareApi(): boolean {
	if (!browser) return false;
	return typeof navigator.share === 'function';
}

class Environment {
	isStandalone: boolean = $state(detectStandalone());
	hasShareApi: boolean = $state(detectShareApi());

	constructor() {
		if (!browser) return;
		const mq = window.matchMedia('(display-mode: standalone)');
		mq.addEventListener?.('change', () => {
			this.isStandalone = detectStandalone();
		});
	}
}

export const environment = new Environment();
