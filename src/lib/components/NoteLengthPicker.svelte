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

<div class="row">
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
</div>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.icon-btn {
		width: 2.75rem;
		height: 2.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
</style>
