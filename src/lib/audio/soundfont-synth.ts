import { base } from '$app/paths';
import { WorkletSynthesizer } from 'spessasynth_lib';
import type { Synth } from './scheduler';

// GM drum kit lives on channel 9 (zero-based); melodic channel 0 is used for
// bass. Note numbers follow the General MIDI standard drum map.
const DRUM_CHANNEL = 9;
const MELODIC_CHANNEL = 0;
const CLAVES = 75;
const WOODBLOCK = 76;
const KICK = 36;
const SNARE = 38;
const CLOSED_HIHAT = 42;
const FRETLESS_BASS_PROGRAM = 35;
const BASS_PITCH = 33; // A1

/**
 * URL of the small SoundFont bundled with the app (drum kit + fretless bass).
 * Built by `npm run soundfont` from the full GeneralUserGS via
 * spessasynth_core.
 */
export const BUNDLED_SOUNDFONT_URL = `${base}/rhythm.sf3`;

let workletModulePromise: Promise<void> | null = null;

function ensureWorkletLoaded(ctx: BaseAudioContext): Promise<void> {
	if (!workletModulePromise) {
		workletModulePromise = ctx.audioWorklet.addModule(
			`${base}/spessasynth_processor.min.js`
		);
	}
	return workletModulePromise;
}

export interface SoundFontSynthOptions {
	ctx: AudioContext;
	soundFontBuffer: ArrayBuffer;
}

/** Fetch the bundled SoundFont into an ArrayBuffer. */
export async function fetchBundledSoundFont(): Promise<ArrayBuffer> {
	const res = await fetch(BUNDLED_SOUNDFONT_URL);
	if (!res.ok) throw new Error(`SoundFont fetch failed: ${res.status}`);
	return res.arrayBuffer();
}

export async function createSoundFontSynth({
	ctx,
	soundFontBuffer
}: SoundFontSynthOptions): Promise<Synth> {
	await ensureWorkletLoaded(ctx);
	const synth = new WorkletSynthesizer(ctx);
	await synth.soundBankManager.addSoundBank(soundFontBuffer, 'main');
	await synth.isReady;
	synth.connect(ctx.destination);
	synth.programChange(MELODIC_CHANNEL, FRETLESS_BASS_PROGRAM);

	return {
		playClick(time, emphasis) {
			const note = emphasis === 'downbeat' ? CLAVES : WOODBLOCK;
			const velocity = emphasis === 'downbeat' ? 120 : emphasis === 'onbeat' ? 95 : 70;
			synth.noteOn(DRUM_CHANNEL, note, velocity, { time });
		},
		playKick(time) {
			synth.noteOn(DRUM_CHANNEL, KICK, 115, { time });
		},
		playSnare(time) {
			synth.noteOn(DRUM_CHANNEL, SNARE, 105, { time });
		},
		playHihat(time) {
			synth.noteOn(DRUM_CHANNEL, CLOSED_HIHAT, 75, { time });
		},
		playBass(time, durationSec) {
			synth.noteOn(MELODIC_CHANNEL, BASS_PITCH, 100, { time });
			synth.noteOff(MELODIC_CHANNEL, BASS_PITCH, { time: time + durationSec });
		},
		destroy() {
			synth.destroy();
		}
	};
}
