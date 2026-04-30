<script lang="ts">
	import { untrack } from 'svelte';
	import Staff from '$lib/components/Staff.svelte';
	import GlyphIcon from '$lib/components/GlyphIcon.svelte';
	import NoteIcon from '$lib/components/NoteIcon.svelte';
	import NoteLengthPicker from '$lib/components/NoteLengthPicker.svelte';
	import SegmentedControl from '$lib/components/SegmentedControl.svelte';
	import { appState } from '$lib/state/app-state.svelte';
	import * as actions from '$lib/state/actions.svelte';
	import { environment } from '$lib/state/environment.svelte';
	import { reloadOnNewServiceWorker } from '$lib/service-worker-client';
	import { persist } from '$lib/state/settings.svelte';
	import type { MetronomeDivision, NoteLength } from '$lib/rhythm/types';

	const NOTE_OPTIONS: { value: NoteLength; label: string }[] = [
		{ value: 'quarter', label: 'quarter note' },
		{ value: 'eighth', label: 'eighth note' },
		{ value: 'sixteenth', label: 'sixteenth note' },
		{ value: 'eighth-triplet', label: 'eighth triplet' },
		{ value: 'dotted-eighth', label: 'dotted eighth' }
	];

	const DIVISIONS: { value: MetronomeDivision; length: NoteLength; label: string }[] = [
		{ value: 'half', length: 'half', label: 'half' },
		{ value: 'quarter', length: 'quarter', label: 'quarter' },
		{ value: 'eighth', length: 'eighth', label: 'eighth' },
		{ value: 'triplet', length: 'eighth-triplet', label: 'triplet' },
		{ value: 'sixteenth', length: 'sixteenth', label: 'sixteenth' }
	];

	const rhythmMode = $derived(
		appState.settings.rhythmAudio ? appState.settings.rhythmInstrument : 'off'
	);

	// Reload once a newer service worker has taken over, so users on a
	// flaky connection always land on the latest build when they come back.
	$effect(() => {
		reloadOnNewServiceWorker();
	});

	// Start fetching the bundled SoundFont the moment the app mounts, so the
	// synth is ready and Play responds instantly instead of going through a
	// load on first press.
	$effect(() => {
		actions.preloadAudio();
	});

	// `idle` means "preload was skipped (PWA mode) and the user hasn't clicked
	// Play yet" — the click handler will lazy-load the SoundFont. So idle is
	// NOT a loading state from the user's POV; only `loading` is.
	const playLoading = $derived(appState.soundFontStatus === 'loading');
	const playError = $derived(appState.soundFontStatus === 'error');
	const playDisabled = $derived(playLoading || playError);
	// In a regular browser tab the user can always copy the URL from the
	// address bar (we live-sync it), so the Share button only earns its
	// keep when there's a native share dialog to open. In a PWA install
	// there is no URL bar at all — keep the button so the user has any
	// way to send the rhythm out (it falls back to clipboard copy when
	// navigator.share isn't supported).
	const showShareButton = $derived(environment.hasShareApi || environment.isStandalone);

	// Keep settings snapshot in localStorage whenever they change.
	$effect(() => {
		persist($state.snapshot(appState.settings));
	});

	// Mirror the current settings into the URL hash so the address bar always
	// matches what the user is hearing — copy-paste a URL at any time and
	// the recipient gets the exact same exercise. $state.snapshot deep-reads
	// every nested setting so this effect re-runs on any change.
	$effect(() => {
		$state.snapshot(appState.settings);
		untrack(actions.updateUrlFromState);
	});

	// Snap any out-of-notch BPM (e.g. from an older share URL) to the Maelzel scale.
	$effect(() => {
		void appState.settings.bpm;
		untrack(actions.normaliseBpm);
	});

	// Any change to playback-affecting state restarts the player while running.
	$effect(() => {
		const s = appState.settings;
		void s.bpm;
		void s.bars;
		void s.metronome.enabled;
		void s.metronome.division;
		void s.metronome.emphasizeFirstBeat;
		void s.metronome.countedBeats;
		void s.countIn;
		void s.rhythmAudio;
		void s.rhythmInstrument;
		void s.snareOnBackbeats;
		void s.hihatSubdivision;
		void appState.rhythm.events;
		untrack(() => {
			actions.restartIfPlaying();
		});
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.code !== 'Space') return;
		const target = e.target as HTMLElement | null;
		if (target && /^(input|textarea|button)$/i.test(target.tagName)) return;
		e.preventDefault();
		actions.togglePlay();
	}

