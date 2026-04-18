import { buildEventList, type AudioEvent, type BuildEventListInput } from './events';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

type HighlightListener = (rhythmEventIndex: number | null) => void;

export interface ClickSink {
	playClick(time: number, emphasis: 'downbeat' | 'onbeat' | 'subbeat'): void;
}

export interface RhythmSink {
	playRhythm(time: number, durationSec: number): void;
}

export interface SchedulerConfig extends Omit<BuildEventListInput, 'startTime'> {
	ctx: AudioContext;
	click: ClickSink;
	rhythm?: RhythmSink;
	onHighlight: HighlightListener;
	loop?: boolean;
	onComplete?: () => void;
}

export class Scheduler {
	private ctx: AudioContext;
	private cfg: SchedulerConfig;
	private events: AudioEvent[] = [];
	private nextEventIdx = 0;
	private timer: number | null = null;
	private running = false;

	constructor(config: SchedulerConfig) {
		this.ctx = config.ctx;
		this.cfg = config;
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		const startTime = this.ctx.currentTime + 0.05;
		this.events = buildEventList({
			events: this.cfg.events,
			bars: this.cfg.bars,
			bpm: this.cfg.bpm,
			startTime,
			metronome: this.cfg.metronome,
			rhythmAudio: this.cfg.rhythmAudio,
			countInBars: this.cfg.countInBars
		});
		this.nextEventIdx = 0;
		this.tick();
		this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
	}

	stop(): void {
		this.running = false;
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		this.cfg.onHighlight(null);
	}

	get isRunning(): boolean {
		return this.running;
	}

	private tick(): void {
		const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_SEC;
		while (this.nextEventIdx < this.events.length) {
			const e = this.events[this.nextEventIdx];
			if (e.time > horizon) break;
			this.dispatch(e);
			this.nextEventIdx++;
		}
		if (this.nextEventIdx >= this.events.length && this.running) {
			const last = this.events[this.events.length - 1];
			if (!last || this.ctx.currentTime >= last.time + 0.2) {
				if (this.cfg.loop) this.restartSeamless();
				else this.finish();
			}
		}
	}

	private finish(): void {
		this.stop();
		this.cfg.onComplete?.();
	}

	private restartSeamless(): void {
		const last = this.events[this.events.length - 1];
		const nextStart = last ? last.time + 0.001 : this.ctx.currentTime + 0.05;
		this.events = buildEventList({
			events: this.cfg.events,
			bars: this.cfg.bars,
			bpm: this.cfg.bpm,
			startTime: nextStart,
			metronome: this.cfg.metronome,
			rhythmAudio: this.cfg.rhythmAudio,
			// Count-in only on the very first playthrough.
			countInBars: 0
		});
		this.nextEventIdx = 0;
	}

	private dispatch(e: AudioEvent): void {
		switch (e.type) {
			case 'metronome':
				this.cfg.click.playClick(e.time, e.emphasis);
				break;
			case 'rhythm':
				this.cfg.rhythm?.playRhythm(e.time, e.durationSec);
				break;
			case 'highlight':
				this.scheduleHighlight(e.time, e.rhythmEventIndex);
				break;
		}
	}

	private scheduleHighlight(time: number, index: number): void {
		const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
		window.setTimeout(() => {
			if (this.running) this.cfg.onHighlight(index);
		}, delay);
	}
}
