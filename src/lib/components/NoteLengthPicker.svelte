<script lang="ts">
	import type { NoteLength } from '$lib/rhythm/types';
	import NoteIcon from './NoteIcon.svelte';

	interface Option {
		value: NoteLength;
		label: string;
	}

	interface Props {
		value: NoteLength[];
		options: Option[];
		onChange: (next: NoteLength[]) => void;
	}

	let { value, options, onChange }: Props = $props();

	function toggle(length: NoteLength) {
		const set = new Set(value);
		if (set.has(length)) set.delete(length);
		else set.add(length);
		onChange([...set]);
	}
</script>

<!--
	Buttons are emitted via a fragment, not wrapped in a flex container.
	The page-level .picker-row is the flex container, so additional sibling
	buttons (rest, tie) wrap together with the note-length buttons instead
	of being pushed to a new row as a single unit.
-->
{#each options as o (o.value)}
	<button
		type="button"
		class="icon-btn"
		aria-pressed={value.includes(o.value)}
		title={o.label}
		aria-label={o.label}
		onclick={() => toggle(o.value)}
	>
		<NoteIcon length={o.value} />
	</button>
{/each}

<style>
	.icon-btn {
		width: 2.75rem;
		height: 2.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
</style>
