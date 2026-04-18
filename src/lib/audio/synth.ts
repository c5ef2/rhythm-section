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
	// Low-pitched thump — phone speakers barely reproduce it but it's still
	// the musical body of the kick.
	const osc = ctx.createOscillator();
	const oscGain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(180, time);
	osc.frequency.exponentialRampToValueAtTime(60, time + 0.06);
	oscGain.gain.setValueAtTime(0.0001, time);
	oscGain.gain.exponentialRampToValueAtTime(0.9, time + 0.003);
	oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
	osc.connect(oscGain).connect(ctx.destination);
	osc.start(time);
	osc.stop(time + 0.15);

	// Mid-frequency attack transient so the hit is audible on phone speakers.
	const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
	const data = clickBuf.getChannelData(0);
	for (let i = 0; i < data.length; i++) {
		data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
	}
	const click = ctx.createBufferSource();
	const clickGain = ctx.createGain();
	const clickFilter = ctx.createBiquadFilter();
	clickFilter.type = 'bandpass';
	clickFilter.frequency.value = 1500;
	clickFilter.Q.value = 1.2;
	clickGain.gain.setValueAtTime(0.6, time);
	clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
	click.buffer = clickBuf;
	click.connect(clickFilter).connect(clickGain).connect(ctx.destination);
	click.start(time);
	click.stop(time + 0.05);
}

function bass(ctx: AudioContext, time: number, durationSec: number): void {
	// Sawtooth at A1 (55 Hz) plus the second harmonic (A2) so phone speakers,
	// which roll off below ~200 Hz, still give an audible pitched hit.
	const fund = ctx.createOscillator();
	const overtone = ctx.createOscillator();
	const gain = ctx.createGain();
	const filter = ctx.createBiquadFilter();
	fund.type = 'sawtooth';
	fund.frequency.value = 55;
	overtone.type = 'sawtooth';
	overtone.frequency.value = 110;
	filter.type = 'lowpass';
	filter.frequency.value = 900;
	filter.Q.value = 3;
	const sustain = Math.max(0.15, durationSec * 0.9);
	gain.gain.setValueAtTime(0.0001, time);
	gain.gain.exponentialRampToValueAtTime(0.55, time + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.35, time + sustain * 0.6);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + sustain);
	fund.connect(filter);
	overtone.connect(filter);
	filter.connect(gain).connect(ctx.destination);
	fund.start(time);
	overtone.start(time);
	fund.stop(time + sustain + 0.05);
	overtone.stop(time + sustain + 0.05);
}
