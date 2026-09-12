<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	interface KitchenStation {
		id: number;
		name: string;
		printerHost: string | null;
	}

	let stations = $state<KitchenStation[]>([]);
	let loading = $state(true);

	async function loadStations() {
		const response = await apiFetch('/catalog/kitchen-stations');
		if (response.ok) {
			stations = ((await response.json()) as { kitchenStations: KitchenStation[] }).kitchenStations;
		}
	}

	$effect(() => {
		loadStations().finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Cocina"
	description="Cada estación tiene su propio tablero con las comandas que le tocan."
/>

{#if loading}
	<Skeleton lines={3} />
{:else if stations.length === 0}
	<EmptyState
		icon="kitchen"
		title="No hay estaciones configuradas"
		description="Sin estaciones, las comandas no tienen a dónde ir."
	>
		{#snippet action()}
			<Button variant="primary" onclick={() => goto('/settings/stations')}>
				Ir a Estaciones e impresoras
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	<div class="grid">
		{#each stations as station (station.id)}
			<a class="station" href="/kitchen/{station.id}">
				<span class="icon"><Icon name="kitchen" size={22} /></span>
				<span class="name">{station.name}</span>
				{#if station.printerHost}
					<Badge tone="success">Con impresora</Badge>
				{:else}
					<Badge tone="neutral">Solo en pantalla</Badge>
				{/if}
			</a>
		{/each}
	</div>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--space-4);
	}

	.station {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-5);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		color: var(--color-text);
	}

	.station:hover {
		border-color: var(--color-primary);
		background: var(--color-primary-tint);
	}

	.station:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.icon {
		display: flex;
		color: var(--color-primary);
	}

	.name {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 600;
	}
</style>
