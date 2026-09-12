<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import DataList from '$lib/components/DataList.svelte';
	import DataListRow from '$lib/components/DataListRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { session } from '$lib/session.svelte.js';
	import { DINE_TABLE_STATUS, statusLabel } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	// Esta pantalla configura el salón; abrir y cobrar órdenes es trabajo del
	// POS (/pos). Antes ambas cosas convivían aquí porque no había mapa de
	// mesas, y se abría una orden desde la pantalla de Ajustes.
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

	let areaFormOpen = $state(false);
	let editingAreaId = $state<number | null>(null);
	let areaName = $state('');
	let savingArea = $state(false);
	let areaToDelete = $state<DineArea | null>(null);

	let tableFormOpen = $state(false);
	let editingTableId = $state<number | null>(null);
	let tableName = $state('');
	let tableSeats = $state('4');
	let savingTable = $state(false);
	let tableToDelete = $state<DineTable | null>(null);

	const selectedArea = $derived(dineAreas.find((area) => area.id === selectedAreaId) ?? null);

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

	function startCreateArea() {
		editingAreaId = null;
		areaName = '';
		areaFormOpen = true;
	}

	function startEditArea(area: DineArea) {
		editingAreaId = area.id;
		areaName = area.name;
		areaFormOpen = true;
	}

	async function saveArea() {
		const name = areaName.trim();
		if (!name) return;
		savingArea = true;
		try {
			const editing = editingAreaId !== null;
			const response = await apiFetch(
				editing ? `/floor/dine-areas/${editingAreaId}` : '/floor/dine-areas',
				{ method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ name }) },
			);
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar el área.'));
				return;
			}
			areaFormOpen = false;
			await loadDineAreas();
			toasts.success(editing ? `Área renombrada a «${name}».` : `Área «${name}» creada.`);
		} finally {
			savingArea = false;
		}
	}

	async function deleteArea() {
		const area = areaToDelete;
		if (!area) return;
		const response = await apiFetch(`/floor/dine-areas/${area.id}`, { method: 'DELETE' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo eliminar el área.'));
			return;
		}
		if (selectedAreaId === area.id) {
			selectedAreaId = null;
			tables = [];
		}
		await loadDineAreas();
		toasts.success(`Área «${area.name}» eliminada.`);
	}

	function startCreateTable() {
		editingTableId = null;
		tableName = '';
		tableSeats = '4';
		tableFormOpen = true;
	}

	function startEditTable(table: DineTable) {
		editingTableId = table.id;
		tableName = table.name;
		tableSeats = String(table.seats);
		tableFormOpen = true;
	}

	async function saveTable() {
		const name = tableName.trim();
		if (!name || selectedAreaId === null) return;
		savingTable = true;
		try {
			const editing = editingTableId !== null;
			const seats = Number(tableSeats) || 2;
			const response = await apiFetch(
				editing ? `/floor/tables/${editingTableId}` : '/floor/tables',
				{
					method: editing ? 'PATCH' : 'POST',
					body: JSON.stringify(
						editing ? { name, seats } : { dineAreaId: selectedAreaId, name, seats },
					),
				},
			);
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar la mesa.'));
				return;
			}
			tableFormOpen = false;
			await loadTables(selectedAreaId);
			toasts.success(editing ? `Mesa «${name}» actualizada.` : `Mesa «${name}» creada.`);
		} finally {
			savingTable = false;
		}
	}

	async function deleteTable() {
		const table = tableToDelete;
		if (!table || selectedAreaId === null) return;
		const response = await apiFetch(`/floor/tables/${table.id}`, { method: 'DELETE' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo eliminar la mesa.'));
			return;
		}
		await loadTables(selectedAreaId);
		toasts.success(`Mesa «${table.name}» eliminada.`);
	}

	$effect(() => {
		loadDineAreas();
	});
</script>

<PageHeader
	title="Áreas y mesas"
	description="El salón de {session.currentBranch?.name ?? 'la sucursal'}: primero las áreas, y dentro de cada una sus mesas. Para abrir o cobrar una orden, ve al POS."
>
	{#snippet actions()}
		{#if !noBranchSelected}
			<Button variant="ghost" icon="pos" onclick={() => goto('/pos')}>Ir al POS</Button>
			<Button variant="primary" icon="plus" onclick={startCreateArea}>Nueva área</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if noBranchSelected}
	<EmptyState
		icon="home"
		title="No hay sucursal seleccionada"
		description="Las áreas y mesas pertenecen a una sucursal. Elige una para continuar."
	>
		{#snippet action()}
			<Button variant="primary" onclick={() => goto('/')}>Ir a Inicio</Button>
		{/snippet}
	</EmptyState>
{:else}
	<div class="columns">
		<div class="col">
			<h2>Áreas</h2>
			{#if dineAreas.length === 0}
				<EmptyState
					icon="tables"
					title="Todavía no hay áreas"
					description="Un área agrupa mesas: salón principal, terraza, barra…"
				>
					{#snippet action()}
						<Button variant="primary" icon="plus" onclick={startCreateArea}>Crear área</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<DataList>
					{#each dineAreas as area (area.id)}
						<DataListRow
							title={area.name}
							selected={area.id === selectedAreaId}
							onclick={() => selectArea(area.id)}
						>
							{#snippet actions()}
								<Button
									size="sm"
									variant="ghost"
									icon="edit"
									aria-label="Editar {area.name}"
									onclick={() => startEditArea(area)}
								/>
								<Button
									size="sm"
									variant="danger"
									icon="trash"
									aria-label="Eliminar {area.name}"
									onclick={() => (areaToDelete = area)}
								/>
							{/snippet}
						</DataListRow>
					{/each}
				</DataList>
			{/if}
		</div>

		<div class="col">
			{#if selectedArea === null}
				<h2>Mesas</h2>
				<EmptyState
					icon="tables"
					title="Selecciona un área"
					description="Elige un área de la izquierda para ver y administrar sus mesas."
				/>
			{:else}
				<div class="col-header">
					<h2>Mesas de {selectedArea.name}</h2>
					<Button variant="secondary" icon="plus" onclick={startCreateTable}>Nueva mesa</Button>
				</div>

				{#if tables.length === 0}
					<EmptyState
						icon="tables"
						title="Esta área no tiene mesas"
						description="Añade la primera para que aparezca en el mapa del POS."
					>
						{#snippet action()}
							<Button variant="primary" icon="plus" onclick={startCreateTable}>Crear mesa</Button>
						{/snippet}
					</EmptyState>
				{:else}
					<DataList>
						{#each tables as table (table.id)}
							{@const status = statusLabel(DINE_TABLE_STATUS, table.status)}
							<DataListRow title={table.name} meta="{table.seats} puestos">
								<Badge tone={status.tone}>{status.label}</Badge>
								{#snippet actions()}
									<Button
										size="sm"
										variant="ghost"
										icon="edit"
										aria-label="Editar {table.name}"
										onclick={() => startEditTable(table)}
									/>
									<Button
										size="sm"
										variant="danger"
										icon="trash"
										aria-label="Eliminar {table.name}"
										onclick={() => (tableToDelete = table)}
									/>
								{/snippet}
							</DataListRow>
						{/each}
					</DataList>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<Modal
	bind:open={areaFormOpen}
	title={editingAreaId === null ? 'Nueva área' : 'Editar área'}
	size="sm"
>
	<Field
		label="Nombre del área"
		bind:value={areaName}
		required
		placeholder="Salón principal, Terraza…"
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingArea} onclick={() => (areaFormOpen = false)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingArea} onclick={saveArea}>
			{editingAreaId === null ? 'Crear área' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<Modal
	bind:open={tableFormOpen}
	title={editingTableId === null ? 'Nueva mesa' : 'Editar mesa'}
	description={selectedArea?.name}
	size="sm"
>
	<Field label="Nombre de la mesa" bind:value={tableName} required placeholder="Mesa 1" />
	<Field
		label="Puestos"
		type="number"
		bind:value={tableSeats}
		min="1"
		hint="Cuántos comensales caben."
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingTable} onclick={() => (tableFormOpen = false)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingTable} onclick={saveTable}>
			{editingTableId === null ? 'Crear mesa' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={areaToDelete !== null}
	title="¿Eliminar el área?"
	message="Se eliminará «{areaToDelete?.name ?? ''}». Si todavía tiene mesas, no se podrá."
	confirmLabel="Eliminar área"
	onconfirm={deleteArea}
	onclose={() => (areaToDelete = null)}
/>

<ConfirmDialog
	open={tableToDelete !== null}
	title="¿Eliminar la mesa?"
	message="Se eliminará «{tableToDelete?.name ?? ''}» de {selectedArea?.name ?? ''}. Si tiene órdenes registradas, no se podrá."
	confirmLabel="Eliminar mesa"
	onconfirm={deleteTable}
	onclose={() => (tableToDelete = null)}
/>

<style>
	.columns {
		display: grid;
		grid-template-columns: minmax(240px, 340px) 1fr;
		gap: var(--space-5);
		align-items: start;
	}

	.col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.col-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
