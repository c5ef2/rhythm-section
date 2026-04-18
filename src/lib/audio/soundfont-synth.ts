import { base } from '$app/paths';
import { WorkletSynthesizer } from 'spessasynth_lib';
import type { RhythmInstrument, Synth } from './synth';

// GM drum kit lives on channel 9 (zero-based); melodic channel 0 is used for
// bass. Note numbers follow the General MIDI standard drum map.
const DRUM_CHANNEL = 9;
const MELODIC_CHANNEL = 0;
const CLAVES = 75;
const WOODBLOCK = 76;
const BASS_DRUM = 36;
const FRETLESS_BASS_PROGRAM = 35;
const BASS_PITCH = 33; // A1

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

	let instrument: RhythmInstrument = 'drum';

	return {
		setInstrument(next) {
			instrument = next;
		},
		playClick(time, emphasis) {
			const note = emphasis === 'downbeat' ? CLAVES : WOODBLOCK;
			const velocity = emphasis === 'downbeat' ? 120 : emphasis === 'onbeat' ? 95 : 70;
			synth.noteOn(DRUM_CHANNEL, note, velocity, { time });
		},
		playRhythm(time, durationSec) {
			if (instrument === 'drum') {
				synth.noteOn(DRUM_CHANNEL, BASS_DRUM, 110, { time });
			} else {
				synth.noteOn(MELODIC_CHANNEL, BASS_PITCH, 100, { time });
				synth.noteOff(MELODIC_CHANNEL, BASS_PITCH, { time: time + durationSec });
			}
		},
		destroy() {
			synth.destroy();
		}
	};
}
