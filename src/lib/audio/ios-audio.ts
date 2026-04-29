/**
 * iOS ringer-switch workarounds.
 *
 * By default, Safari treats Web Audio output as "ambient" audio, which the
 * iPhone silences whenever the side ringer switch is in the muted position —
 * even at full volume, even while other apps (Apple Music, Spotify) play
 * normally. To escape that we run two complementary fixes:
 *
 *  1. `configureIosPlayback(ctx)` (call any time after the ctx is created):
 *     sets `ctx.audioSession.type = 'playback'` on Safari 18+ to opt the
 *     context into the media-playback session category.
 *
 *  2. `primeIosPlayback()` (must be called inside a user gesture, e.g. the
 *     Play button click): adds a hidden looping silent `<audio>` element
 *     and starts it. Any actively-playing HTMLMediaElement flips the page
 *     into media-playback mode on older Safari where the Audio Session
 *     API doesn't exist. Calling `play()` outside a user gesture is
 *     silently rejected, which is why the primer can't run from preload.
 */

const SILENT_WAV_DATA_URL = buildSilentWavDataUrl();

let silentEl: HTMLAudioElement | null = null;

export function configureIosPlayback(ctx: AudioContext): void {
	const ctxAny = ctx as AudioContext & {
		audioSession?: { type?: string };
	};
	if (ctxAny.audioSession) {
		try {
			ctxAny.audioSession.type = 'playback';
		} catch {
			// ignore — readonly on some older implementations
		}
	}
}

/**
 * Must be called from inside a user-gesture stack (click handler etc.).
 * Idempotent — repeated calls just keep the silent-audio loop running.
 */
export function primeIosPlayback(): void {
	if (typeof document === 'undefined') return;
	if (!silentEl) {
		const a = document.createElement('audio');
		a.setAttribute('playsinline', '');
		a.setAttribute('webkit-playsinline', '');
		a.loop = true;
		a.preload = 'auto';
		a.muted = false;
		a.volume = 0;
		a.src = SILENT_WAV_DATA_URL;
		a.style.display = 'none';
		document.body.appendChild(a);
		silentEl = a;
	}
	// play() returns a promise on iOS Safari; rejection means the gesture
	// didn't propagate (we'll try again on the next click).
	silentEl.play().catch(() => {});
}

/** 100 ms of silence as a WAV data-URL. Small enough to inline (~600 chars). */
function buildSilentWavDataUrl(): string {
	const sampleRate = 44100;
	const seconds = 0.1;
	const numSamples = Math.round(sampleRate * seconds);
	const dataBytes = numSamples * 2; // 16-bit mono
	const header = new Uint8Array(44 + dataBytes);
	const view = new DataView(header.buffer);
	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataBytes, true);
	// remaining bytes already zero = silence

	// Base64 encode without relying on btoa of binary string chunks (which
	// blow the stack for large inputs — fine here, but kept tidy).
	let binary = '';
	for (let i = 0; i < header.length; i++) binary += String.fromCharCode(header[i]);
	return 'data:audio/wav;base64,' + (typeof btoa === 'function' ? btoa(binary) : '');
}

function writeAscii(view: DataView, offset: number, s: string): void {
	for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
