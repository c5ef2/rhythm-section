import type { MetronomeOptions, RhythmEvent } from '../rhythm/types';
import { configureIosPlayback } from './ios-audio';
import { Scheduler } from './scheduler';
import { createSoundFontSynth, fetchBundledSoundFont } from './soundfont-synth';
import { oscillatorSynth, type RhythmInstrument, type Synth } from './synth';
import { WakeLock } from './wake-lock';

export interface PlayInputs {
	events: RhythmEvent[];
	bars: number;
	bpm: number;
	metronome: MetronomeOptions;
	rhythmAudio: boolean;
	rhythmInstrument: RhythmInstrument;
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
 */
export class Player {
	private ctx: AudioContext | null = null;
	private synth: Synth | null = null;
	private soundFontPromise: Promise<Synth> | null = null;
	private scheduler: Scheduler | null = null;
	private wakeLock = new WakeLock();

	constructor(private readonly callbacks: PlayerCallbacks) {}

	private async ensureAudio(): Promise<{ ctx: AudioContext; synth: Synth }> {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			configureIosPlayback(this.ctx);
		}
		if (this.ctx.state === 'suspended') await this.ctx.resume();
		if (!this.synth) this.synth = oscillatorSynth(this.ctx);
		this.kickOffSoundFontLoad(this.ctx);
		return { ctx: this.ctx, synth: this.synth };
	}

	/**
	 * Fetch and initialise the bundled SoundFont in the background on the
	 * first user interaction. The oscillator synth keeps things audible for
	 * the ~1 second it takes to load; we swap to SoundFont samples as soon
	 * as they're ready. The next scheduler restart (the effect in +page.svelte
	 * fires one on every setting change) picks up the new synth automatically.
	 * On fetch/init failure (offline first run before the service worker has
	 * cached it) we stay on the oscillator synth.
	 */
	private kickOffSoundFontLoad(ctx: AudioContext): void {
		if (this.soundFontPromise) return;
		this.soundFontPromise = (async () => {
			const buffer = await fetchBundledSoundFont();
			const synth = await createSoundFontSynth({ ctx, soundFontBuffer: buffer });
			this.synth?.destroy();
			this.synth = synth;
			return synth;
		})().catch((err) => {
			console.warn('Bundled SoundFont unavailable, staying on oscillator fallback', err);
			this.soundFontPromise = null; // allow retry on next ensureAudio
			throw err;
		});
	}

	async run(inputs: PlayInputs): Promise<void> {
		const { ctx, synth } = await this.ensureAudio();
		synth.setInstrument(inputs.rhythmInstrument);
		this.scheduler?.stop();
		this.scheduler = new Scheduler({
			ctx,
			click: synth,
			rhythm: synth,
			events: inputs.events,
			bars: inputs.bars,
			bpm: inputs.bpm,
			metronome: inputs.metronome,
			rhythmAudio: inputs.rhythmAudio,
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
