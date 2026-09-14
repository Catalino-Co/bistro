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
	import { defaultParentId, parentOptionLabels } from '$lib/catalog/parents.js';
	import { itemState } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	interface TreeNode {
		id: number;
		name: string;
		status: 'active' | 'inactive';
		archivedAt: string | null;
	}
	interface Item {
		id: number;
		categoryId: number;
		name: string;
		price: string;
		taxRateId: number;
		stationId: number | null;
		usesModifiers: boolean;
		status: 'active' | 'inactive';
		archivedAt: string | null;
	}
	interface TaxRate {
		id: number;
		name: string;
	}
	interface ModifierGroup {
		id: number;
		name: string;
		selectionType: 'single' | 'multiple';
	}
	interface KitchenStation {
		id: number;
		name: string;
	}

	type StatusFilter = 'active' | 'inactive' | 'archived';
	type DetailTab = 'datos' | 'modificadores' | 'estacion';

	const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
		{ value: 'active', label: 'Activos' },
		{ value: 'inactive', label: 'Inactivos' },
		{ value: 'archived', label: 'Archivados' },
	];

	// Los tres selectores reemplazan a las tres columnas del árbol que ocupaban
	// la mitad de la pantalla para acabar siempre en lo mismo: elegir una
	// categoría. Piden `status=all` porque un ítem puede colgar de una rama
	// pausada, y si el selector solo ofreciera las activas ese ítem quedaría
	// fuera del alcance de la pantalla.
	let families = $state<TreeNode[]>([]);
	let subfamilies = $state<TreeNode[]>([]);
	let categories = $state<TreeNode[]>([]);
	let selectedFamilyId = $state<number | null>(null);
	let selectedSubfamilyId = $state<number | null>(null);
	let selectedCategoryId = $state<number | null>(null);

	let items = $state<Item[]>([]);
	let taxRates = $state<TaxRate[]>([]);
	let allModifierGroups = $state<ModifierGroup[]>([]);
	let itemModifierGroups = $state<ModifierGroup[]>([]);
	let kitchenStations = $state<KitchenStation[]>([]);
	let loading = $state(true);

	let selectedItemId = $state<number | null>(null);
	let detailTab = $state<DetailTab>('datos');
	let statusFilter = $state<StatusFilter>('active');

	// Un solo juego de estado para alta y edición: el formulario es el mismo y
	// tenerlo duplicado era la vía rápida a que se separaran.
	let formOpen = $state(false);
	let formMode = $state<'create' | 'edit'>('create');
	let editingItemId = $state<number | null>(null);
	let itemName = $state('');
	let itemPrice = $state('');
	let itemTaxRateId = $state<number | null>(null);
	let itemStationId = $state<number | null>(null);
	let itemStatus = $state<'active' | 'inactive'>('active');
	let saving = $state(false);

	let toArchive = $state<Item | null>(null);
	let modifierGroupToAssociate = $state<number | null>(null);

	const selectedItem = $derived(items.find((item) => item.id === selectedItemId) ?? null);
	const familyLabels = $derived(parentOptionLabels(families));
	const subfamilyLabels = $derived(parentOptionLabels(subfamilies));
	const categoryLabels = $derived(parentOptionLabels(categories));

	const selectedCategory = $derived(
		categories.find((category) => category.id === selectedCategoryId) ?? null,
	);

	function stationName(stationId: number | null): string {
		if (stationId === null) return 'Sin estación';
		return kitchenStations.find((s) => s.id === stationId)?.name ?? `Estación #${stationId}`;
	}

	function taxRateName(taxRateId: number): string {
		return taxRates.find((t) => t.id === taxRateId)?.name ?? `Impuesto #${taxRateId}`;
	}

	function money(value: string): string {
		return `RD$ ${Number(value).toFixed(2)}`;
	}

	function archivedOn(item: Item): string {
		return new Date(item.archivedAt!).toLocaleDateString('es-DO', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
		});
	}

	async function loadFamilies() {
		const response = await apiFetch('/catalog/families?status=all');
		if (response.ok) {
			families = ((await response.json()) as { families: TreeNode[] }).families;
			if (selectedFamilyId === null) selectedFamilyId = defaultParentId(families);
		}
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

	async function loadCategories() {
		if (selectedSubfamilyId === null) {
			categories = [];
			selectedCategoryId = null;
			return;
		}
		const response = await apiFetch(
			`/catalog/categories?subfamilyId=${selectedSubfamilyId}&status=all`,
		);
		if (response.ok) {
			categories = ((await response.json()) as { categories: TreeNode[] }).categories;
			if (!categories.some((category) => category.id === selectedCategoryId)) {
				selectedCategoryId = defaultParentId(categories);
			}
		}
	}

	async function loadItems() {
		selectedItemId = null;
		if (selectedCategoryId === null) {
			items = [];
			return;
		}
		const response = await apiFetch(
			`/catalog/items?categoryId=${selectedCategoryId}&status=${statusFilter}`,
		);
		if (response.ok) {
			items = ((await response.json()) as { items: Item[] }).items;
		}
	}

	async function loadTaxRates() {
		const response = await apiFetch('/catalog/tax-rates');
		if (response.ok) {
			taxRates = ((await response.json()) as { taxRates: TaxRate[] }).taxRates;
			if (itemTaxRateId === null && taxRates.length > 0) itemTaxRateId = taxRates[0]!.id;
		}
	}

	async function loadKitchenStations() {
		const response = await apiFetch('/catalog/kitchen-stations');
		if (response.ok) {
			kitchenStations = ((await response.json()) as { kitchenStations: KitchenStation[] })
				.kitchenStations;
		}
	}

	async function loadAllModifierGroups() {
		const response = await apiFetch('/modifiers/groups');
		if (response.ok) {
			allModifierGroups = ((await response.json()) as { groups: ModifierGroup[] }).groups;
			if (modifierGroupToAssociate === null && allModifierGroups.length > 0) {
				modifierGroupToAssociate = allModifierGroups[0]!.id;
			}
		}
	}

	async function loadItemModifierGroups(itemId: number) {
		const response = await apiFetch(`/catalog/items/${itemId}/modifier-groups`);
		if (response.ok) {
			itemModifierGroups = ((await response.json()) as { groups: ModifierGroup[] }).groups;
		}
	}

	async function changeFamily() {
		await loadSubfamilies();
		await loadCategories();
		await loadItems();
	}

	async function changeSubfamily() {
		await loadCategories();
		await loadItems();
	}

	function selectItem(id: number) {
		selectedItemId = id;
		detailTab = 'datos';
		loadItemModifierGroups(id);
	}

	function startCreate() {
		formMode = 'create';
		editingItemId = null;
		itemName = '';
		itemPrice = '';
		itemStationId = null;
		itemStatus = 'active';
		formOpen = true;
	}

	function startEdit(item: Item) {
		formMode = 'edit';
		editingItemId = item.id;
		itemName = item.name;
		itemPrice = Number(item.price).toFixed(2);
		itemTaxRateId = item.taxRateId;
		itemStatus = item.status;
		formOpen = true;
	}

	async function save() {
		const name = itemName.trim();
		const price = itemPrice.trim();
		if (!name || !price || selectedCategoryId === null || itemTaxRateId === null) return;

		const editing = formMode === 'edit' && editingItemId !== null;
		saving = true;
		try {
			const response = await apiFetch(
				editing ? `/catalog/items/${editingItemId}` : '/catalog/items',
				{
					method: editing ? 'PATCH' : 'POST',
					body: JSON.stringify(
						editing
							? { name, price, taxRateId: itemTaxRateId, status: itemStatus }
							: {
									categoryId: selectedCategoryId,
									name,
									price,
									taxRateId: itemTaxRateId,
									stationId: itemStationId ?? undefined,
								},
					),
				},
			);
			if (!response.ok) {
				toasts.error(
					await apiErrorMessage(
						response,
						editing ? 'No se pudo guardar el ítem.' : 'No se pudo crear el ítem.',
					),
				);
				return;
			}
			formOpen = false;
			await loadItems();
			toasts.success(editing ? `Ítem «${name}» actualizado.` : `Ítem «${name}» creado.`);
		} finally {
			saving = false;
		}
	}

	async function archiveItem() {
		const item = toArchive;
		if (!item) return;
		const response = await apiFetch(`/catalog/items/${item.id}/archive`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo archivar el ítem.'));
			return;
		}
		await loadItems();
		toasts.success(`«${item.name}» archivado. Lo encuentras en el filtro Archivados.`);
	}

	async function restoreItem(item: Item) {
		const response = await apiFetch(`/catalog/items/${item.id}/restore`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo restaurar el ítem.'));
			return;
		}
		await loadItems();
		toasts.success(`«${item.name}» restaurado como inactivo. Actívalo para volver a venderlo.`);
	}

	async function setItemStation(stationId: number | null) {
		if (selectedItemId === null) return;
		const current = selectedItemId;
		const response = await apiFetch(`/catalog/items/${current}/station`, {
			method: 'PATCH',
			body: JSON.stringify({ stationId }),
		});
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo cambiar la estación.'));
			return;
		}
		await loadItems();
		// `loadItems` limpia la selección; el ítem cuya estación se acaba de
		// cambiar se queda abierto, que es donde está mirando quien lo hizo.
		selectedItemId = current;
		toasts.success(
			stationId === null
				? 'El ítem ya no se enruta a ninguna estación.'
				: `El ítem se enruta a ${stationName(stationId)}.`,
		);
	}

	/**
	 * El interruptor no borra las asociaciones: apagarlo deja de ofrecer los
	 * modificadores en el POS, y encenderlo los devuelve tal cual estaban. Es
	 * la misma idea que archivar en vez de borrar, a escala de un ítem.
	 */
	async function setUsesModifiers(usesModifiers: boolean) {
		if (selectedItemId === null) return;
		const current = selectedItemId;
		const response = await apiFetch(`/catalog/items/${current}`, {
			method: 'PATCH',
			body: JSON.stringify({ usesModifiers }),
		});
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo cambiar el ítem.'));
			return;
		}
		await loadItems();
		selectedItemId = current;
		toasts.success(
			usesModifiers
				? 'Este ítem vuelve a ofrecer sus modificadores.'
				: 'Este ítem deja de ofrecer modificadores en el POS.',
		);
	}

	async function removeModifierGroup(groupId: number, name: string) {
		if (selectedItemId === null) return;
		const response = await apiFetch(
			`/catalog/items/${selectedItemId}/modifier-groups/${groupId}`,
			{ method: 'DELETE' },
		);
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo quitar el grupo.'));
			return;
		}
		await loadItemModifierGroups(selectedItemId);
		toasts.success(`«${name}» ya no aplica a este ítem.`);
	}

	async function associateModifierGroup() {
		if (selectedItemId === null || modifierGroupToAssociate === null) return;
		const response = await apiFetch('/catalog/items/modifier-groups', {
			method: 'POST',
			body: JSON.stringify({ itemId: selectedItemId, modifierGroupId: modifierGroupToAssociate }),
		});
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo asociar el grupo.'));
			return;
		}
		await loadItemModifierGroups(selectedItemId);
		toasts.success('Grupo de modificadores asociado al ítem.');
	}

	$effect(() => {
		Promise.all([loadTaxRates(), loadAllModifierGroups(), loadKitchenStations()])
			.then(() => loadFamilies())
			.then(() => loadSubfamilies())
			.then(() => loadCategories())
			.then(() => loadItems())
			.finally(() => {
				loading = false;
			});
	});
