import type { ClickSink, RhythmSink } from './scheduler';

export type RhythmInstrument = 'drum' | 'bass';

export interface Synth extends ClickSink, RhythmSink {
	destroy(): void;
}

/**
 * Fallback synth that uses Web Audio oscillators directly. Always available;
 * replaced at runtime by a SoundFont-backed synth once loaded.
 */
export function oscillatorSynth(ctx: AudioContext): Synth {
	return {
		playClick(time, emphasis) {
			const freq = emphasis === 'downbeat' ? 1600 : emphasis === 'onbeat' ? 1000 : 700;
			const peak = emphasis === 'downbeat' ? 0.5 : 0.35;
			blip(ctx, time, freq, peak, 'square', 0.05);
		},
		playKick(time) {
			kick(ctx, time);
		},
		playSnare(time) {
			snare(ctx, time);
		},
		playHihat(time) {
			hihat(ctx, time);
		},
		playBass(time, durationSec) {
			bass(ctx, time, durationSec);
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

function snare(ctx: AudioContext, time: number): void {
	// White-noise burst through a band-pass + a 200 Hz tonal blip layered on top.
	const noiseLen = Math.floor(ctx.sampleRate * 0.18);
	const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
	const noise = ctx.createBufferSource();
	noise.buffer = buf;
	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.value = 2200;
	filter.Q.value = 0.6;
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.0001, time);
	gain.gain.exponentialRampToValueAtTime(0.6, time + 0.002);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
	noise.connect(filter).connect(gain).connect(ctx.destination);
	noise.start(time);
	noise.stop(time + 0.2);

	const tone = ctx.createOscillator();
	const toneGain = ctx.createGain();
	tone.type = 'triangle';
	tone.frequency.setValueAtTime(220, time);
	tone.frequency.exponentialRampToValueAtTime(140, time + 0.08);
	toneGain.gain.setValueAtTime(0.0001, time);
	toneGain.gain.exponentialRampToValueAtTime(0.35, time + 0.003);
	toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
	tone.connect(toneGain).connect(ctx.destination);
	tone.start(time);
	tone.stop(time + 0.12);
}

function hihat(ctx: AudioContext, time: number): void {
	// Short high-pass-filtered noise burst.
	const len = Math.floor(ctx.sampleRate * 0.05);
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
	const src = ctx.createBufferSource();
	src.buffer = buf;
	const filter = ctx.createBiquadFilter();
	filter.type = 'highpass';
	filter.frequency.value = 7000;
	filter.Q.value = 0.7;
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.0001, time);
	gain.gain.exponentialRampToValueAtTime(0.3, time + 0.001);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
	src.connect(filter).connect(gain).connect(ctx.destination);
	src.start(time);
	src.stop(time + 0.05);
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
