<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	interface Option<T> {
		value: T;
		label: string;
		icon?: Snippet;
	}

	interface Props {
		label: string;
		value: T;
		options: Option<T>[];
		onChange: (value: T) => void;
	}

	let { label, value, options, onChange }: Props = $props();
</script>

<div class="settings-row">
	<span class="group-label">{label}</span>
	<div class="group">
		{#each options as opt (opt.value)}
			<button
				type="button"
				class:icon-btn={!!opt.icon}
				aria-pressed={value === opt.value}
				aria-label={opt.label}
				title={opt.label}
				onclick={() => onChange(opt.value)}
			>
				{#if opt.icon}
					{@render opt.icon()}
				{:else}
					{opt.label}
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.settings-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
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
	.group-label {
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	button {
		background: transparent;
		border: 1px solid transparent;
		color: var(--text);
		padding: 0.3rem 0.8rem;
		min-height: 2.1rem;
		box-shadow: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font: inherit;
		font-weight: 500;
	}
	button:hover {
		background: var(--panel-hover);
	}
	button[aria-pressed='true'] {
		background: linear-gradient(180deg, var(--brand) 0%, var(--brand-2) 100%);
		color: var(--on-brand);
		border-color: transparent;
		box-shadow: 0 2px 10px -4px color-mix(in oklab, var(--brand) 50%, transparent);
	}
	button.icon-btn {
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		min-height: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
