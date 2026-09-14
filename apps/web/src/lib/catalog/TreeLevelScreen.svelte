<script module lang="ts">
	export type TreeLevel = 'family' | 'subfamily' | 'category';

	export interface TreeNode {
		id: number;
		name: string;
		status: 'active' | 'inactive';
		archivedAt: string | null;
		/** Presente en subfamilias (su familia) y categorías (su subfamilia). */
		parentId?: number;
	}
</script>

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
	import { treeNodeState } from '$lib/status.js';
	import { defaultParentId, parentOptionLabel } from './parents.js';
	import { toasts } from '$lib/toasts.svelte.js';

	/**
	 * Los tres niveles del árbol del catálogo son la misma pantalla: listar,
	 * crear, renombrar, pausar, archivar y restaurar, filtrando por estado.
	 * Lo único que cambia es el sustantivo, la URL y de quién cuelgan.
	 *
	 * Por eso están escritos una vez. La API los registra igual, en bucle
	 * (`TREE_ROUTES` en `catalog.routes.ts`): tres copias de esto se habrían
	 * separado a la tercera corrección.
	 */
	interface Props {
		level: TreeLevel;
	}

	let { level }: Props = $props();

	type StatusFilter = 'active' | 'inactive' | 'archived';

	const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
		{ value: 'active', label: 'Activas' },
		{ value: 'inactive', label: 'Inactivas' },
		{ value: 'archived', label: 'Archivadas' },
	];

	interface LevelCopy {
		/** Plural, para el título de la pantalla. */
		plural: string;
		/** Singular, para los diálogos y los avisos. */
		singular: string;
		description: string;
		/** Segmento de la URL en la API y la clave del array en su respuesta. */
		path: 'families' | 'subfamilies' | 'categories';
		placeholder: string;
		/** Nivel del que cuelga, si cuelga de alguno. */
		parent?: {
			/** Etiqueta del selector. */
			label: string;
			/** Plural, para cuando no hay ninguno donde colgar esto. */
			plural: string;
			singular: string;
			field: 'familyId' | 'subfamilyId';
		};
	}

	const COPY: Record<TreeLevel, LevelCopy> = {
		family: {
			plural: 'Familias',
			singular: 'familia',
			description: 'El primer nivel del menú. De cada familia cuelgan sus subfamilias.',
			path: 'families',
			placeholder: 'Comidas, Bebidas…',
		},
		subfamily: {
			plural: 'Subfamilias',
			singular: 'subfamilia',
			description: 'El segundo nivel. Cada subfamilia vive dentro de una familia.',
			path: 'subfamilies',
			placeholder: 'Carnes, Cervezas…',
			parent: {
				label: 'Familia',
				plural: 'familias',
				singular: 'una familia',
				field: 'familyId',
			},
		},
		category: {
			plural: 'Categorías',
			singular: 'categoría',
			description: 'El tercer nivel. Los ítems del menú cuelgan de una categoría.',
			path: 'categories',
			placeholder: 'Res, Nacionales…',
			parent: { label: 'Subfamilia', plural: 'subfamilias', singular: 'una subfamilia', field: 'subfamilyId' },
		},
	};

	const copy = $derived(COPY[level]);

	let nodes = $state<TreeNode[]>([]);
	let loading = $state(true);
	let statusFilter = $state<StatusFilter>('active');

	// La cadena de padres: una subfamilia necesita su familia, y una categoría
	// necesita elegir subfamilia, que a su vez se elige dentro de una familia.
	let families = $state<TreeNode[]>([]);
	let subfamilies = $state<TreeNode[]>([]);
	let selectedFamilyId = $state<number | null>(null);
	let selectedSubfamilyId = $state<number | null>(null);

	const parentId = $derived(level === 'subfamily' ? selectedFamilyId : selectedSubfamilyId);

	let formOpen = $state(false);
	let formMode = $state<'create' | 'edit'>('create');
	let editingId = $state<number | null>(null);
	let formName = $state('');
	let formStatus = $state<'active' | 'inactive'>('active');
	let saving = $state(false);

	let toArchive = $state<TreeNode | null>(null);

	/**
	 * Los selectores de padre piden `status=all` a propósito. Una subfamilia
	 * puede vivir bajo una familia pausada, y si el selector solo ofreciera
	 * las activas esa rama entera quedaría fuera del alcance de la pantalla
	 * -- justo lo contrario de archivar en vez de borrar.
	 */
	async function loadParents() {
		if (level === 'family') return;

		const familiesResponse = await apiFetch('/catalog/families?status=all');
		if (familiesResponse.ok) {
			families = ((await familiesResponse.json()) as { families: TreeNode[] }).families;
			if (selectedFamilyId === null) selectedFamilyId = defaultParentId(families);
		}
		if (level === 'category') await loadSubfamilies();
	}

	async function loadSubfamilies() {
		if (selectedFamilyId === null) {
			subfamilies = [];
			selectedSubfamilyId = null;
			return;
		}
		const response = await apiFetch(
			`/catalog/subfamilies?familyId=${selectedFamilyId}&status=all`,
		);
		if (response.ok) {
			subfamilies = ((await response.json()) as { subfamilies: TreeNode[] }).subfamilies;
			if (!subfamilies.some((subfamily) => subfamily.id === selectedSubfamilyId)) {
				selectedSubfamilyId = defaultParentId(subfamilies);
			}
		}
	}

	async function load() {
		if (copy.parent && parentId === null) {
			nodes = [];
			return;
		}
		const query = new URLSearchParams({ status: statusFilter });
		if (copy.parent) query.set(copy.parent.field, String(parentId));

		const response = await apiFetch(`/catalog/${copy.path}?${query.toString()}`);
		if (response.ok) {
			nodes = ((await response.json()) as Record<string, TreeNode[]>)[copy.path] ?? [];
		}
	}

	async function changeFamily() {
		if (level === 'category') await loadSubfamilies();
		await load();
	}

	function startCreate() {
		formMode = 'create';
		editingId = null;
		formName = '';
		formStatus = 'active';
		formOpen = true;
	}

	function startEdit(node: TreeNode) {
		formMode = 'edit';
		editingId = node.id;
		formName = node.name;
		formStatus = node.status;
		formOpen = true;
	}

	async function save() {
		const name = formName.trim();
		if (!name) return;
		const editing = formMode === 'edit' && editingId !== null;

		saving = true;
		try {
			const response = await apiFetch(
				editing ? `/catalog/${copy.path}/${editingId}` : `/catalog/${copy.path}`,
				{
					method: editing ? 'PATCH' : 'POST',
					body: JSON.stringify(
						editing
							? { name, status: formStatus }
							: copy.parent
								? { [copy.parent.field]: parentId, name }
								: { name },
					),
				},
			);
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar.'));
				return;
			}
			formOpen = false;
			await load();
			toasts.success(editing ? `«${name}» actualizada.` : `«${name}» creada.`);
		} finally {
			saving = false;
		}
	}

	async function archive() {
		const node = toArchive;
		if (!node) return;
		const response = await apiFetch(`/catalog/${copy.path}/${node.id}/archive`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo archivar.'));
			return;
		}
		await load();
		toasts.success(`«${node.name}» archivada. Todo lo que colgaba de ella sale del POS.`);
	}

	async function restore(node: TreeNode) {
		const response = await apiFetch(`/catalog/${copy.path}/${node.id}/restore`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo restaurar.'));
			return;
		}
		await load();
		toasts.success(`«${node.name}» restaurada como inactiva. Actívala para volver a usarla.`);
	}

	$effect(() => {
		loadParents()
			.then(() => load())
			.finally(() => {
				loading = false;
			});
	});
