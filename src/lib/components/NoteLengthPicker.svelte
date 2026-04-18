<script lang="ts">
	import type { NoteLength } from '$lib/rhythm/types';

	interface Option {
		value: NoteLength;
		glyph: string;
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
			aria-pressed={value.includes(o.value)}
			title={o.label}
			onclick={() => toggle(o.value)}
		>
			<span class="glyph">{o.glyph}</span>
			<span class="label">{o.label}</span>
		</button>
	{/each}
</div>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.4rem 0.75rem;
	}
	.glyph {
		font-family: 'Noto Music', 'Bravura Text', 'DejaVu Serif', serif;
		font-size: 1.15rem;
		line-height: 1;
	}
	.label {
		font-size: 0.85rem;
		opacity: 0.85;
	}
</style>
