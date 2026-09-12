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
	import { apiErrorMessage } from '$lib/errors.js';
	import { ACTIVE_STATUS, statusLabel } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	// Compañía → unidad de negocio → sucursal. Tres niveles que existían en
	// la base desde el principio y que solo se podían poblar con un seed.
	interface Company {
		id: number;
		name: string;
		taxId: string | null;
		status: string;
	}
	interface BusinessUnit {
		id: number;
		companyId: number;
		name: string;
		status: string;
	}
	interface Branch {
		id: number;
		businessUnitId: number;
		name: string;
		timezone: string;
		status: string;
	}

	type Level = 'company' | 'unit' | 'branch';

	let companies = $state<Company[]>([]);
	let units = $state<BusinessUnit[]>([]);
	let branches = $state<Branch[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let selectedCompanyId = $state<number | null>(null);
	let selectedUnitId = $state<number | null>(null);

	let formFor = $state<Level | null>(null);
	let name = $state('');
	let taxId = $state('');
	let saving = $state(false);

	let editingBranch = $state<Branch | null>(null);
	let branchName = $state('');
	let branchStatus = $state<'active' | 'inactive'>('active');
	let savingBranch = $state(false);

	const selectedCompany = $derived(companies.find((c) => c.id === selectedCompanyId) ?? null);
	const selectedUnit = $derived(units.find((u) => u.id === selectedUnitId) ?? null);

	const FORM_COPY: Record<Level, { title: string; placeholder: string }> = {
		company: { title: 'Nueva compañía', placeholder: 'Grupo Restaurantero' },
		unit: { title: 'Nueva unidad de negocio', placeholder: 'Marca o línea de negocio' },
		branch: { title: 'Nueva sucursal', placeholder: 'Sucursal Centro' },
	};

	async function loadCompanies() {
		const response = await apiFetch('/org/companies');
		if (!response.ok) {
			error =
				response.status === 403
					? 'No tienes permiso para administrar sucursales.'
					: 'No se pudieron cargar las compañías.';
			return;
		}
		companies = ((await response.json()) as { companies: Company[] }).companies;
	}

	async function loadUnits(companyId: number) {
		const response = await apiFetch(`/org/business-units?companyId=${companyId}`);
		if (response.ok) {
			units = ((await response.json()) as { businessUnits: BusinessUnit[] }).businessUnits;
		}
	}

	async function loadBranches(unitId: number) {
		const response = await apiFetch(`/org/branches?businessUnitId=${unitId}`);
		if (response.ok) {
			branches = ((await response.json()) as { branches: Branch[] }).branches;
		}
	}

	function selectCompany(id: number) {
		selectedCompanyId = id;
		selectedUnitId = null;
		branches = [];
		loadUnits(id);
	}

	function selectUnit(id: number) {
		selectedUnitId = id;
		loadBranches(id);
	}

	function startCreate(level: Level) {
		formFor = level;
		name = '';
		taxId = '';
	}

	async function save() {
		const level = formFor;
		const value = name.trim();
		if (!level || !value) return;

		const endpoint =
			level === 'company'
				? '/org/companies'
				: level === 'unit'
					? '/org/business-units'
					: '/org/branches';
		const body =
			level === 'company'
				? { name: value, taxId: taxId.trim() || undefined }
				: level === 'unit'
					? { companyId: selectedCompanyId, name: value }
					: { businessUnitId: selectedUnitId, name: value };

		saving = true;
		try {
			const response = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar.'));
				return;
			}
			formFor = null;
			if (level === 'company') {
				await loadCompanies();
			} else if (level === 'unit' && selectedCompanyId !== null) {
				await loadUnits(selectedCompanyId);
			} else if (level === 'branch' && selectedUnitId !== null) {
				await loadBranches(selectedUnitId);
			}
			toasts.success(`«${value}» creada.`);
		} finally {
			saving = false;
		}
	}

	function startEditBranch(branch: Branch) {
		editingBranch = branch;
		branchName = branch.name;
		branchStatus = branch.status === 'inactive' ? 'inactive' : 'active';
	}

	async function saveBranch() {
		const branch = editingBranch;
		const value = branchName.trim();
		if (!branch || !value) return;
		savingBranch = true;
		try {
			const response = await apiFetch(`/org/branches/${branch.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: value, status: branchStatus }),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar la sucursal.'));
				return;
			}
			editingBranch = null;
			if (selectedUnitId !== null) await loadBranches(selectedUnitId);
			toasts.success(`Sucursal «${value}» actualizada.`);
		} finally {
			savingBranch = false;
		}
	}

	$effect(() => {
		loadCompanies().finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Sucursales"
	description="Una compañía agrupa unidades de negocio, y cada unidad agrupa sucursales. Los datos del sistema —mesas, órdenes, ventas— cuelgan siempre de una sucursal."
>
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={() => startCreate('company')}>
			Nueva compañía
		</Button>
	{/snippet}
</PageHeader>

{#if error}
	<p role="alert">{error}</p>
{:else if loading}
	<Skeleton lines={4} />
{:else if companies.length === 0}
	<EmptyState
		icon="home"
		title="No hay compañías"
		description="Todo cuelga de una compañía: créala primero, luego su unidad de negocio y por último la sucursal."
	>
		{#snippet action()}
			<Button variant="primary" icon="plus" onclick={() => startCreate('company')}>
				Crear compañía
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	<div class="columns">
		<div class="col">
			<h2>Compañías</h2>
			<DataList>
				{#each companies as company (company.id)}
					<DataListRow
						title={company.name}
						meta={company.taxId ?? undefined}
						selected={company.id === selectedCompanyId}
						onclick={() => selectCompany(company.id)}
					/>
				{/each}
			</DataList>
		</div>

		<div class="col">
			<div class="col-header">
				<h2>Unidades de negocio</h2>
				{#if selectedCompanyId !== null}
					<Button size="sm" variant="ghost" icon="plus" onclick={() => startCreate('unit')}>
						Nueva
					</Button>
				{/if}
			</div>
			{#if selectedCompany === null}
				<p class="muted">Elige una compañía.</p>
			{:else if units.length === 0}
				<p class="muted">Esta compañía no tiene unidades.</p>
			{:else}
				<DataList>
					{#each units as unit (unit.id)}
						<DataListRow
							title={unit.name}
							selected={unit.id === selectedUnitId}
							onclick={() => selectUnit(unit.id)}
						/>
					{/each}
				</DataList>
			{/if}
		</div>

		<div class="col">
			<div class="col-header">
				<h2>Sucursales</h2>
				{#if selectedUnitId !== null}
					<Button size="sm" variant="ghost" icon="plus" onclick={() => startCreate('branch')}>
						Nueva
					</Button>
				{/if}
			</div>
			{#if selectedUnit === null}
				<p class="muted">Elige una unidad de negocio.</p>
			{:else if branches.length === 0}
				<p class="muted">Esta unidad no tiene sucursales.</p>
			{:else}
				<DataList>
					{#each branches as branch (branch.id)}
						{@const status = statusLabel(ACTIVE_STATUS, branch.status)}
						<DataListRow title={branch.name} meta={branch.timezone}>
							<Badge tone={status.tone}>{status.label}</Badge>
							{#snippet actions()}
								<Button
									size="sm"
									variant="ghost"
									icon="edit"
									aria-label="Editar {branch.name}"
									onclick={() => startEditBranch(branch)}
								/>
							{/snippet}
						</DataListRow>
					{/each}
				</DataList>
			{/if}
		</div>
	</div>
{/if}

<Modal
	open={formFor !== null}
	title={formFor ? FORM_COPY[formFor].title : ''}
	size="sm"
	onclose={() => (formFor = null)}
>
	<Field
		label="Nombre"
		bind:value={name}
		required
		placeholder={formFor ? FORM_COPY[formFor].placeholder : ''}
	/>
	{#if formFor === 'company'}
		<Field label="RNC" bind:value={taxId} placeholder="131-00000-1" hint="Opcional." />
	{/if}
	{#snippet footer()}
		<Button variant="ghost" disabled={saving} onclick={() => (formFor = null)}>Cancelar</Button>
		<Button variant="primary" loading={saving} onclick={save}>Crear</Button>
	{/snippet}
</Modal>

<Modal
	open={editingBranch !== null}
	title="Editar sucursal"
	size="sm"
	onclose={() => (editingBranch = null)}
>
	<Field label="Nombre" bind:value={branchName} required />
	<Field
		label="Estado"
		hint="Una sucursal no se elimina: tiene órdenes y ventas colgando. Se da de baja."
	>
		{#snippet control({ id })}
			<select {id} bind:value={branchStatus}>
				<option value="active">Activa</option>
				<option value="inactive">Inactiva</option>
			</select>
		{/snippet}
	</Field>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingBranch} onclick={() => (editingBranch = null)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingBranch} onclick={saveBranch}>Guardar</Button>
	{/snippet}
</Modal>

<style>
	.columns {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-4);
		align-items: start;
	}

	.col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.col-header {
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

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
