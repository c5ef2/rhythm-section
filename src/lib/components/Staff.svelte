<script lang="ts">
	import { renderRhythm, setActiveNote } from '$lib/notation/render';
	import type { RhythmEvent } from '$lib/rhythm/types';

	interface Props {
		events: RhythmEvent[];
		bars: number;
		activeIndex: number | null;
	}

	let { events, bars, activeIndex }: Props = $props();

	let host: HTMLDivElement;
	let availableWidth = $state(0);
	let noteElements = $state<SVGElement[]>([]);

	$effect(() => {
		if (!host) return;
		const observer = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width ?? 0;
			if (w > 0) availableWidth = w;
		});
		observer.observe(host);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!host || availableWidth <= 0) return;
		const result = renderRhythm(host, events, bars, availableWidth);
		noteElements = result.noteElements;
	});

	$effect(() => {
		setActiveNote(noteElements, activeIndex);
	});
</script>

<div class="staff" bind:this={host}></div>

<style>
	.staff {
		display: block;
		width: 100%;
		min-width: 0;
	}
	.staff :global(svg) {
		display: block;
		max-width: 100%;
		height: auto;
	}
	.staff :global(.rhythm-note-active) {
		fill: #e36414;
		stroke: #e36414;
	}
</style>