</script>

{#snippet hihatEighthIcon()}<NoteIcon length="eighth" size={18} />{/snippet}
{#snippet hihatSixteenthIcon()}<NoteIcon length="sixteenth" size={18} />{/snippet}
{#snippet hihatTripletIcon()}<NoteIcon length="eighth-triplet" size={18} />{/snippet}

<svelte:head>
	<title>Rhythm Section</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main>
	<header>
		<div class="title-row">
			<div class="title-block">
				<h1>Rhythm Section</h1>
				<p class="subtitle">
					Practice reading rhythms with a generated exercise and a metronome.
				</p>
			</div>
			{#if showShareButton}
				<button
					type="button"
					class="share-btn"
					onclick={actions.shareCurrent}
					aria-label="Share"
					title="Share"
				>
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="18" cy="5" r="3" />
						<circle cx="6" cy="12" r="3" />
						<circle cx="18" cy="19" r="3" />
						<line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
						<line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
					</svg>
				</button>
			{/if}
		</div>
	</header>

	<section class="card transport">
		<div class="transport-top">
			<button
				class="primary play"
				type="button"
				onclick={actions.togglePlay}
				disabled={playDisabled}
				aria-busy={playLoading}
				title={playError ? 'Audio unavailable — connect to the network and reload' : undefined}
			>
				{#if playError}
					<span>Audio unavailable</span>
				{:else if playLoading}
					<span class="spinner" aria-hidden="true"></span>
					<span>Loading…</span>
				{:else if appState.isPlaying}
					<svg
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="currentColor"
						aria-hidden="true"
					>
						<rect x="6" y="6" width="12" height="12" rx="1.5" />
					</svg>
					<span>Stop</span>
				{:else}
					<svg
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M7 4.5v15l13-7.5z" />
					</svg>
					<span>Play</span>
				{/if}
			</button>
			<button type="button" class="secondary regenerate" onclick={actions.regenerate}>
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
					<path d="M21 3v5h-5" />
					<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
					<path d="M3 21v-5h5" />
				</svg>
				<span>Regenerate</span>
			</button>
		</div>
		<div class="transport-bottom">
			<div class="bpm-stepper" role="group" aria-label="BPM">
				<span class="group-label">BPM</span>
				<button type="button" aria-label="Slower" onclick={() => actions.stepBpm(-1)}>−</button>
				<output>{appState.settings.bpm}</output>
				<button type="button" aria-label="Faster" onclick={() => actions.stepBpm(1)}>+</button>
			</div>
			<div class="group bars-group">
				<span class="group-label">Bars</span>
				<button
					type="button"
					aria-pressed={appState.settings.bars === 1}
					onclick={() => actions.setBars(1)}
				>
					1
				</button>
				<button
					type="button"
					aria-pressed={appState.settings.bars === 2}
					onclick={() => actions.setBars(2)}
				>
					2
				</button>
			</div>
		</div>
	</section>

	<section class="card staff-card">
		<Staff
			events={appState.rhythm.events}
			bars={appState.settings.bars}
			activeIndex={appState.activeIndex}
		/>
	</section>

	<section class="card settings">
		<div class="settings-row">
			<span class="group-label">Allowed in rhythm</span>
			<div class="picker-row">
				<NoteLengthPicker
					value={appState.settings.allowedLengths}
					options={NOTE_OPTIONS}
					onChange={actions.setAllowedLengths}
				/>
				<button
					type="button"
					class="icon-btn"
					aria-pressed={appState.settings.allowRests}
					aria-label="Include rests"
					title="Include rests"
					onclick={actions.toggleAllowRests}
				>
					<GlyphIcon glyph="rest" size={22} />
				</button>
				<button
					type="button"
					class="icon-btn"
					aria-pressed={appState.settings.allowTies}
					aria-label="Include ties"
					title="Include ties"
					onclick={actions.toggleAllowTies}
				>
					<GlyphIcon glyph="tie" size={22} />
				</button>
			</div>
		</div>
		<SegmentedControl
			label="Rhythm"
			value={rhythmMode}
			options={[
				{ value: 'off', label: 'Off' },
				{ value: 'drum', label: 'Drum' },
				{ value: 'bass', label: 'Bass' }
			]}
			onChange={actions.setRhythmMode}
		/>
		<SegmentedControl
			label="Snare"
			value={appState.settings.snareOnBackbeats}
			options={[
				{ value: false, label: 'Off' },
				{ value: true, label: 'On' }
			]}
			onChange={actions.setSnareOnBackbeats}
		/>
		<SegmentedControl
			label="Hihat"
			value={appState.settings.hihatSubdivision}
			options={[
				{ value: 'off', label: 'Off' },
				{ value: 'eighth', label: 'eighth note', icon: hihatEighthIcon },
				{ value: 'sixteenth', label: 'sixteenth note', icon: hihatSixteenthIcon },
				{ value: 'triplet', label: 'eighth triplet', icon: hihatTripletIcon }
			]}
			onChange={actions.setHihatSubdivision}
		/>
	</section>

	<section class="card settings">
		<div class="settings-row">
			<label>
				<input
					type="checkbox"
					checked={appState.settings.metronome.enabled}
					onchange={actions.toggleMetronome}
				/>
				Metronome
			</label>
			<label>
				<input
					type="checkbox"
					checked={appState.settings.metronome.emphasizeFirstBeat}
					onchange={actions.toggleEmphasizeFirstBeat}
				/>
				Emphasize first beat
			</label>
			<label>
				<input
					type="checkbox"
					checked={appState.settings.countIn}
					onchange={actions.toggleCountIn}
				/>
				Count-in
			</label>
		</div>
		<div class="settings-row">
			<span class="group-label">Count beats</span>
			<div class="beat-picker">
				{#each [0, 1, 2, 3] as beatIndex (beatIndex)}
					<button
						type="button"
						class="beat-btn"
						aria-pressed={appState.settings.metronome.countedBeats[beatIndex]}
						onclick={() => actions.toggleCountedBeat(beatIndex as 0 | 1 | 2 | 3)}
						aria-label={`Count beat ${beatIndex + 1}`}
						title={`Count beat ${beatIndex + 1}`}
					>
						<NoteIcon length="quarter" size={22} />
					</button>
				{/each}
			</div>
		</div>
		<div class="settings-row">
			<span class="group-label">Division</span>
			<div class="group">
				{#each DIVISIONS as d (d.value)}
					<button
						type="button"
						class="icon-btn"
						aria-pressed={appState.settings.metronome.division === d.value}
						onclick={() => actions.setMetronomeDivision(d.value)}
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
		max-width: 920px;
		margin: 1.5rem auto 4rem;
		padding: 0 var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
		display: grid;
		gap: var(--space-4);
	}
	@supports (padding: max(0px)) {
		main {
			padding-left: max(var(--space-4), env(safe-area-inset-left));
			padding-right: max(var(--space-4), env(safe-area-inset-right));
		}
	}

	header {
		padding: var(--space-3) 0 var(--space-1);
	}
	header h1 {
		margin: 0 0 0.15rem;
		font-size: 1.6rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.subtitle {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
	.title-block {
		flex: 1 1 auto;
		min-width: 0;
	}
	.share-btn {
		width: 2.5rem;
		height: 2.5rem;
		min-height: 0;
		padding: 0;
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-pill);
	}

	.card {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-4) var(--space-5);
		box-shadow: var(--shadow-md);
		min-width: 0;
	}

	.transport {
		display: grid;
		gap: var(--space-3);
	}
	.transport-top,
	.transport-bottom {
		/* Even 1:1 split — Play / Regenerate up top, BPM / Bars below.
		   The 2:1 split was tighter on the right column and the Bars
		   label + buttons were overflowing on phones. */
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-2);
		align-items: stretch;
	}
	.play,
	.regenerate {
		min-height: 3rem;
		font-size: 1rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	.spinner {
		display: inline-block;
		width: 1.05rem;
		height: 1.05rem;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spinner-rot 0.7s linear infinite;
	}
	@keyframes spinner-rot {
		to {
			transform: rotate(360deg);
		}
	}
	.secondary {
		background: var(--panel-2);
	}
	.secondary:hover {
		background: var(--panel-hover);
	}

	.bpm-stepper {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.15rem 0.4rem;
		flex: 1 1 auto;
		box-shadow: var(--shadow-sm);
	}
	.bpm-stepper button {
		background: transparent;
		border: none;
		padding: 0.3rem 0.8rem;
		font-weight: 600;
		font-size: 1rem;
		min-height: 2.25rem;
		flex: 0 0 auto;
		box-shadow: none;
	}
	.bpm-stepper button:hover {
		background: var(--panel-hover);
	}
	.bpm-stepper output {
		min-width: 3rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: 1.1rem;
		flex: 1 1 auto;
	}

	.group {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0.2rem;
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-sm);
	}
	.group button {
		background: transparent;
		border: 1px solid transparent;
		color: var(--text);
		padding: 0.3rem 0.8rem;
		min-height: 2.1rem;
		box-shadow: none;
	}
	.group button:hover {
		background: var(--panel-hover);
	}
	.group button[aria-pressed='true'] {
		background: linear-gradient(180deg, var(--brand) 0%, var(--brand-2) 100%);
		color: var(--on-brand);
		border-color: transparent;
		box-shadow: 0 2px 10px -4px color-mix(in oklab, var(--brand) 50%, transparent);
	}
	.bars-group {
		display: flex;
		justify-content: space-between;
		gap: 0.35rem;
		padding-left: 0.6rem;
		padding-right: 0.4rem;
	}
	.bars-group .group-label {
		margin-right: 0.25rem;
	}
	.bars-group button {
		min-width: 2.4rem;
		flex: 1 1 0;
	}
	.group-label {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.staff-card {
		padding: var(--space-5);
		background: var(--staff-bg);
		border-color: var(--staff-border);
		color: var(--staff-ink);
		overflow-x: auto;
	}

	.settings {
		display: grid;
		gap: var(--space-3);
	}
	.settings-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text);
	}

	.icon-btn {
		width: 2.25rem;
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		min-height: 0;
	}

	.picker-row {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.beat-picker {
		display: inline-flex;
		gap: 0.4rem;
	}
	.beat-btn {
		width: 2.75rem;
		height: 2.75rem;
		min-height: 0;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
	}

	@media (max-width: 640px) {
		header {
			padding: var(--space-2) 0 0;
		}
		header h1 {
			font-size: 1.35rem;
		}
		.subtitle {
			font-size: 0.9rem;
		}
		.card {
			padding: var(--space-3) var(--space-4);
		}
		.icon-btn {
			width: 2.5rem;
			height: 2.5rem;
		}
		.beat-btn {
			width: 3rem;
			height: 3rem;
		}
		:global(.rhythm-note-active) {
			stroke-width: 1.5px;
		}
	}
</style>
