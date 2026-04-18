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

interface HighlightMark {
	time: number;
	index: number;
}

export class Scheduler {
	private ctx: AudioContext;
	private cfg: SchedulerConfig;
	private events: AudioEvent[] = [];
	private highlights: HighlightMark[] = [];
	private nextEventIdx = 0;
	private timer: number | null = null;
	private rafHandle: number | null = null;
	private lastActive: number | null = null;
	private running = false;

	constructor(config: SchedulerConfig) {
		this.ctx = config.ctx;
		this.cfg = config;
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		const startTime = this.ctx.currentTime + 0.05;
		this.prime(startTime, this.cfg.countInBars);
		this.tick();
		this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
		this.rafHandle = requestAnimationFrame(() => this.highlightFrame());
	}

	stop(): void {
		this.running = false;
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		if (this.rafHandle !== null) {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
		this.lastActive = null;
		this.cfg.onHighlight(null);
	}

	get isRunning(): boolean {
		return this.running;
	}

	private prime(startTime: number, countInBars: number | undefined): void {
		this.events = buildEventList({
			events: this.cfg.events,
			bars: this.cfg.bars,
			bpm: this.cfg.bpm,
			startTime,
			metronome: this.cfg.metronome,
			rhythmAudio: this.cfg.rhythmAudio,
			countInBars
		});
		this.highlights = this.events
			.filter((e): e is Extract<AudioEvent, { type: 'highlight' }> => e.type === 'highlight')
			.map((e) => ({ time: e.time, index: e.rhythmEventIndex }));
		this.nextEventIdx = 0;
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
		this.prime(nextStart, 0);
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
				// Handled by the rAF loop reading ctx.currentTime directly.
				break;
		}
	}

	private highlightFrame(): void {
		if (!this.running) return;
		const now = this.ctx.currentTime;
		let active: number | null = null;
		for (const m of this.highlights) {
			if (m.time <= now) active = m.index;
			else break;
		}
		if (active !== this.lastActive) {
			this.lastActive = active;
			this.cfg.onHighlight(active);
		}
		this.rafHandle = requestAnimationFrame(() => this.highlightFrame());
	}
}
