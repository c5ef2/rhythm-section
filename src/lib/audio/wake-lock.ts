/**
 * Thin wrapper around the Screen Wake Lock API:
 *   https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
 *
 * Keeps the phone from sleeping while a rhythm is playing. Older iOS Safari
 * doesn't support the API — NoSleep.js works around that with a looping muted
 * video trick; we treat the call as a no-op on unsupported browsers to keep
 * the surface small.
 */

interface WakeLockSentinelLike {
	release(): Promise<void>;
	addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockApi {
	request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function getWakeLock(): WakeLockApi | null {
	if (typeof navigator === 'undefined') return null;
	const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;
	return api ?? null;
}

export class WakeLock {
	private sentinel: WakeLockSentinelLike | null = null;
	private wanted = false;

	constructor() {
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', () => this.onVisibilityChange());
		}
	}

	async acquire(): Promise<void> {
		this.wanted = true;
		await this.tryRequest();
	}

	async release(): Promise<void> {
		this.wanted = false;
		if (this.sentinel) {
			try {
				await this.sentinel.release();
			} catch {
				// Ignore — if the browser already released it, we're still done.
			}
			this.sentinel = null;
		}
	}

	private async tryRequest(): Promise<void> {
		if (!this.wanted || this.sentinel) return;
		const api = getWakeLock();
		if (!api) return;
		try {
			const sentinel = await api.request('screen');
			sentinel.addEventListener('release', () => {
				this.sentinel = null;
			});
			this.sentinel = sentinel;
		} catch (err) {
			console.warn('wake lock request failed', err);
		}
	}

	private onVisibilityChange(): void {
		if (document.visibilityState === 'visible' && this.wanted && !this.sentinel) {
			// Browsers drop the sentinel when the tab hides; re-acquire on return.
			this.tryRequest();
		}
	}
}
