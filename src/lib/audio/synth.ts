import type { ClickSink, RhythmSink } from './scheduler';

export type RhythmInstrument = 'drum' | 'bass';

export interface Synth extends ClickSink, RhythmSink {
	setInstrument(instrument: RhythmInstrument): void;
	destroy(): void;
}

/**
 * Fallback synth that uses Web Audio oscillators directly. Always available;
 * replaced at runtime by a SoundFont-backed synth once loaded.
 */
export function oscillatorSynth(ctx: AudioContext): Synth {
	let instrument: RhythmInstrument = 'drum';

	return {
		setInstrument(next) {
			instrument = next;
		},
		playClick(time, emphasis) {
			const freq = emphasis === 'downbeat' ? 1600 : emphasis === 'onbeat' ? 1000 : 700;
			const peak = emphasis === 'downbeat' ? 0.5 : 0.35;
			blip(ctx, time, freq, peak, 'square', 0.05);
		},
		playRhythm(time, durationSec) {
			if (instrument === 'drum') kick(ctx, time);
			else bass(ctx, time, durationSec);
		},
		destroy() {}
	};
}

function blip(
	ctx: AudioContext,
	time: number,
	freq: number,
	peak: number,
	type: OscillatorType,
	durationSec: number
): void {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0.0001, time);
	gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + durationSec);
	osc.connect(gain).connect(ctx.destination);
	osc.start(time);
	osc.stop(time + durationSec + 0.01);
}

function kick(ctx: AudioContext, time: number): void {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(140, time);
	osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
	gain.gain.setValueAtTime(0.0001, time);
	gain.gain.exponentialRampToValueAtTime(0.9, time + 0.005);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
	osc.connect(gain).connect(ctx.destination);
	osc.start(time);
	osc.stop(time + 0.3);
}

function bass(ctx: AudioContext, time: number, durationSec: number): void {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	const filter = ctx.createBiquadFilter();
	osc.type = 'sawtooth';
	// E2 ≈ 82.41 Hz
	osc.frequency.value = 82.41;
	filter.type = 'lowpass';
	filter.frequency.value = 500;
	filter.Q.value = 4;
	const sustain = Math.max(0.15, durationSec * 0.9);
	gain.gain.setValueAtTime(0.0001, time);
	gain.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.3, time + sustain * 0.6);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + sustain);
	osc.connect(filter).connect(gain).connect(ctx.destination);
	osc.start(time);
	osc.stop(time + sustain + 0.05);
}
