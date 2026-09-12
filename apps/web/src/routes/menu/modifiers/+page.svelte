<script lang="ts">
	import { apiFetch } from '$lib/api.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataList from '$lib/components/DataList.svelte';
	import DataListRow from '$lib/components/DataListRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { toasts } from '$lib/toasts.svelte.js';

	interface Group {
		id: number;
		name: string;
		selectionType: 'single' | 'multiple';
	}
	interface Modifier {
		id: number;
		groupId: number;
		name: string;
		priceDelta: string;
	}

	let groups = $state<Group[]>([]);
	let modifiers = $state<Modifier[]>([]);
	let selectedGroupId = $state<number | null>(null);

	let groupFormOpen = $state(false);
	let groupName = $state('');
	let groupSelectionType = $state<'single' | 'multiple'>('single');
	let savingGroup = $state(false);

	let modifierFormOpen = $state(false);
	let modifierName = $state('');
	let modifierPriceDelta = $state('0.00');
	let savingModifier = $state(false);

	const selectedGroup = $derived(groups.find((group) => group.id === selectedGroupId) ?? null);

	function selectionLabel(type: 'single' | 'multiple'): string {
		return type === 'single' ? 'Elige uno' : 'Elige varios';
	}

	function priceLabel(priceDelta: string): string {
		const value = Number(priceDelta);
		if (value === 0) return 'Sin costo';
		return `${value > 0 ? '+' : '−'}RD$ ${Math.abs(value).toFixed(2)}`;
	}

	async function loadGroups() {
		const response = await apiFetch('/modifiers/groups');
		if (response.ok) {
			groups = ((await response.json()) as { groups: Group[] }).groups;
		}
	}

	async function loadModifiers(groupId: number) {
		const response = await apiFetch(`/modifiers?groupId=${groupId}`);
		if (response.ok) {
			modifiers = ((await response.json()) as { modifiers: Modifier[] }).modifiers;
		}
	}

	function selectGroup(id: number) {
		selectedGroupId = id;
		loadModifiers(id);
	}

	function startCreateGroup() {
		groupName = '';
		groupSelectionType = 'single';
		groupFormOpen = true;
	}

	async function createGroup() {
		const name = groupName.trim();
		if (!name) return;
		savingGroup = true;
		try {
			const response = await apiFetch('/modifiers/groups', {
				method: 'POST',
				body: JSON.stringify({ name, selectionType: groupSelectionType }),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo crear el grupo.'));
				return;
			}
			groupFormOpen = false;
			await loadGroups();
			toasts.success(`Grupo «${name}» creado.`);
		} finally {
			savingGroup = false;
		}
	}

	function startCreateModifier() {
		modifierName = '';
		modifierPriceDelta = '0.00';
		modifierFormOpen = true;
	}

	async function createModifier() {
		const name = modifierName.trim();
		if (!name || selectedGroupId === null) return;
		savingModifier = true;
		try {
			const response = await apiFetch('/modifiers', {
				method: 'POST',
				body: JSON.stringify({
					groupId: selectedGroupId,
					name,
					priceDelta: modifierPriceDelta.trim() || '0',
				}),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo crear el modificador.'));
				return;
			}
			modifierFormOpen = false;
			await loadModifiers(selectedGroupId);
			toasts.success(`Modificador «${name}» creado.`);
		} finally {
			savingModifier = false;
		}
	}

	$effect(() => {
		loadGroups();
	});
</script>

<PageHeader
	title="Modificadores"
	description="Un grupo reúne las opciones de un ítem — término de la carne, tipo de leche — y cada modificador puede sumar o restar al precio."
>
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={startCreateGroup}>Nuevo grupo</Button>
	{/snippet}
</PageHeader>

<div class="columns">
	<div class="col">
		<h2>Grupos</h2>
		{#if groups.length === 0}
			<EmptyState
				icon="modifiers"
				title="Todavía no hay grupos"
				description="Crea el primero para poder asociarlo a un ítem del catálogo."
			>
				{#snippet action()}
					<Button variant="primary" icon="plus" onclick={startCreateGroup}>Crear grupo</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<DataList>
				{#each groups as group (group.id)}
					<DataListRow
						title={group.name}
						selected={group.id === selectedGroupId}
						onclick={() => selectGroup(group.id)}
					>
						<Badge tone="neutral">{selectionLabel(group.selectionType)}</Badge>
					</DataListRow>
				{/each}
			</DataList>
		{/if}
	</div>

	<div class="col">
		{#if selectedGroup === null}
			<h2>Modificadores</h2>
			<EmptyState
				icon="modifiers"
				title="Selecciona un grupo"
				description="Elige un grupo de la izquierda para ver y añadir sus opciones."
			/>
		{:else}
			<div class="col-header">
				<h2>Opciones de {selectedGroup.name}</h2>
				<Button variant="secondary" icon="plus" onclick={startCreateModifier}>
					Nueva opción
				</Button>
			</div>

			{#if modifiers.length === 0}
				<EmptyState
					icon="modifiers"
					title="Este grupo no tiene opciones"
					description="Un grupo vacío no aporta nada en el POS."
				>
					{#snippet action()}
						<Button variant="primary" icon="plus" onclick={startCreateModifier}>
							Crear opción
						</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<DataList>
					{#each modifiers as modifier (modifier.id)}
						<DataListRow title={modifier.name} meta={priceLabel(modifier.priceDelta)} />
					{/each}
				</DataList>
			{/if}
		{/if}
	</div>
</div>

<Modal bind:open={groupFormOpen} title="Nuevo grupo" size="sm">
	<Field
		label="Nombre del grupo"
		bind:value={groupName}
		required
		placeholder="Término, Tipo de leche…"
	/>
	<Field label="Cuántas opciones puede elegir el cliente">
		{#snippet control({ id })}
			<select {id} bind:value={groupSelectionType}>
				<option value="single">Solo una</option>
				<option value="multiple">Varias</option>
			</select>
		{/snippet}
	</Field>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingGroup} onclick={() => (groupFormOpen = false)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingGroup} onclick={createGroup}>Crear grupo</Button>
	{/snippet}
</Modal>

<Modal
	bind:open={modifierFormOpen}
	title="Nueva opción"
	description={selectedGroup?.name}
	size="sm"
>
	<Field label="Nombre" bind:value={modifierName} required placeholder="Término medio" />
	<Field
		label="Ajuste de precio"
		bind:value={modifierPriceDelta}
		inputmode="decimal"
		hint="Lo que suma al precio del ítem. 0 si no cuesta nada; usa un negativo para descontar."
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingModifier} onclick={() => (modifierFormOpen = false)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingModifier} onclick={createModifier}>
			Crear opción
		</Button>
	{/snippet}
</Modal>

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
