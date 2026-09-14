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
	import Skeleton from '$lib/components/Skeleton.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { itemState } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	interface Category {
		id: number;
		name: string;
	}
	interface Family {
		id: number;
		categoryId: number;
		name: string;
	}
	interface Subfamily {
		id: number;
		familyId: number;
		name: string;
	}
	interface Item {
		id: number;
		subfamilyId: number;
		name: string;
		price: string;
		taxRateId: number;
		stationId: number | null;
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

	type Level = 'category' | 'family' | 'subfamily';
	type DetailTab = 'datos' | 'modificadores' | 'estacion';
	type ItemStatusFilter = 'active' | 'inactive' | 'archived';

	const ITEM_FILTERS: { value: ItemStatusFilter; label: string }[] = [
		{ value: 'active', label: 'Activos' },
		{ value: 'inactive', label: 'Inactivos' },
		{ value: 'archived', label: 'Archivados' },
	];

	let categories = $state<Category[]>([]);
	let families = $state<Family[]>([]);
	let subfamilies = $state<Subfamily[]>([]);
	let items = $state<Item[]>([]);
	let taxRates = $state<TaxRate[]>([]);
	let allModifierGroups = $state<ModifierGroup[]>([]);
	let itemModifierGroups = $state<ModifierGroup[]>([]);
	let kitchenStations = $state<KitchenStation[]>([]);
	let loading = $state(true);

	let selectedCategoryId = $state<number | null>(null);
	let selectedFamilyId = $state<number | null>(null);
	let selectedSubfamilyId = $state<number | null>(null);
	let selectedItemId = $state<number | null>(null);
	let detailTab = $state<DetailTab>('datos');

	// --- alta de niveles del árbol ---
	let levelFormFor = $state<Level | null>(null);
	let levelName = $state('');
	let savingLevel = $state(false);

	// --- alta y edición de ítems ---
	// Un solo juego de estado para las dos cosas: el formulario es el mismo y
	// tenerlo duplicado era la vía rápida a que se separaran.
	let itemFormOpen = $state(false);
	let itemFormMode = $state<'create' | 'edit'>('create');
	let editingItemId = $state<number | null>(null);
	let itemName = $state('');
	let itemPrice = $state('');
	let itemTaxRateId = $state<number | null>(null);
	let itemStationId = $state<number | null>(null);
	let itemStatus = $state<'active' | 'inactive'>('active');
	let savingItem = $state(false);

	let itemStatusFilter = $state<ItemStatusFilter>('active');
	let itemToArchive = $state<Item | null>(null);

	let modifierGroupToAssociate = $state<number | null>(null);

	const selectedItem = $derived(items.find((item) => item.id === selectedItemId) ?? null);
	const selectedSubfamily = $derived(
		subfamilies.find((subfamily) => subfamily.id === selectedSubfamilyId) ?? null,
	);

	const LEVEL_COPY: Record<Level, { title: string; placeholder: string }> = {
		category: { title: 'Nueva categoría', placeholder: 'Comidas, Bebidas…' },
		family: { title: 'Nueva familia', placeholder: 'Carnes, Cervezas…' },
		subfamily: { title: 'Nueva subfamilia', placeholder: 'Res, Nacionales…' },
	};

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

	async function loadCategories() {
		const response = await apiFetch('/catalog/categories');
		if (response.ok) {
			categories = ((await response.json()) as { categories: Category[] }).categories;
		}
	}

	async function loadTaxRates() {
		const response = await apiFetch('/catalog/tax-rates');
		if (response.ok) {
			taxRates = ((await response.json()) as { taxRates: TaxRate[] }).taxRates;
			if (itemTaxRateId === null && taxRates.length > 0) {
				itemTaxRateId = taxRates[0]!.id;
			}
		}
	}

	async function loadFamilies(categoryId: number) {
		const response = await apiFetch(`/catalog/families?categoryId=${categoryId}`);
		if (response.ok) {
			families = ((await response.json()) as { families: Family[] }).families;
		}
	}

	async function loadSubfamilies(familyId: number) {
		const response = await apiFetch(`/catalog/subfamilies?familyId=${familyId}`);
		if (response.ok) {
			subfamilies = ((await response.json()) as { subfamilies: Subfamily[] }).subfamilies;
		}
	}

	async function loadItems(subfamilyId: number) {
		const response = await apiFetch(
			`/catalog/items?subfamilyId=${subfamilyId}&status=${itemStatusFilter}`,
		);
		if (response.ok) {
			items = ((await response.json()) as { items: Item[] }).items;
		}
	}

	function changeItemFilter() {
		selectedItemId = null;
		if (selectedSubfamilyId !== null) loadItems(selectedSubfamilyId);
	}

	function archivedOn(item: Item): string {
		return new Date(item.archivedAt!).toLocaleDateString('es-DO', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
		});
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

	function selectCategory(id: number) {
		selectedCategoryId = id;
		selectedFamilyId = null;
		selectedSubfamilyId = null;
		selectedItemId = null;
		subfamilies = [];
		items = [];
		loadFamilies(id);
	}

	function selectFamily(id: number) {
		selectedFamilyId = id;
		selectedSubfamilyId = null;
		selectedItemId = null;
		items = [];
		loadSubfamilies(id);
	}

	function selectSubfamily(id: number) {
		selectedSubfamilyId = id;
		selectedItemId = null;
		loadItems(id);
	}

	function selectItem(id: number) {
		selectedItemId = id;
		detailTab = 'datos';
		loadItemModifierGroups(id);
	}

	function startCreateLevel(level: Level) {
		levelFormFor = level;
		levelName = '';
	}

	async function saveLevel() {
		const level = levelFormFor;
		const name = levelName.trim();
		if (!level || !name) return;

		const endpoint =
			level === 'category'
				? '/catalog/categories'
				: level === 'family'
					? '/catalog/families'
					: '/catalog/subfamilies';
		const body =
			level === 'category'
				? { name }
				: level === 'family'
					? { categoryId: selectedCategoryId, name }
					: { familyId: selectedFamilyId, name };

		savingLevel = true;
		try {
			const response = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar.'));
				return;
			}
			levelFormFor = null;
			if (level === 'category') {
				await loadCategories();
			} else if (level === 'family' && selectedCategoryId !== null) {
				await loadFamilies(selectedCategoryId);
			} else if (level === 'subfamily' && selectedFamilyId !== null) {
				await loadSubfamilies(selectedFamilyId);
			}
			toasts.success(`«${name}» creada.`);
		} finally {
			savingLevel = false;
		}
	}

	function startCreateItem() {
		itemFormMode = 'create';
		editingItemId = null;
		itemName = '';
		itemPrice = '';
		itemStationId = null;
		itemStatus = 'active';
		itemFormOpen = true;
	}

	function startEditItem(item: Item) {
		itemFormMode = 'edit';
		editingItemId = item.id;
		itemName = item.name;
		itemPrice = Number(item.price).toFixed(2);
		itemTaxRateId = item.taxRateId;
		itemStatus = item.status;
		itemFormOpen = true;
	}

	async function saveItem() {
		const name = itemName.trim();
		const price = itemPrice.trim();
		if (!name || !price || selectedSubfamilyId === null || itemTaxRateId === null) return;

		const editing = itemFormMode === 'edit' && editingItemId !== null;
		savingItem = true;
		try {
			const response = await apiFetch(
				editing ? `/catalog/items/${editingItemId}` : '/catalog/items',
				{
					method: editing ? 'PATCH' : 'POST',
					body: JSON.stringify(
						editing
							? { name, price, taxRateId: itemTaxRateId, status: itemStatus }
							: {
									subfamilyId: selectedSubfamilyId,
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
			itemFormOpen = false;
			await loadItems(selectedSubfamilyId);
			toasts.success(editing ? `Ítem «${name}» actualizado.` : `Ítem «${name}» creado.`);
		} finally {
			savingItem = false;
		}
	}

	async function archiveItem() {
		const item = itemToArchive;
		if (!item || selectedSubfamilyId === null) return;
		const response = await apiFetch(`/catalog/items/${item.id}/archive`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo archivar el ítem.'));
			return;
		}
		selectedItemId = null;
		await loadItems(selectedSubfamilyId);
		toasts.success(`«${item.name}» archivado. Lo encuentras en el filtro Archivados.`);
	}

	async function restoreItem(item: Item) {
		if (selectedSubfamilyId === null) return;
		const response = await apiFetch(`/catalog/items/${item.id}/restore`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo restaurar el ítem.'));
			return;
		}
		selectedItemId = null;
		await loadItems(selectedSubfamilyId);
		toasts.success(`«${item.name}» restaurado como inactivo. Actívalo para volver a venderlo.`);
	}

	async function setItemStation(stationId: number | null) {
		if (selectedItemId === null || selectedSubfamilyId === null) return;
		const response = await apiFetch(`/catalog/items/${selectedItemId}/station`, {
			method: 'PATCH',
			body: JSON.stringify({ stationId }),
		});
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo cambiar la estación.'));
			return;
		}
		await loadItems(selectedSubfamilyId);
		toasts.success(
			stationId === null
				? 'El ítem ya no se enruta a ninguna estación.'
				: `El ítem se enruta a ${stationName(stationId)}.`,
		);
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
		Promise.all([
			loadCategories(),
			loadTaxRates(),
			loadAllModifierGroups(),
			loadKitchenStations(),
		]).finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Catálogo"
	description="El menú se organiza en tres niveles — categoría, familia y subfamilia — y los ítems cuelgan del último."
/>

{#if loading}
	<Skeleton lines={5} />
{:else}
	<!-- El árbol arriba, a lo ancho: se navega de izquierda a derecha y en
	     todo momento se ve dónde estás parado. -->
	<div class="tree">
		<div class="tree-col">
			<header>
				<h2>Categorías</h2>
				<Button
					size="sm"
					variant="ghost"
					icon="plus"
					aria-label="Nueva categoría"
					onclick={() => startCreateLevel('category')}
				/>
			</header>
			{#if categories.length === 0}
				<p class="muted">Sin categorías.</p>
			{:else}
				<DataList>
					{#each categories as category (category.id)}
						<DataListRow
							title={category.name}
							selected={category.id === selectedCategoryId}
							onclick={() => selectCategory(category.id)}
						/>
					{/each}
				</DataList>
			{/if}
		</div>

		<div class="tree-col">
			<header>
				<h2>Familias</h2>
				{#if selectedCategoryId !== null}
					<Button
						size="sm"
						variant="ghost"
						icon="plus"
						aria-label="Nueva familia"
						onclick={() => startCreateLevel('family')}
					/>
				{/if}
			</header>
			{#if selectedCategoryId === null}
				<p class="muted">Elige una categoría.</p>
			{:else if families.length === 0}
				<p class="muted">Sin familias.</p>
			{:else}
				<DataList>
					{#each families as family (family.id)}
						<DataListRow
							title={family.name}
							selected={family.id === selectedFamilyId}
							onclick={() => selectFamily(family.id)}
						/>
					{/each}
				</DataList>
			{/if}
		</div>

		<div class="tree-col">
			<header>
				<h2>Subfamilias</h2>
				{#if selectedFamilyId !== null}
					<Button
						size="sm"
						variant="ghost"
						icon="plus"
						aria-label="Nueva subfamilia"
						onclick={() => startCreateLevel('subfamily')}
					/>
				{/if}
			</header>
			{#if selectedFamilyId === null}
				<p class="muted">Elige una familia.</p>
			{:else if subfamilies.length === 0}
				<p class="muted">Sin subfamilias.</p>
			{:else}
				<DataList>
					{#each subfamilies as subfamily (subfamily.id)}
						<DataListRow
							title={subfamily.name}
							selected={subfamily.id === selectedSubfamilyId}
							onclick={() => selectSubfamily(subfamily.id)}
						/>
					{/each}
				</DataList>
			{/if}
		</div>
	</div>

	<!-- Maestro-detalle: los modificadores y la estación de un ítem estaban
	     siete bloques más abajo del clic; ahora salen junto al ítem. -->
	<div class="detail">
		<div class="detail-col">
			<header>
				<h2>Ítems{selectedSubfamily ? ` de ${selectedSubfamily.name}` : ''}</h2>
				<div class="item-actions">
					<select
						aria-label="Estado de los ítems"
						bind:value={itemStatusFilter}
						onchange={changeItemFilter}
					>
						{#each ITEM_FILTERS as filter (filter.value)}
							<option value={filter.value}>{filter.label}</option>
						{/each}
					</select>
					{#if selectedSubfamilyId !== null && itemStatusFilter !== 'archived'}
						<Button size="sm" variant="secondary" icon="plus" onclick={startCreateItem}>
							Nuevo ítem
						</Button>
					{/if}
				</div>
			</header>

			{#if selectedSubfamilyId === null}
				<EmptyState
					icon="catalog"
					title="Elige una subfamilia"
					description="Los ítems del menú cuelgan del tercer nivel del árbol."
				/>
			{:else if items.length === 0}
				<EmptyState
					icon="plate"
					title={itemStatusFilter === 'active'
						? 'Esta subfamilia no tiene ítems activos'
						: itemStatusFilter === 'inactive'
							? 'Ninguno en pausa'
							: 'Nada archivado aquí'}
					description={itemStatusFilter === 'active'
						? 'Añade el primero para que aparezca en el POS.'
						: 'Cambia el filtro de estado para ver los demás.'}
				>
					{#snippet action()}
						{#if itemStatusFilter === 'active'}
							<Button variant="primary" icon="plus" onclick={startCreateItem}>Crear ítem</Button>
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

		<div class="detail-col">
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
								<Button variant="secondary" icon="edit" onclick={() => startEditItem(selectedItem!)}>
									Editar
								</Button>
								<Button variant="danger" onclick={() => (itemToArchive = selectedItem)}>
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
							{#if itemModifierGroups.length === 0}
								<p class="muted">Este ítem no tiene grupos de modificadores.</p>
							{:else}
								<DataList>
									{#each itemModifierGroups as group (group.id)}
										<DataListRow title={group.name}>
											<Badge tone="neutral">
												{group.selectionType === 'single' ? 'Elige uno' : 'Elige varios'}
											</Badge>
										</DataListRow>
									{/each}
								</DataList>
							{/if}

							{#if allModifierGroups.length === 0}
								<p class="muted">
									Todavía no hay grupos creados. Créalos en la pestaña Modificadores.
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
													event.currentTarget.value === '' ? null : Number(event.currentTarget.value),
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
	open={levelFormFor !== null}
	title={levelFormFor ? LEVEL_COPY[levelFormFor].title : ''}
	size="sm"
	onclose={() => (levelFormFor = null)}
>
	<Field
		label="Nombre"
		bind:value={levelName}
		required
		placeholder={levelFormFor ? LEVEL_COPY[levelFormFor].placeholder : ''}
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingLevel} onclick={() => (levelFormFor = null)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingLevel} onclick={saveLevel}>Crear</Button>
	{/snippet}
</Modal>

<Modal
	bind:open={itemFormOpen}
	title={itemFormMode === 'create' ? 'Nuevo ítem' : 'Editar ítem'}
	description={selectedSubfamily?.name}
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
	{#if itemFormMode === 'create'}
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
		<Button variant="ghost" disabled={savingItem} onclick={() => (itemFormOpen = false)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingItem} onclick={saveItem}>
			{itemFormMode === 'create' ? 'Crear ítem' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={itemToArchive !== null}
	title="¿Archivar el ítem?"
	message="«{itemToArchive?.name ??
		''}» dejará de aparecer en el POS y en el catálogo. No se borra: el historial de ventas y las órdenes abiertas lo conservan, y puedes restaurarlo desde el filtro Archivados."
	confirmLabel="Archivar"
	onconfirm={archiveItem}
	onclose={() => (itemToArchive = null)}
/>

<style>
	.tree {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}

	.tree-col,
	.detail-col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.detail {
		display: grid;
		grid-template-columns: minmax(260px, 380px) 1fr;
		gap: var(--space-5);
		align-items: start;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: var(--control-h-md);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4) var(--space-3);
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.item-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.item-actions select {
		min-height: var(--control-h-sm);
		font-size: var(--text-sm);
	}

	.panel-tabs {
		display: flex;
		gap: var(--space-1);
		padding: 0 var(--space-4);
		border-bottom: 1px solid var(--color-border);
		overflow-x: auto;
	}

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

	.panel-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-4);
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

	.inline-form {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.inline-form :global(.field) {
		flex: 1;
		min-width: 180px;
	}

	@media (max-width: 900px) {
		.tree,
		.detail {
			grid-template-columns: 1fr;
		}
	}
</style>
