<script lang="ts">
	import Staff from '$lib/components/Staff.svelte';
	import NoteIcon from '$lib/components/NoteIcon.svelte';
	import NoteLengthPicker from '$lib/components/NoteLengthPicker.svelte';
	import { generateRhythm } from '$lib/rhythm/generator';
	import { persist, readInitialSettings } from '$lib/state/settings.svelte';
	import { randomSeed } from '$lib/rng/seeded';
	import { untrack } from 'svelte';
	import { Scheduler } from '$lib/audio/scheduler';
	import { oscillatorSynth, type Synth } from '$lib/audio/synth';
	import { createSoundFontSynth } from '$lib/audio/soundfont-synth';
	import { encodeShare, type RhythmInstrument } from '$lib/state/share';
	import type { NoteLength, MetronomeDivision } from '$lib/rhythm/types';
	import { browser } from '$app/environment';

	const NOTE_OPTIONS: { value: NoteLength; label: string }[] = [
		{ value: 'whole', label: 'whole note' },
		{ value: 'half', label: 'half note' },
		{ value: 'quarter', label: 'quarter note' },
		{ value: 'eighth', label: 'eighth note' },
		{ value: 'sixteenth', label: 'sixteenth note' },
		{ value: 'eighth-triplet', label: 'eighth triplet' },
		{ value: 'dotted-half', label: 'dotted half' },
		{ value: 'dotted-quarter', label: 'dotted quarter' },
		{ value: 'dotted-eighth', label: 'dotted eighth' }
	];

	const DIVISIONS: { value: MetronomeDivision; length: NoteLength; label: string }[] = [
		{ value: 'half', length: 'half', label: 'half' },
		{ value: 'quarter', length: 'quarter', label: 'quarter' },
		{ value: 'eighth', length: 'eighth', label: 'eighth' },
		{ value: 'triplet', length: 'eighth-triplet', label: 'triplet' },
		{ value: 'sixteenth', length: 'sixteenth', label: 'sixteenth' }
	];

	let settings = $state(readInitialSettings());
	let activeIndex = $state<number | null>(null);
	let scheduler: Scheduler | null = null;
	let audioCtx: AudioContext | null = null;
	let synth: Synth | null = null;
	let rhythmAudio = $state(false);
	let isPlaying = $state(false);
	let loop = $state(true);
	let soundFontStatus = $state<'none' | 'loading' | 'loaded' | 'error'>('none');
	let soundFontName = $state<string>('');

	const rhythm = $derived(
		generateRhythm({
			bars: settings.bars,
			allowedLengths: settings.allowedLengths,
			allowRests: settings.allowRests,
			allowTies: settings.allowTies,
			seed: settings.seed
		})
	);

	$effect(() => {
		persist($state.snapshot(settings));
	});

	// Restart the scheduler whenever any playback-affecting setting changes,
	// so the user hears edits take effect without manually pressing play.
	$effect(() => {
		// Touch every dependency so this effect re-runs on change.
		void settings.bpm;
		void settings.bars;
		void settings.metronome.enabled;
		void settings.metronome.division;
		void settings.metronome.emphasizeFirstBeat;
		void settings.countIn;
		void rhythm.events;
		void rhythmAudio;
		void loop;
		untrack(() => {
			if (!isPlaying) return;
			scheduler?.stop();
			scheduler = null;
			isPlaying = false;
			start();
		});
	});

	function regenerate() {
		settings.seed = randomSeed();
	}

	function togglePlay() {
		if (isPlaying) stop();
		else start();
	}

	function start() {
		if (!browser) return;
		audioCtx ??= new AudioContext();
		if (audioCtx.state === 'suspended') audioCtx.resume();
		synth ??= oscillatorSynth(audioCtx);
		synth.setInstrument(settings.rhythmInstrument);
		scheduler?.stop();
		scheduler = new Scheduler({
			ctx: audioCtx,
			click: synth,
			rhythm: synth,
			bars: settings.bars,
			bpm: settings.bpm,
			events: rhythm.events,
			metronome: settings.metronome,
			rhythmAudio,
			countInBars: settings.countIn ? 1 : 0,
			loop,
			onHighlight: (i) => (activeIndex = i),
			onComplete: () => {
				isPlaying = false;
				activeIndex = null;
			}
		});
		scheduler.start();
		isPlaying = true;
	}

	function setInstrument(inst: RhythmInstrument) {
		settings.rhythmInstrument = inst;
		synth?.setInstrument(inst);
	}

	async function loadSoundFont(file: File) {
		if (!browser) return;
		soundFontStatus = 'loading';
		soundFontName = file.name;
		try {
			audioCtx ??= new AudioContext();
			const buf = await file.arrayBuffer();
			const next = await createSoundFontSynth({ ctx: audioCtx, soundFontBuffer: buf });
			next.setInstrument(settings.rhythmInstrument);
			synth?.destroy();
			synth = next;
			soundFontStatus = 'loaded';
		} catch (err) {
			console.error(err);
			soundFontStatus = 'error';
		}
	}

	function onSoundFontFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) loadSoundFont(file);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.code !== 'Space') return;
		const target = e.target as HTMLElement | null;
		if (target && /^(input|textarea|button)$/i.test(target.tagName)) return;
		e.preventDefault();
		togglePlay();
	}

	function stop() {
		scheduler?.stop();
		scheduler = null;
		isPlaying = false;
		activeIndex = null;
	}

	async function copyShareLink() {
		if (!browser) return;
		const url = new URL(window.location.href);
		url.hash = 's=' + encodeShare($state.snapshot(settings));
		await navigator.clipboard.writeText(url.toString());
	}

	function setDivision(d: MetronomeDivision) {
		settings.metronome = { ...settings.metronome, division: d };
	}

	function setBars(b: 1 | 2) {
		settings.bars = b;
	}
