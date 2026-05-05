import { base } from '$app/paths';
import type { Synth } from './scheduler';

/**
 * Sample-based synth. Six pre-rendered drum / bass voices are fetched and
 * decoded once at startup; every hit then becomes a fresh
 * `AudioBufferSourceNode` pointing at the right buffer, gated by a
 * `GainNode`.
 *
 * Why not spessasynth: every `noteOn(time)` it accepted was queued inside
 * an opaque worklet that we couldn't cancel. With AudioBufferSourceNode and
 * OscillatorNode we hold the references ourselves, and `stopAll()`
 * actually aborts every event we've scheduled into the future.
 *
 * Why not synthesized voices: oscillator-only kicks / snares / hats sound
 * thin compared to even a plain GM SoundFont. The samples below were
 * baked once from the bundled SF2 (`scripts/render-samples.mjs`) so we
 * keep that quality without shipping the SF2 + spessasynth at runtime.
 */

type Voice = 'kick' | 'snare' | 'hihat' | 'woodblock' | 'claves' | 'bass';

const VOICE_FILES: Record<Voice, string> = {
	kick: 'samples/kick.wav',
	snare: 'samples/snare.wav',
	hihat: 'samples/hihat.wav',
	woodblock: 'samples/woodblock.wav',
	claves: 'samples/claves.wav',
	bass: 'samples/bass.wav'
};

/**
 * Per-voice gain trim. `audioToWav({ normalizeAudio: true })` peak-
 * normalises every sample to 0 dBFS, so without trims the kit would be
 * uniformly loud — these match the original spessasynth velocities the
 * old synth used (115/105/75 etc.) so the mix balance stays close to
 * what we had.
 */
const VOICE_GAIN: Record<Voice, number> = {
	kick: 0.9,
	snare: 0.85,
	hihat: 0.5,
	woodblock: 0.55,
	claves: 0.7,
	bass: 0.65
};

