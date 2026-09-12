<script lang="ts">
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
	import { DINE_TABLE_STATUS, ORDER_STATUS, statusLabel } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	// Referencia viva del sistema de componentes: si algo se ve mal aquí, se
	// ve mal en todas las pantallas que lo usen. No consume la API.
	let nombre = $state('Mofongo de camarones');
	let precio = $state('595.00');
	let asiento = $state('');
	let modalAbierto = $state(false);
	let confirmAbierto = $state(false);

	const MESAS = [
		{ id: 1, name: 'Mesa 1', seats: 4, status: 'available' },
		{ id: 2, name: 'Mesa 2', seats: 2, status: 'occupied' },
		{ id: 3, name: 'Terraza 1', seats: 6, status: 'reserved' },
	];

	async function guardarDemo() {
		await new Promise((resolve) => setTimeout(resolve, 700));
		toasts.success('Mesa 4 creada en Salón principal.');
	}
</script>

<PageHeader
	title="Sistema de componentes"
	description="Referencia de los componentes base de Bistro. Cada pantalla se arma con estas piezas, no con estilos propios."
>
	{#snippet actions()}
		<Button variant="ghost">Descartar</Button>
		<Button variant="primary" icon="plus">Nueva mesa</Button>
	{/snippet}
</PageHeader>

<section>
	<h2>Botones</h2>
	<p>Solo una acción primaria por bloque. Lo destructivo va siempre en rojo.</p>
	<div class="row">
		<Button variant="primary">Primario</Button>
		<Button variant="secondary">Secundario</Button>
		<Button variant="ghost">Terciario</Button>
		<Button variant="danger" icon="trash">Eliminar</Button>
		<Button variant="primary" loading>Guardando</Button>
		<Button variant="secondary" disabled>Deshabilitado</Button>
	</div>
	<div class="row">
		<Button size="sm" variant="secondary" icon="edit">Editar</Button>
		<Button size="md" variant="secondary" icon="search">Buscar</Button>
		<Button size="lg" variant="primary" icon="check">Cobrar orden</Button>
		<Button size="md" variant="ghost" icon="close" aria-label="Cerrar" />
	</div>
</section>

<section>
	<h2>Campos</h2>
	<p>Etiqueta visible siempre. El <code>placeholder</code> es un ejemplo, no un rótulo.</p>
	<div class="grid">
		<Field label="Nombre del ítem" bind:value={nombre} required hint="Como aparece en la comanda." />
		<Field
			label="Precio"
			type="number"
			bind:value={precio}
			inputmode="decimal"
			hint="En pesos, sin ITBIS."
		/>
		<Field
			label="Puestos"
			bind:value={asiento}
			error={asiento === '' ? 'Indica cuántos comensales caben.' : undefined}
		/>
		<Field label="Estación de cocina">
			{#snippet control({ id, describedBy })}
				<select {id} aria-describedby={describedBy}>
					<option>Cocina caliente</option>
					<option>Bar</option>
					<option>Postres</option>
				</select>
			{/snippet}
		</Field>
	</div>
</section>

<section>
	<h2>Estados</h2>
	<p>El color significa lo mismo en toda la app, y el texto va en español.</p>
	<div class="row">
		{#each Object.keys(DINE_TABLE_STATUS) as key (key)}
			{@const status = statusLabel(DINE_TABLE_STATUS, key)}
			<Badge tone={status.tone}>{status.label}</Badge>
		{/each}
		{#each Object.keys(ORDER_STATUS) as key (key)}
			{@const status = statusLabel(ORDER_STATUS, key)}
			<Badge tone={status.tone}>{status.label}</Badge>
		{/each}
		<Badge tone="danger">Anulada</Badge>
	</div>
</section>

<section>
	<h2>Listas</h2>
	<p>Título, metadatos y acciones en la misma posición en todas las filas.</p>
	<DataList>
		{#each MESAS as mesa (mesa.id)}
			{@const status = statusLabel(DINE_TABLE_STATUS, mesa.status)}
			<DataListRow title={mesa.name} meta="{mesa.seats} puestos" onclick={() => {}}>
				<Badge tone={status.tone}>{status.label}</Badge>
				{#snippet actions()}
					<Button size="sm" variant="ghost" icon="edit" aria-label="Editar {mesa.name}" />
					<Button
						size="sm"
						variant="danger"
						icon="trash"
						aria-label="Eliminar {mesa.name}"
						onclick={() => (confirmAbierto = true)}
					/>
				{/snippet}
			</DataListRow>
		{/each}
	</DataList>
</section>

<section>
	<h2>Vacío y carga</h2>
	<div class="grid">
		<EmptyState
			title="Sin áreas todavía"
			description="Crea la primera área del salón para poder registrar mesas."
		>
			{#snippet action()}
				<Button variant="primary" icon="plus">Crear área</Button>
			{/snippet}
		</EmptyState>
		<Skeleton lines={4} />
	</div>
</section>

<section>
	<h2>Diálogos y avisos</h2>
	<p>Nada destructivo se ejecuta al primer clic, y ninguna mutación termina en silencio.</p>
	<div class="row">
		<Button variant="secondary" onclick={() => (modalAbierto = true)}>Abrir modal</Button>
		<Button variant="danger" onclick={() => (confirmAbierto = true)}>Pedir confirmación</Button>
		<Button variant="ghost" onclick={() => toasts.success('Orden #1042 cobrada.')}>Éxito</Button>
		<Button variant="ghost" onclick={() => toasts.error('La mesa ya tiene una orden abierta.')}>
			Error
		</Button>
		<Button variant="ghost" onclick={() => toasts.info('Comanda enviada a Cocina caliente.')}>
			Info
		</Button>
	</div>
</section>

<Modal bind:open={modalAbierto} title="Nueva mesa" description="Salón principal">
	<Field label="Nombre" value="Mesa 4" required />
	<Field label="Puestos" type="number" value="4" />
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (modalAbierto = false)}>Cancelar</Button>
		<Button variant="primary" onclick={() => (modalAbierto = false)}>Crear mesa</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	bind:open={confirmAbierto}
	title="¿Eliminar la mesa?"
	message="Se eliminará «Mesa 2» del área Salón principal. Esta acción no se puede deshacer."
	confirmLabel="Eliminar mesa"
	onconfirm={guardarDemo}
/>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--space-4);
	}

	code {
		font-size: var(--text-sm);
		background: var(--color-surface-sunk);
		padding: 0.1em 0.35em;
		border-radius: var(--radius-sm);
	}
</style>