</script>

<PageHeader
	title="Ítems"
	description="Lo que se vende. Cada ítem cuelga de una categoría y lleva su precio, su impuesto y su estación de cocina."
>
	{#snippet actions()}
		{#if selectedCategoryId !== null && statusFilter !== 'archived'}
			<Button variant="primary" icon="plus" onclick={startCreate}>Nuevo ítem</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="filters">
	<Field label="Familia">
		{#snippet control({ id })}
			<select {id} bind:value={selectedFamilyId} onchange={changeFamily}>
				{#each families as family (family.id)}
					<option value={family.id}>{familyLabels.get(family.id)}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field label="Subfamilia">
		{#snippet control({ id })}
			<select {id} bind:value={selectedSubfamilyId} onchange={changeSubfamily}>
				{#each subfamilies as subfamily (subfamily.id)}
					<option value={subfamily.id}>{subfamilyLabels.get(subfamily.id)}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field label="Categoría">
		{#snippet control({ id })}
			<select {id} bind:value={selectedCategoryId} onchange={() => loadItems()}>
				{#each categories as category (category.id)}
					<option value={category.id}>{categoryLabels.get(category.id)}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field label="Estado">
		{#snippet control({ id })}
			<select {id} bind:value={statusFilter} onchange={() => loadItems()}>
				{#each STATUS_FILTERS as filter (filter.value)}
					<option value={filter.value}>{filter.label}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
</div>

{#if loading}
	<Skeleton lines={5} />
{:else if selectedCategoryId === null}
	<EmptyState
		icon="catalog"
		title="No hay categorías donde colgar un ítem"
		description="Crea primero una familia, una subfamilia y una categoría."
	/>
{:else}
	<div class="columns">
		<div class="col">
			{#if items.length === 0}
				<EmptyState
					icon="plate"
					title={statusFilter === 'active'
						? `«${selectedCategory?.name ?? ''}» no tiene ítems activos`
						: statusFilter === 'inactive'
							? 'Ninguno en pausa'
							: 'Nada archivado aquí'}
					description={statusFilter === 'active'
						? 'Añade el primero para que aparezca en el POS.'
						: 'Cambia el filtro de estado para ver los demás.'}
				>
					{#snippet action()}
						{#if statusFilter === 'active'}
							<Button variant="primary" icon="plus" onclick={startCreate}>Crear ítem</Button>
						{/if}
					{/snippet}
				</EmptyState>
			{:else}
				<DataList>
					{#each items as item (item.id)}
						{@const state = itemState(item)}
						<DataListRow
							title={item.name}
							meta={money(item.price)}
							selected={item.id === selectedItemId}
							onclick={() => selectItem(item.id)}
						>
							{#if item.archivedAt || item.status !== 'active'}
								<Badge tone={state.tone}>{state.label}</Badge>
							{:else if item.stationId === null}
								<Badge tone="warning">Sin estación</Badge>
							{:else}
								<Badge tone="neutral">{stationName(item.stationId)}</Badge>
							{/if}
						</DataListRow>
					{/each}
				</DataList>
			{/if}
		</div>

		<div class="col">
			{#if selectedItem === null}
				<EmptyState
					icon="plate"
					title="Ningún ítem seleccionado"
					description="Elige un ítem para ver sus datos, sus modificadores y su estación de cocina."
				/>
			{:else}
				<article class="panel">
					<header class="panel-header">
						<div>
							<h2>{selectedItem.name}</h2>
							<p class="muted">
								{money(selectedItem.price)} · {taxRateName(selectedItem.taxRateId)}
								{#if selectedItem.archivedAt}
									· archivado el {archivedOn(selectedItem)}
								{/if}
							</p>
						</div>
						<div class="panel-actions">
							{#if selectedItem.archivedAt}
								<Button variant="secondary" onclick={() => restoreItem(selectedItem!)}>
									Restaurar
								</Button>
							{:else}
								<Button variant="secondary" icon="edit" onclick={() => startEdit(selectedItem!)}>
									Editar
								</Button>
								<Button variant="danger" onclick={() => (toArchive = selectedItem)}>
									Archivar
								</Button>
							{/if}
						</div>
					</header>

					<!-- Un ítem archivado es de solo lectura: escribirle modificadores o
					     estación a algo que nadie ve es confusión pura.
					     Se quita del DOM en vez de usar el atributo `hidden`: la regla
					     `display: flex` de abajo le gana al `display: none` que el
					     navegador aplica por defecto a `[hidden]`, así que el atributo
					     solo no oculta nada. -->
					{#if selectedItem.archivedAt === null}
						<div class="panel-tabs" role="tablist" aria-label="Detalle del ítem">
							{#each [['datos', 'Datos'], ['modificadores', 'Modificadores'], ['estacion', 'Estación']] as tab (tab[0])}
								<button
									type="button"
									data-unstyled
									role="tab"
									class="panel-tab"
									class:active={detailTab === tab[0]}
									aria-selected={detailTab === tab[0]}
									onclick={() => (detailTab = tab[0] as DetailTab)}
								>
									{tab[1]}
								</button>
							{/each}
						</div>
					{/if}

					<div class="panel-body">
						{#if detailTab === 'datos' || selectedItem.archivedAt}
							<dl class="facts">
								<dt>Precio</dt>
								<dd>{money(selectedItem.price)}</dd>
								<dt>Impuesto</dt>
								<dd>{taxRateName(selectedItem.taxRateId)}</dd>
								<dt>Estación</dt>
								<dd>{stationName(selectedItem.stationId)}</dd>
							</dl>
							{#if selectedItem.archivedAt}
								<p class="muted">
									Archivado: no aparece en el POS ni en el catálogo. Su historial de ventas está
									intacto. Restáuralo para poder editarlo.
								</p>
							{/if}
						{:else if detailTab === 'modificadores'}
							<label class="toggle">
								<input
									type="checkbox"
									checked={selectedItem.usesModifiers}
									onchange={(event) => setUsesModifiers(event.currentTarget.checked)}
								/>
								<span>
									<span class="toggle-label">Este ítem lleva modificadores</span>
									<span class="toggle-hint">
										{selectedItem.usesModifiers
											? 'Al pedirlo, el POS ofrece los grupos de abajo.'
											: 'Apagado: el POS no ofrece ninguno. Los grupos se conservan.'}
									</span>
								</span>
							</label>

							{#if itemModifierGroups.length === 0}
								<p class="muted">Este ítem no tiene grupos de modificadores.</p>
							{:else}
								<DataList>
									{#each itemModifierGroups as group (group.id)}
										<DataListRow title={group.name}>
											<Badge tone="neutral">
												{group.selectionType === 'single' ? 'Elige uno' : 'Elige varios'}
											</Badge>
											{#snippet actions()}
												<Button
													size="sm"
													variant="ghost"
													icon="trash"
													aria-label="Quitar {group.name} de este ítem"
													onclick={() => removeModifierGroup(group.id, group.name)}
												/>
											{/snippet}
										</DataListRow>
									{/each}
								</DataList>
							{/if}

							{#if allModifierGroups.length === 0}
								<p class="muted">
									Todavía no hay grupos creados. Se crean en Catálogo → Modificadores.
								</p>
							{:else}
								<div class="inline-form">
									<Field label="Asociar un grupo">
										{#snippet control({ id })}
											<select {id} bind:value={modifierGroupToAssociate}>
												{#each allModifierGroups as group (group.id)}
													<option value={group.id}>{group.name}</option>
												{/each}
											</select>
										{/snippet}
									</Field>
									<Button variant="secondary" icon="plus" onclick={associateModifierGroup}>
										Asociar
									</Button>
								</div>
							{/if}
						{:else}
							<p class="muted">
								La estación decide a qué impresora y a qué tablero de cocina va este ítem cuando se
								envía la comanda.
							</p>
							<div class="inline-form">
								<Field label="Estación de cocina">
									{#snippet control({ id })}
										<select
											{id}
											value={selectedItem.stationId ?? ''}
											onchange={(event) =>
												setItemStation(
													event.currentTarget.value === ''
														? null
														: Number(event.currentTarget.value),
												)}
										>
											<option value="">Sin estación</option>
											{#each kitchenStations as station (station.id)}
												<option value={station.id}>{station.name}</option>
											{/each}
										</select>
									{/snippet}
								</Field>
							</div>
							{#if kitchenStations.length === 0}
								<p class="muted">
									No hay estaciones creadas. Se crean en Ajustes → Estaciones e impresoras.
								</p>
							{/if}
						{/if}
					</div>
				</article>
			{/if}
		</div>
	</div>
{/if}

<Modal
	bind:open={formOpen}
	title={formMode === 'create' ? 'Nuevo ítem' : 'Editar ítem'}
	description={selectedCategory?.name}
>
	<Field label="Nombre" bind:value={itemName} required placeholder="Mofongo de camarones" />
	<Field
		label="Precio"
		bind:value={itemPrice}
		required
		inputmode="decimal"
		placeholder="595.00"
		hint="En pesos, sin impuesto."
	/>
	<Field label="Impuesto">
		{#snippet control({ id })}
			<select {id} bind:value={itemTaxRateId}>
				{#each taxRates as taxRate (taxRate.id)}
					<option value={taxRate.id}>{taxRate.name}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	{#if formMode === 'create'}
		<Field label="Estación de cocina" hint="Opcional. Se puede asignar después.">
			{#snippet control({ id })}
				<select {id} bind:value={itemStationId}>
					<option value={null}>Sin estación</option>
					{#each kitchenStations as station (station.id)}
						<option value={station.id}>{station.name}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
	{:else}
		<Field
			label="Estado"
			hint="Inactivo lo saca del POS pero lo deja en el catálogo, listo para volver."
		>
			{#snippet control({ id })}
				<select {id} bind:value={itemStatus}>
					<option value="active">Activo</option>
					<option value="inactive">Inactivo</option>
				</select>
			{/snippet}
		</Field>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" disabled={saving} onclick={() => (formOpen = false)}>Cancelar</Button>
		<Button variant="primary" loading={saving} onclick={save}>
			{formMode === 'create' ? 'Crear ítem' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={toArchive !== null}
	title="¿Archivar el ítem?"
	message="«{toArchive?.name ??
		''}» dejará de aparecer en el POS y en el catálogo. No se borra: el historial de ventas y las órdenes abiertas lo conservan, y puedes restaurarlo desde el filtro Archivados."
	confirmLabel="Archivar"
	onconfirm={archiveItem}
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
		min-width: 150px;
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(240px, 340px) 1fr;
		gap: var(--space-5);
		align-items: start;
	}

	.col {
		min-width: 0;
	}

	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
	}

	.panel-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border);
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.muted {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.panel-tabs {
		display: flex;
		gap: var(--space-1);
		padding: 0 var(--space-4);
		border-bottom: 1px solid var(--color-border);
		/* `overflow-x: auto` a secas también pone `overflow-y: auto`, y el
		   navegador reserva 15px para una barra vertical que nunca hace falta.
		   Se veía como un muñón de scrollbar pegado a «Estación». */
		overflow-x: auto;
		overflow-y: hidden;
	}

	/* `data-unstyled` apaga los estilos de botón de la app, pero NO los del
	   navegador: sin estos cuatro reinicios, las pestañas salen como cajas
	   grises con su fondo `buttonface` de serie. */
	.panel-tab {
		min-height: var(--touch-min);
		padding: 0 var(--space-3);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		border-radius: 0;
		color: var(--color-text-muted);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.panel-tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.panel-tab:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-1) var(--space-4);
		margin: 0;
	}

	.facts dt {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.facts dd {
		margin: 0;
		font-weight: 600;
	}

	/* `flex-direction` y el color van explicitos: `tokens.css` tiene un
	   `label { display: inline-flex; flex-direction: column; color: muted }`
	   global, y los estilos de componente de Svelte se compilan con
	   `:where()`, que no suma especificidad. El selector de elemento gana. */
	.toggle {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: var(--space-3);
		color: var(--color-text);
		font-size: var(--text-md);
		padding: var(--space-3);
		background: var(--color-surface-sunk);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.toggle input {
		margin-top: 2px;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.toggle span {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.toggle-label {
		font-weight: 600;
	}

	.toggle-hint {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.inline-form {
		display: flex;
		align-items: flex-end;
		gap: var(--space-3);
	}

	.inline-form :global(.field) {
		flex: 1;
		min-width: 0;
	}

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