</script>

<svelte:head>
	<title>Rhythm Section</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main>
	<header>
		<h1>Rhythm Section</h1>
		<p class="subtitle">Practice reading rhythms with a generated exercise and a metronome.</p>
	</header>

	<section class="card transport">
		<button class="primary play" type="button" onclick={togglePlay}>
			{isPlaying ? '⏸ Pause' : '▶ Play'}
		</button>
		<button type="button" onclick={regenerate}>↻ Regenerate</button>
		<button type="button" aria-pressed={loop} onclick={() => (loop = !loop)} title="Loop playback">
			⟳ Loop
		</button>
		<label>
			BPM
			<input type="number" min="30" max="300" step="1" bind:value={settings.bpm} />
		</label>
		<div class="group">
			<span class="group-label">Bars</span>
			<button type="button" aria-pressed={settings.bars === 1} onclick={() => setBars(1)}>1</button>
			<button type="button" aria-pressed={settings.bars === 2} onclick={() => setBars(2)}>2</button>
		</div>
		<button type="button" class="share" onclick={copyShareLink}>⎘ Copy link</button>
	</section>

	<section class="card staff-card">
		<Staff events={rhythm.events} bars={settings.bars} {activeIndex} />
	</section>

	<section class="card settings">
		<div class="settings-row">
			<span class="group-label">Allowed note lengths</span>
			<NoteLengthPicker
				value={settings.allowedLengths}
				options={NOTE_OPTIONS}
				onChange={(next) => (settings.allowedLengths = next)}
			/>
		</div>
		<div class="settings-row">
			<label>
				<input type="checkbox" bind:checked={settings.allowRests} />
				Include rests
			</label>
			<label>
				<input type="checkbox" bind:checked={settings.allowTies} />
				Include ties
			</label>
			<label>
				<input type="checkbox" bind:checked={settings.countIn} />
				Count-in
			</label>
		</div>
		<div class="settings-row">
			<label>
				<input type="checkbox" bind:checked={rhythmAudio} />
				Play rhythm audio
			</label>
			<span class="group-label">Instrument</span>
			<div class="group">
				<button
					type="button"
					aria-pressed={settings.rhythmInstrument === 'drum'}
					onclick={() => setInstrument('drum')}>Drum</button
				>
				<button
					type="button"
					aria-pressed={settings.rhythmInstrument === 'bass'}
					onclick={() => setInstrument('bass')}>Bass</button
				>
			</div>
		</div>
		<div class="settings-row">
			<span class="group-label">SoundFont</span>
			<label class="file-button">
				<input
					type="file"
					accept=".sf2,.sf3,.dls"
					onchange={onSoundFontFile}
				/>
				<span>Load .sf2 / .sf3</span>
			</label>
			{#if soundFontStatus === 'loading'}
				<span class="status">Loading {soundFontName}…</span>
			{:else if soundFontStatus === 'loaded'}
				<span class="status ok">✓ {soundFontName}</span>
			{:else if soundFontStatus === 'error'}
				<span class="status err">Failed to load</span>
			{:else}
				<span class="status muted">Using synthesised fallback</span>
			{/if}
		</div>
	</section>

	<section class="card settings">
		<div class="settings-row">
			<label>
				<input type="checkbox" bind:checked={settings.metronome.enabled} />
				Metronome
			</label>
			<label>
				<input type="checkbox" bind:checked={settings.metronome.emphasizeFirstBeat} />
				Emphasize first beat
			</label>
		</div>
		<div class="settings-row">
			<span class="group-label">Division</span>
			<div class="group">
				{#each DIVISIONS as d (d.value)}
					<button
						type="button"
						class="icon-btn"
						aria-pressed={settings.metronome.division === d.value}
						onclick={() => setDivision(d.value)}
						aria-label={d.label}
						title={d.label}
					>
						<NoteIcon length={d.length} size={18} />
					</button>
				{/each}
			</div>
		</div>
	</section>
</main>

<style>
	main {
		max-width: 960px;
		margin: 2rem auto 4rem;
		padding: 0 1.25rem;
		display: grid;
		gap: 1rem;
	}
	header h1 {
		margin: 0 0 0.25rem;
		letter-spacing: 0.01em;
	}
	.subtitle {
		margin: 0;
		color: var(--muted);
	}
	.card {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.1rem;
		box-shadow: var(--shadow);
	}
	.transport {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.transport .play {
		min-width: 6.5rem;
	}
	.share {
		margin-left: auto;
	}
	.group {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.15rem;
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.group button {
		background: transparent;
		border: 1px solid transparent;
		padding: 0.35rem 0.65rem;
	}
	.group-label {
		color: var(--muted);
		font-size: 0.85rem;
		margin-right: 0.25rem;
	}
	.staff-card {
		padding: 1rem;
		background: #ffffff;
		border-color: #e2e2e2;
	}
	.settings {
		display: grid;
		gap: 0.75rem;
	}
	.settings-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.icon-btn {
		width: 2.25rem;
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	.file-button {
		display: inline-flex;
		align-items: center;
	}
	.file-button input[type='file'] {
		display: none;
	}
	.file-button span {
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.8rem;
		cursor: pointer;
	}
	.file-button:hover span {
		background: #262e4d;
	}
	.status {
		font-size: 0.85rem;
		color: var(--text);
	}
	.status.muted {
		color: var(--muted);
	}
	.status.ok {
		color: #6dd3a3;
	}
	.status.err {
		color: var(--danger);
	}
</style>