</script>

<PageHeader title={copy.plural} description={copy.description}>
	{#snippet actions()}
		{#if statusFilter !== 'archived' && (!copy.parent || parentId !== null)}
			<Button variant="primary" icon="plus" onclick={startCreate}>
				Nueva {copy.singular}
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="filters">
	{#if level !== 'family'}
		<Field label="Familia">
			{#snippet control({ id })}
				<select {id} bind:value={selectedFamilyId} onchange={changeFamily}>
					{#each families as family (family.id)}
						<option value={family.id}>{parentOptionLabel(family)}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
	{/if}

	{#if level === 'category'}
		<Field label="Subfamilia">
			{#snippet control({ id })}
				<select {id} bind:value={selectedSubfamilyId} onchange={() => load()}>
					{#each subfamilies as subfamily (subfamily.id)}
						<option value={subfamily.id}>{parentOptionLabel(subfamily)}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
	{/if}

	<Field label="Estado">
		{#snippet control({ id })}
			<select {id} bind:value={statusFilter} onchange={() => load()}>
				{#each STATUS_FILTERS as filter (filter.value)}
					<option value={filter.value}>{filter.label}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
</div>

{#if loading}
	<Skeleton lines={4} />
{:else if copy.parent && parentId === null}
	<EmptyState
		icon="catalog"
		title="No hay {copy.parent.plural} donde crear una {copy.singular}"
		description="Crea primero {copy.parent.singular} y vuelve aquí."
	/>
{:else if nodes.length === 0}
	<EmptyState
		icon="catalog"
		title={statusFilter === 'active'
			? `Sin ${copy.plural.toLowerCase()} activas`
			: statusFilter === 'inactive'
				? 'Ninguna en pausa'
				: 'Nada archivado aquí'}
		description={statusFilter === 'active'
			? `Crea la primera para empezar a colgar de ella.`
			: 'Cambia el filtro de estado para ver las demás.'}
	>
		{#snippet action()}
			{#if statusFilter === 'active'}
				<Button variant="primary" icon="plus" onclick={startCreate}>
					Nueva {copy.singular}
				</Button>
			{/if}
		{/snippet}
	</EmptyState>
{:else}
	<DataList>
		{#each nodes as node (node.id)}
			{@const state = treeNodeState(node)}
			<DataListRow title={node.name}>
				{#if node.archivedAt || node.status !== 'active'}
					<Badge tone={state.tone}>{state.label}</Badge>
				{/if}
				{#snippet actions()}
					{#if node.archivedAt}
						<Button size="sm" variant="secondary" onclick={() => restore(node)}>Restaurar</Button>
					{:else}
						<Button
							size="sm"
							variant="ghost"
							icon="edit"
							aria-label="Editar {node.name}"
							onclick={() => startEdit(node)}
						/>
						<Button
							size="sm"
							variant="danger"
							icon="trash"
							aria-label="Archivar {node.name}"
							onclick={() => (toArchive = node)}
						/>
					{/if}
				{/snippet}
			</DataListRow>
		{/each}
	</DataList>
{/if}

<Modal
	bind:open={formOpen}
	title={formMode === 'create' ? `Nueva ${copy.singular}` : `Editar ${copy.singular}`}
	size="sm"
>
	<Field label="Nombre" bind:value={formName} required placeholder={copy.placeholder} />
	{#if formMode === 'edit'}
		<Field
			label="Estado"
			hint="Inactiva saca del POS todo lo que cuelga de ella, pero la deja en el catálogo."
		>
			{#snippet control({ id })}
				<select {id} bind:value={formStatus}>
					<option value="active">Activa</option>
					<option value="inactive">Inactiva</option>
				</select>
			{/snippet}
		</Field>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" disabled={saving} onclick={() => (formOpen = false)}>Cancelar</Button>
		<Button variant="primary" loading={saving} onclick={save}>
			{formMode === 'create' ? 'Crear' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={toArchive !== null}
	title="¿Archivar {copy.singular}?"
	message="«{toArchive?.name ??
		''}» y todo lo que cuelga de ella dejarán de aparecer en el POS. No se borra nada: sus hijos conservan su propio estado y vuelven tal cual al restaurarla."
	confirmLabel="Archivar"
	onconfirm={archive}
	onclose={() => (toArchive = null)}
/>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.filters :global(.field) {
		min-width: 200px;
	}
</style>
