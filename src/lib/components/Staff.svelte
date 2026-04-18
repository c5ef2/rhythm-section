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
	let noteElements: SVGElement[] = [];

	$effect(() => {
		if (!host) return;
		const result = renderRhythm(host, events, bars);
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
		overflow-x: auto;
	}
	.staff :global(.rhythm-note-active) {
		fill: #e36414;
		stroke: #e36414;
	}
</style>