export async function loadVoiceBuffers(ctx: AudioContext): Promise<Record<Voice, AudioBuffer>> {
	const entries = await Promise.all(
		(Object.keys(VOICE_FILES) as Voice[]).map(async (name) => {
			const url = `${base}/${VOICE_FILES[name]}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
			const data = await res.arrayBuffer();
			const buffer = await ctx.decodeAudioData(data);
			return [name, buffer] as const;
		})
	);
	return Object.fromEntries(entries) as Record<Voice, AudioBuffer>;
}

export class WebAudioSynth implements Synth {
	private active = new Set<AudioBufferSourceNode>();
	private keepAlive: AudioScheduledSourceNode | null = null;

	constructor(
		private readonly ctx: AudioContext,
		private readonly buffers: Record<Voice, AudioBuffer>
	) {
		this.startKeepAlive();
	}

	/**
	 * Bluetooth audio devices power-save their codec between packets:
	 * when the audio stream falls below the codec's silence threshold
	 * for more than a few tens of milliseconds the receiver buffers /
	 * sleeps, and the next event gets clipped or dropped during wake-up.
	 * We never let the stream go silent.
	 *
	 * The signal has to satisfy three constraints:
	 *
	 * 1. **Pass the codec's DC blocker.** SBC / AAC / aptX run a high-
	 *    pass filter (~10–20 Hz cut-off) on the line-in, so a pure DC
	 *    offset gets stripped to zero before the codec ever sees it.
	 *    Use a sine above the cut-off — 30 Hz is comfortably past it.
	 * 2. **Stay above the codec's silence threshold.** Empirically that
	 *    sits around -55 to -65 dB; below that, longer rests and
	 *    bar-line gaps still let the codec sleep.
	 * 3. **Stay below human-audible** on the typical playback chain:
	 *    phone speakers, earbuds, and (the hard one) over-ear headphones
	 *    that reproduce sub-bass cleanly down to 20 Hz.
	 *
	 * 30 Hz at -65 dB is the current compromise. Phone speakers can't
	 * reproduce 30 Hz at all; earbuds barely; only properly-tuned over-
	 * ear headphones reproduce it audibly, and at -65 dB even those play
	 * it just below most rooms' noise floor. If a user reports BT
	 * dropouts again, push the gain up before changing the frequency —
	 * the silence threshold matters more than the absolute level.
	 */
	private startKeepAlive(): void {
		const KEEPALIVE_FREQ_HZ = 30;
		const KEEPALIVE_GAIN = 0.00056; // ≈ -65 dB
		const osc = new OscillatorNode(this.ctx, {
			type: 'sine',
			frequency: KEEPALIVE_FREQ_HZ
		});
		const gain = new GainNode(this.ctx, { gain: KEEPALIVE_GAIN });
		osc.connect(gain).connect(this.ctx.destination);
		osc.start();
		this.keepAlive = osc;
	}

	playClick(time: number, emphasis: 'downbeat' | 'onbeat' | 'subbeat'): void {
		// Downbeat = claves (sharper, brighter). On / sub-beats = woodblock,
		// with sub-beats quieter so they don't fight the rhythm voices.
		const voice: Voice = emphasis === 'downbeat' ? 'claves' : 'woodblock';
		const gain =
			emphasis === 'downbeat' ? 1.0 : emphasis === 'onbeat' ? 0.85 : 0.55;
		this.fire(voice, time, gain);
	}

	playKick(time: number): void {
		this.fire('kick', time, 1.0);
	}

	playSnare(time: number): void {
		this.fire('snare', time, 1.0);
	}

	playHihat(time: number): void {
		this.fire('hihat', time, 1.0);
	}

	playBass(time: number, durationSec: number): void {
		// The baked bass sample is ~1.5 s. Hold it via the buffer's natural
		// playback up to durationSec, then ramp the gain down over a small
		// release window so the cutoff isn't a click. For notes longer than
		// the buffer, AudioBufferSourceNode would simply end early — but at
		// 40 BPM a whole note is 6 s, which would need looping. The SF2
		// sample encodes a sustaining pluck; setting `loop = true` on a
		// segment of it would risk a comb-filter buzz. Keep it unlooped
		// for now and accept that very long bass notes will end with the
		// buffer; this matches what spessasynth did effectively (the SF2
		// sample loop point had the same release character).
		const buffer = this.buffers.bass;
		const src = new AudioBufferSourceNode(this.ctx, { buffer });
		const env = new GainNode(this.ctx, { gain: 0 });
		const peak = VOICE_GAIN.bass;
		const RELEASE = Math.min(0.08, durationSec * 0.5);
		const stopAt = time + Math.min(durationSec, buffer.duration);
		env.gain.setValueAtTime(peak, time);
		env.gain.setValueAtTime(peak, Math.max(time, stopAt - RELEASE));
		env.gain.exponentialRampToValueAtTime(0.001, stopAt);
		src.connect(env).connect(this.ctx.destination);
		this.track(src);
		src.start(time);
		src.stop(stopAt + 0.02);
	}

	stopAll(): void {
		// Calling .stop() on a source node aborts even start times that
		// haven't been reached yet, so this drains both currently-sounding
		// notes AND any future-scheduled ones the Player decided to abandon.
		for (const src of this.active) {
			try {
				src.stop();
			} catch {
				// Already stopped or not yet started — fine.
			}
		}
		this.active.clear();
	}

	destroy(): void {
		this.stopAll();
		try {
			this.keepAlive?.stop();
		} catch {
			// already stopped — fine
		}
		this.keepAlive = null;
	}

	private fire(voice: Voice, time: number, gainFactor: number): void {
		const buffer = this.buffers[voice];
		const src = new AudioBufferSourceNode(this.ctx, { buffer });
		const gain = new GainNode(this.ctx, { gain: VOICE_GAIN[voice] * gainFactor });
		src.connect(gain).connect(this.ctx.destination);
		this.track(src);
		src.start(time);
		src.stop(time + buffer.duration + 0.02);
	}

	private track(src: AudioBufferSourceNode): void {
		this.active.add(src);
		src.onended = () => {
			this.active.delete(src);
		};
	}
}
