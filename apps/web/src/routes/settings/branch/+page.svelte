<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataList from '$lib/components/DataList.svelte';
	import DataListRow from '$lib/components/DataListRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { session } from '$lib/session.svelte.js';
	import { toasts } from '$lib/toasts.svelte.js';

	/**
	 * El selector de sucursal vivía en la barra lateral, arriba del todo,
	 * ocupando el sitio más caro de la pantalla para algo que se toca una vez
	 * al día como mucho. Aquí tiene espacio para decir de qué compañía y de
	 * qué unidad de negocio es cada local, que en la barra no cabía.
	 *
	 * Cambiar de sucursal no pide permiso ninguno (`permissions: []` en
	 * `branches.routes.ts`): un mesero que cubre en otro local tiene que poder
	 * hacerlo sin que un administrador le abra la puerta. Por eso es su propia
	 * sección y no un botón dentro de Sucursales, que sí es de administración.
	 */
	let switching = $state<number | null>(null);

	async function selectBranch(branchId: number) {
		if (branchId === session.user?.branchId) return;
		switching = branchId;
		try {
			const ok = await session.selectBranch(branchId);
			if (!ok) {
				toasts.error('No se pudo cambiar de sucursal.');
				return;
			}
			// Salida dura hacia Inicio: cada pantalla trae datos de la sucursal
			// activa y ninguna sabe volver a pedirlos por su cuenta. Y quien
			// viene a cambiar de local viene a trabajar en él, no a quedarse en
			// Ajustes.
			location.assign('/');
		} finally {
			switching = null;
		}
	}
</script>

<PageHeader
	title="Sucursal activa"
	description="Todo lo que ves y todo lo que cobras pertenece a esta sucursal: las mesas, las órdenes y el panel del día."
/>

{#if session.branches.length === 0}
	<EmptyState
		icon="home"
		title="No tienes ninguna sucursal asignada"
		description="Los permisos se dan a un rol y el rol se asigna por sucursal. Pídele a un administrador que te asigne una."
	/>
{:else}
	<DataList>
		{#each session.branches as branch (branch.id)}
			{@const current = branch.id === session.user?.branchId}
			<DataListRow
				title={branch.name}
				meta="{branch.companyName} · {branch.businessUnitName}"
				selected={current}
			>
				{#if current}
					<Badge tone="primary">Trabajando aquí</Badge>
				{/if}
				{#snippet actions()}
					{#if !current}
						<Button
							variant="secondary"
							icon="switch"
							loading={switching === branch.id}
							disabled={switching !== null}
							onclick={() => selectBranch(branch.id)}
						>
							Trabajar aquí
						</Button>
					{/if}
				{/snippet}
			</DataListRow>
		{/each}
	</DataList>
{/if}
