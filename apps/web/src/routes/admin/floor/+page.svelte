<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';

	interface DineArea {
		id: number;
		name: string;
	}
	interface DineTable {
		id: number;
		name: string;
		seats: number;
		status: string;
	}

	let dineAreas = $state<DineArea[]>([]);
	let tables = $state<DineTable[]>([]);
	let selectedAreaId = $state<number | null>(null);
	let noBranchSelected = $state(false);

	let newAreaName = $state('');
	let newTableName = $state('');
	let newTableSeats = $state('4');
	let editingAreaId = $state<number | null>(null);
	let editingAreaName = $state('');

	async function loadDineAreas() {
		const response = await apiFetch('/floor/dine-areas');
		if (response.status === 409) {
			noBranchSelected = true;
			return;
		}
		noBranchSelected = false;
		if (response.ok) {
			dineAreas = ((await response.json()) as { dineAreas: DineArea[] }).dineAreas;
		}
	}

	async function loadTables(areaId: number) {
		const response = await apiFetch(`/floor/tables?dineAreaId=${areaId}`);
		if (response.ok) {
			tables = ((await response.json()) as { tables: DineTable[] }).tables;
		}
	}

	function selectArea(id: number) {
		selectedAreaId = id;
		loadTables(id);
	}

	async function createArea(event: SubmitEvent) {
		event.preventDefault();
		if (!newAreaName.trim()) return;
		const response = await apiFetch('/floor/dine-areas', {
			method: 'POST',
			body: JSON.stringify({ name: newAreaName.trim() }),
		});
		if (response.ok) {
			newAreaName = '';
			await loadDineAreas();
		}
	}

	function startEditArea(area: DineArea) {
		editingAreaId = area.id;
		editingAreaName = area.name;
	}

	async function saveAreaEdit() {
		if (editingAreaId === null || !editingAreaName.trim()) return;
		const response = await apiFetch(`/floor/dine-areas/${editingAreaId}`, {
			method: 'PATCH',
			body: JSON.stringify({ name: editingAreaName.trim() }),
		});
		if (response.ok) {
			editingAreaId = null;
			await loadDineAreas();
		}
	}

	async function deleteArea(id: number) {
		const response = await apiFetch(`/floor/dine-areas/${id}`, { method: 'DELETE' });
		if (response.ok) {
			if (selectedAreaId === id) {
				selectedAreaId = null;
				tables = [];
			}
			await loadDineAreas();
		}
	}

	async function createTable(event: SubmitEvent) {
		event.preventDefault();
		if (!newTableName.trim() || selectedAreaId === null) return;
		const response = await apiFetch('/floor/tables', {
			method: 'POST',
			body: JSON.stringify({
				dineAreaId: selectedAreaId,
				name: newTableName.trim(),
				seats: Number(newTableSeats) || 2,
			}),
		});
		if (response.ok) {
			newTableName = '';
			await loadTables(selectedAreaId);
		}
	}

	async function deleteTable(id: number) {
		if (selectedAreaId === null) return;
		const response = await apiFetch(`/floor/tables/${id}`, { method: 'DELETE' });
		if (response.ok) {
			await loadTables(selectedAreaId);
		}
	}

	async function openOrder(dineTableId: number) {
		const response = await apiFetch('/orders', {
			method: 'POST',
			body: JSON.stringify({ dineTableId }),
		});
		if (response.ok) {
			const { order } = (await response.json()) as { order: { id: number } };
			goto(`/pos/${order.id}`);
		}
	}

	async function viewOrder(dineTableId: number) {
		const response = await apiFetch(`/orders/for-table/${dineTableId}`);
		if (response.ok) {
			const { order } = (await response.json()) as { order: { id: number } | null };
			if (order) goto(`/pos/${order.id}`);
		}
	}

	$effect(() => {
		loadDineAreas();
	});
</script>

<main>
	<h1>Mesas y áreas</h1>

	{#if noBranchSelected}
		<p role="alert">
			Selecciona una sucursal en <a href="/">Inicio</a> antes de gestionar mesas y áreas.
		</p>
	{:else}
		<section>
			<h2>Áreas — {session.currentBranch?.name ?? ''}</h2>
			<ul>
				{#each dineAreas as area (area.id)}
					<li>
						{#if editingAreaId === area.id}
							<input type="text" bind:value={editingAreaName} />
							<button onclick={saveAreaEdit}>Guardar</button>
						{:else}
							<button onclick={() => selectArea(area.id)}>{area.name}</button>
							<button onclick={() => startEditArea(area)}>Editar</button>
							<button onclick={() => deleteArea(area.id)}>Eliminar</button>
						{/if}
					</li>
				{/each}
			</ul>
			<form onsubmit={createArea}>
				<input type="text" bind:value={newAreaName} placeholder="Nueva área" required />
				<button type="submit">Crear</button>
			</form>
		</section>

		{#if selectedAreaId !== null}
			<section>
				<h2>Mesas</h2>
				<ul>
					{#each tables as table (table.id)}
						<li>
							{table.name} ({table.seats} puestos) — {table.status}
							<button onclick={() => deleteTable(table.id)}>Eliminar</button>
							{#if table.status === 'available'}
								<button onclick={() => openOrder(table.id)}>Abrir orden</button>
							{:else if table.status === 'occupied'}
								<button onclick={() => viewOrder(table.id)}>Ver orden</button>
							{/if}
						</li>
					{/each}
				</ul>
				<form onsubmit={createTable}>
					<input type="text" bind:value={newTableName} placeholder="Nueva mesa" required />
					<input type="number" bind:value={newTableSeats} placeholder="Puestos" min="1" />
					<button type="submit">Crear</button>
				</form>
			</section>
		{/if}
	{/if}
</main>
