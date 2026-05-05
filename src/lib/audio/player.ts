import type {
	HihatSubdivision,
	MetronomeOptions,
	NoteLength,
	RhythmEvent,
	RhythmInstrument
} from '../rhythm/types';
import { configureIosPlayback, primeIosPlayback } from './ios-audio';
import { Scheduler, type Synth } from './scheduler';
import { loadVoiceBuffers, WebAudioSynth } from './web-audio-synth';
import { WakeLock } from './wake-lock';

export interface PlayInputs {
	events: RhythmEvent[];
	bars: number;
	bpm: number;
	metronome: MetronomeOptions;
	rhythmAudio: boolean;
	rhythmInstrument: RhythmInstrument;
	allowedLengths: NoteLength[];
	snareOnBackbeats: boolean;
	hihatSubdivision: HihatSubdivision;
	countInBars: number;
	loop: boolean;
}

export interface PlayerCallbacks {
	onActiveNote(index: number | null): void;
	onStopped(): void;
}

/**
 * Owns the AudioContext, active Synth and the Scheduler. Stateless with
 * respect to user settings: every `run(inputs)` starts fresh, so callers can
 * keep their settings in one place and trigger a restart whenever anything
 * that affects playback has changed.
 *
 * Audio comes from six pre-baked drum / bass samples (`static/samples/`)
 * decoded into AudioBuffers on first Play. Decoding is small (~250 KB
 * total) and quick, but it IS async, so the first Play press waits on
 * one fetch+decode round; subsequent presses are instant.
 */
export class Player {
	private ctx: AudioContext | null = null;
	private synth: Synth | null = null;
	private synthPromise: Promise<Synth> | null = null;
	private scheduler: Scheduler | null = null;
	private wakeLock = new WakeLock();

	constructor(private readonly callbacks: PlayerCallbacks) {}

	private ensureContext(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			configureIosPlayback(this.ctx);
		}
		return this.ctx;
	}

	private getSynth(ctx: AudioContext): Promise<Synth> {
		if (this.synth) return Promise.resolve(this.synth);
		if (!this.synthPromise) {
			this.synthPromise = loadVoiceBuffers(ctx).then((buffers) => {
				const synth = new WebAudioSynth(ctx, buffers);
				this.synth = synth;
				return synth;
			});
		}
		return this.synthPromise;
	}

	async run(inputs: PlayInputs): Promise<void> {
		// Must run synchronously inside the click stack — primeIosPlayback's
		// silent-audio play() is rejected outside a user gesture, so the
		// async work below can't precede it.
		primeIosPlayback();
		const ctx = this.ensureContext();
		if (ctx.state === 'suspended') await ctx.resume();
		const synth = await this.getSynth(ctx);

		// Tear down any previous cycle. `synth.stopAll()` cancels every
		// AudioBufferSourceNode / OscillatorNode whose start time hasn't
		// arrived yet — that's why we left spessasynth, where future
		// noteOn events were uncancellable. The new cycle can therefore
		// begin immediately after the look-ahead preroll without any
		// risk of stale audio bleeding under it.
		this.scheduler?.stop();
		synth.stopAll();
		this.scheduler = new Scheduler({
			ctx,
			synth,
			events: inputs.events,
			bars: inputs.bars,
			bpm: inputs.bpm,
			metronome: inputs.metronome,
			rhythmAudio: inputs.rhythmAudio,
			rhythmInstrument: inputs.rhythmInstrument,
			allowedLengths: inputs.allowedLengths,
			snareOnBackbeats: inputs.snareOnBackbeats,
			hihatSubdivision: inputs.hihatSubdivision,
			countInBars: inputs.countInBars,
			loop: inputs.loop,
			onHighlight: (i) => this.callbacks.onActiveNote(i),
			onComplete: () => {
				this.wakeLock.release();
				this.callbacks.onStopped();
			}
		});
		this.scheduler.start();
		this.wakeLock.acquire();
	}

	stop(): void {
		this.scheduler?.stop();
		this.scheduler = null;
		this.wakeLock.release();
		this.callbacks.onActiveNote(null);
	}
}
