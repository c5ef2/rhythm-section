/**
 * iOS ringer-switch workarounds.
 *
 * By default, Safari treats Web Audio output as "ambient" audio, which the
 * iPhone silences whenever the side ringer switch is in the muted position —
 * even at full volume, even while other apps (Apple Music, Spotify) play
 * normally. To escape that, we:
 *
 *  1. Set `audioContext.audioSession.type = 'playback'` where supported
 *     (Safari 18+). This is the standards-based answer: we declare ourselves
 *     a media-playback app and the OS mixes us with the media volume, not
 *     with the notification/ringer stream.
 *
 *  2. As a fallback for Safari 17 and earlier where the Audio Session API
 *     doesn't exist, play a looping silent `<audio>` element alongside the
 *     AudioContext during the user's first play gesture. Any HTML media
 *     element that is actively playing flips the page into the "media
 *     playback" mode, which also bypasses the ringer switch.
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
	primeSilentAudio();
}

function primeSilentAudio(): void {
	if (typeof document === 'undefined') return;
	if (silentEl) {
		// Already primed; make sure the loop is still running.
		silentEl.play().catch(() => {});
		return;
	}
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
	// Play is gated on the user gesture that triggered the audio context,
	// so this is safe inside the same stack.
	a.play().catch(() => {
		/* Safari may refuse on first try; the Audio Session API covers us. */
	});
	silentEl = a;
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
