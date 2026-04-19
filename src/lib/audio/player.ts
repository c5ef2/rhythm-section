import type { MetronomeOptions, RhythmEvent } from '../rhythm/types';
import { configureIosPlayback } from './ios-audio';
import { Scheduler } from './scheduler';
import { createSoundFontSynth } from './soundfont-synth';
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
		return { ctx: this.ctx, synth: this.synth };
	}

	async loadSoundFont(buffer: ArrayBuffer, instrument: RhythmInstrument): Promise<void> {
		const { ctx } = await this.ensureAudio();
		const next = await createSoundFontSynth({ ctx, soundFontBuffer: buffer });
		next.setInstrument(instrument);
		this.synth?.destroy();
		this.synth = next;
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
