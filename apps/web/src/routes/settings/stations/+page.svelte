<script lang="ts">
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
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { toasts } from '$lib/toasts.svelte.js';

	// Las estaciones vivían escondidas al final de la pantalla de Catálogo,
	// entre las categorías y los ítems, aunque no son parte del menú sino
	// del hardware del local. Aquí tienen su propia sección de ajustes.
	interface KitchenStation {
		id: number;
		name: string;
		printerHost: string | null;
		printerPort: number | null;
	}

	let stations = $state<KitchenStation[]>([]);
	let loading = $state(true);

	let creating = $state(false);
	let newName = $state('');
	let newHost = $state('');
	let newPort = $state('');
	let saving = $state(false);

	let editingPrinterFor = $state<KitchenStation | null>(null);
	let printerHost = $state('');
	let printerPort = $state('');
	let savingPrinter = $state(false);

	let clearingPrinterFor = $state<KitchenStation | null>(null);

	async function loadStations() {
		const response = await apiFetch('/catalog/kitchen-stations');
		if (response.ok) {
			stations = ((await response.json()) as { kitchenStations: KitchenStation[] }).kitchenStations;
		} else {
			toasts.error(await apiErrorMessage(response, 'No se pudieron cargar las estaciones.'));
		}
	}

	function startCreate() {
		newName = '';
		newHost = '';
		newPort = '';
		creating = true;
	}

	async function createStation() {
		const name = newName.trim();
		const host = newHost.trim();
		const port = newPort.trim();
		if (!name) return;
		// La API rechaza una dirección sin puerto (y al revés): se avisa aquí
		// en vez de dejar que vuelva como un `invalid_request` sin contexto.
		if (Boolean(host) !== Boolean(port)) {
			toasts.error('La impresora necesita dirección y puerto, o ninguno de los dos.');
			return;
		}

		saving = true;
		try {
			const response = await apiFetch('/catalog/kitchen-stations', {
				method: 'POST',
				body: JSON.stringify({
					name,
					printerHost: host || undefined,
					printerPort: port ? Number(port) : undefined,
				}),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo crear la estación.'));
				return;
			}
			creating = false;
			await loadStations();
			toasts.success(`Estación «${name}» creada.`);
		} finally {
			saving = false;
		}
	}

	function startEditPrinter(station: KitchenStation) {
		editingPrinterFor = station;
		printerHost = station.printerHost ?? '';
		printerPort = station.printerPort === null ? '' : String(station.printerPort);
	}

	async function savePrinter() {
		const station = editingPrinterFor;
		if (!station) return;
		const host = printerHost.trim();
		const port = printerPort.trim();
		if (Boolean(host) !== Boolean(port)) {
			toasts.error('La impresora necesita dirección y puerto, o ninguno de los dos.');
			return;
		}

		savingPrinter = true;
		try {
			const response = await apiFetch(`/catalog/kitchen-stations/${station.id}/printer`, {
				method: 'PATCH',
				body: JSON.stringify({
					printerHost: host || null,
					printerPort: port ? Number(port) : null,
				}),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar la impresora.'));
				return;
			}
			editingPrinterFor = null;
			await loadStations();
			toasts.success(`Impresora de «${station.name}» actualizada.`);
		} finally {
			savingPrinter = false;
		}
	}

	async function clearPrinter() {
		const station = clearingPrinterFor;
		if (!station) return;
		const response = await apiFetch(`/catalog/kitchen-stations/${station.id}/printer`, {
			method: 'PATCH',
			body: JSON.stringify({ printerHost: null, printerPort: null }),
		});
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo quitar la impresora.'));
			return;
		}
		await loadStations();
		toasts.success(`«${station.name}» queda sin impresora: sus comandas solo se verán en pantalla.`);
	}

	$effect(() => {
		loadStations().finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Estaciones e impresoras"
	description="Cada ítem del menú se enruta a una estación. Si la estación tiene impresora, su comanda sale impresa al enviarla; si no, solo aparece en el tablero de cocina."
>
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={startCreate}>Nueva estación</Button>
	{/snippet}
</PageHeader>

{#if loading}
	<Skeleton lines={4} />
{:else if stations.length === 0}
	<EmptyState
		icon="kitchen"
		title="Todavía no hay estaciones"
		description="Cocina caliente, bar, postres… Crea la primera para poder enrutar ítems hacia ella."
	>
		{#snippet action()}
			<Button variant="primary" icon="plus" onclick={startCreate}>Crear estación</Button>
		{/snippet}
	</EmptyState>
{:else}
	<DataList>
		{#each stations as station (station.id)}
			<DataListRow
				title={station.name}
				meta={station.printerHost ? `${station.printerHost}:${station.printerPort}` : undefined}
			>
				{#if station.printerHost}
					<Badge tone="success">Con impresora</Badge>
				{:else}
					<Badge tone="neutral">Solo en pantalla</Badge>
				{/if}
				{#snippet actions()}
					<Button size="sm" variant="secondary" onclick={() => startEditPrinter(station)}>
						{station.printerHost ? 'Cambiar impresora' : 'Asignar impresora'}
					</Button>
					{#if station.printerHost}
						<Button
							size="sm"
							variant="danger"
							icon="close"
							aria-label="Quitar la impresora de {station.name}"
							onclick={() => (clearingPrinterFor = station)}
						/>
					{/if}
				{/snippet}
			</DataListRow>
		{/each}
	</DataList>
{/if}

<Modal bind:open={creating} title="Nueva estación" size="sm">
	<Field label="Nombre" bind:value={newName} required placeholder="Cocina caliente, Bar…" />
	<Field
		label="Dirección de la impresora"
		bind:value={newHost}
		placeholder="192.168.1.50"
		hint="Opcional. La IP de la impresora de red en el local."
	/>
	<Field label="Puerto" type="number" bind:value={newPort} placeholder="9100" />
	{#snippet footer()}
		<Button variant="ghost" disabled={saving} onclick={() => (creating = false)}>Cancelar</Button>
		<Button variant="primary" loading={saving} onclick={createStation}>Crear estación</Button>
	{/snippet}
</Modal>

<Modal
	open={editingPrinterFor !== null}
	title="Impresora de la estación"
	description={editingPrinterFor?.name}
	size="sm"
	onclose={() => (editingPrinterFor = null)}
>
	<Field label="Dirección" bind:value={printerHost} placeholder="192.168.1.50" />
	<Field
		label="Puerto"
		type="number"
		bind:value={printerPort}
		placeholder="9100"
		hint="9100 es el puerto habitual de una impresora ESC/POS de red."
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingPrinter} onclick={() => (editingPrinterFor = null)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingPrinter} onclick={savePrinter}>Guardar</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={clearingPrinterFor !== null}
	title="¿Quitar la impresora?"
	message="«{clearingPrinterFor?.name ?? ''}» dejará de imprimir comandas; seguirán apareciendo en el tablero de cocina."
	confirmLabel="Quitar impresora"
	onconfirm={clearPrinter}
	onclose={() => (clearingPrinterFor = null)}
/>
