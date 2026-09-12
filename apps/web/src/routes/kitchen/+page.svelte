<script lang="ts">
	import { apiFetch } from '$lib/api.js';

	interface KitchenStation {
		id: number;
		name: string;
	}

	let stations = $state<KitchenStation[]>([]);

	async function loadStations() {
		const response = await apiFetch('/catalog/kitchen-stations');
		if (response.ok) {
			stations = ((await response.json()) as { kitchenStations: KitchenStation[] }).kitchenStations;
		}
	}

	$effect(() => {
		loadStations();
	});
</script>

<div class="page">
	<h1>Cocina</h1>
	{#if stations.length === 0}
		<p>No hay estaciones de cocina configuradas. Créalas en Catálogo.</p>
	{:else}
		<ul>
			{#each stations as station (station.id)}
				<li><a href="/kitchen/{station.id}">{station.name}</a></li>
			{/each}
		</ul>
	{/if}
</div>
