import type { Synth } from './scheduler';

/**
 * Lightweight synth that produces all six voices the rhythm app needs
 * (kick, snare, closed hihat, woodblock, claves, bass) directly from
 * raw Web Audio primitives — no SoundFont, no worklet, no library.
 *
 * Why not spessasynth: every `noteOn(time)` it accepts is queued inside
 * an opaque worklet that we can't cancel. With AudioBufferSourceNode and
 * OscillatorNode we hold the references ourselves, and `stopAll()`
 * actually aborts every event we've scheduled into the future — that's
 * what makes regenerate, restart, and Bluetooth latency tractable.
 *
 * Each voice synthesizes its sound on demand: a few oscillators or a
 * noise buffer through a filter, with an amplitude envelope on a
 * GainNode. Per-hit allocation is fine — a 4-bar busy rhythm is on the
 * order of 100 hits / second, which Web Audio handles comfortably.
 */
export class WebAudioSynth implements Synth {
	private active = new Set<AudioScheduledSourceNode>();
	private noiseBuffer: AudioBuffer;

	constructor(private readonly ctx: AudioContext) {
		this.noiseBuffer = createWhiteNoiseBuffer(ctx);
	}

	playClick(time: number, emphasis: 'downbeat' | 'onbeat' | 'subbeat'): void {
		// Woodblock-ish click. Downbeat sits a bit lower with a longer
		// body so it actually reads as the "1"; sub-beats are quieter and
		// slightly shorter so they don't compete with the rhythm voices.
		const freq = emphasis === 'downbeat' ? 1700 : emphasis === 'onbeat' ? 2400 : 2400;
		const gain = emphasis === 'downbeat' ? 0.6 : emphasis === 'onbeat' ? 0.45 : 0.28;
		const decay = emphasis === 'subbeat' ? 0.04 : 0.06;
		this.tonalBlip(time, freq, gain, decay);
	}

	playKick(time: number): void {
		// Short pitch sweep from 150 Hz down to 40 Hz with a fast amp
		// envelope — classic 808-ish punch, dry enough to read on phone
		// speakers and Bluetooth.
		const osc = new OscillatorNode(this.ctx, { type: 'sine', frequency: 150 });
		const env = new GainNode(this.ctx, { gain: 0 });
		osc.frequency.setValueAtTime(150, time);
		osc.frequency.exponentialRampToValueAtTime(40, time + 0.06);
		env.gain.setValueAtTime(0, time);
		env.gain.linearRampToValueAtTime(0.95, time + 0.005);
		env.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
		osc.connect(env).connect(this.ctx.destination);
		this.scheduleSource(osc, time, 0.4);
	}

	playSnare(time: number): void {
		// Snare = body tone (pitched ~200 Hz) + bandpassed noise. Two
		// envelopes, both decay fast (~0.18 s) for a sharp backbeat.
		const body = new OscillatorNode(this.ctx, { type: 'triangle', frequency: 200 });
		const bodyEnv = new GainNode(this.ctx, { gain: 0 });
		bodyEnv.gain.setValueAtTime(0, time);
		bodyEnv.gain.linearRampToValueAtTime(0.4, time + 0.002);
		bodyEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
		body.connect(bodyEnv).connect(this.ctx.destination);
		this.scheduleSource(body, time, 0.12);

		const noise = new AudioBufferSourceNode(this.ctx, { buffer: this.noiseBuffer });
		const filter = new BiquadFilterNode(this.ctx, {
			type: 'bandpass',
			frequency: 1800,
			Q: 0.9
		});
		const noiseEnv = new GainNode(this.ctx, { gain: 0 });
		noiseEnv.gain.setValueAtTime(0, time);
		noiseEnv.gain.linearRampToValueAtTime(0.55, time + 0.002);
		noiseEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
		noise.connect(filter).connect(noiseEnv).connect(this.ctx.destination);
		this.scheduleSource(noise, time, 0.18);
	}

	playHihat(time: number): void {
		// Closed hat: highpass-filtered noise with a snappy ~50 ms decay.
		const noise = new AudioBufferSourceNode(this.ctx, { buffer: this.noiseBuffer });
		const filter = new BiquadFilterNode(this.ctx, { type: 'highpass', frequency: 7000 });
		const env = new GainNode(this.ctx, { gain: 0 });
		env.gain.setValueAtTime(0, time);
		env.gain.linearRampToValueAtTime(0.35, time + 0.001);
		env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
		noise.connect(filter).connect(env).connect(this.ctx.destination);
		this.scheduleSource(noise, time, 0.05);
	}

	playBass(time: number, durationSec: number): void {
		// E2-ish fundamental (≈82 Hz on the bass guitar range) with a
		// soft attack and an explicit release ramp at noteOff time so the
		// note doesn't click off. The duration on the wire is sample-
		// accurate; we just need to choose a release that fits cleanly
		// inside even short notes.
		const FUNDAMENTAL = 82.41;
		const RELEASE = Math.min(0.08, durationSec * 0.5);
		const osc = new OscillatorNode(this.ctx, { type: 'sawtooth', frequency: FUNDAMENTAL });
		const filter = new BiquadFilterNode(this.ctx, {
			type: 'lowpass',
			frequency: 700,
			Q: 0.7
		});
		const env = new GainNode(this.ctx, { gain: 0 });
		env.gain.setValueAtTime(0, time);
		env.gain.linearRampToValueAtTime(0.5, time + 0.01);
		env.gain.setValueAtTime(0.5, time + Math.max(0.01, durationSec - RELEASE));
		env.gain.exponentialRampToValueAtTime(0.001, time + durationSec);
		osc.connect(filter).connect(env).connect(this.ctx.destination);
		this.scheduleSource(osc, time, durationSec + 0.02);
	}

	stopAll(): void {
		// Calling .stop() on a source node aborts even start times that
		// haven't been reached yet, so this drains both currently-sounding
		// notes AND any future-scheduled ones the Player decided to abandon.
		// That's the whole reason we left spessasynth.
		for (const src of this.active) {
			try {
				src.stop();
			} catch {
				// stop() throws if the node was never started; ignore.
			}
		}
		this.active.clear();
	}

	destroy(): void {
		this.stopAll();
	}

	private tonalBlip(time: number, freq: number, peak: number, decaySec: number): void {
		const osc = new OscillatorNode(this.ctx, { type: 'triangle', frequency: freq });
		const env = new GainNode(this.ctx, { gain: 0 });
		env.gain.setValueAtTime(0, time);
		env.gain.linearRampToValueAtTime(peak, time + 0.002);
		env.gain.exponentialRampToValueAtTime(0.001, time + decaySec);
		osc.connect(env).connect(this.ctx.destination);
		this.scheduleSource(osc, time, decaySec);
	}

	private scheduleSource(src: AudioScheduledSourceNode, time: number, lifetimeSec: number): void {
		this.active.add(src);
		src.onended = () => {
			this.active.delete(src);
		};
		src.start(time);
		src.stop(time + lifetimeSec + 0.02);
	}
}

function createWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer {
	// One second of white noise, mono. Re-used by every snare and hihat
	// hit — each AudioBufferSourceNode is a cheap "view" onto the same
	// buffer, so memory cost is fixed regardless of hit rate.
	const length = ctx.sampleRate;
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
	return buffer;
}
