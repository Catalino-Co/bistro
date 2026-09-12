<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import { auditAction, entityLabel, fieldLabel, formatValue } from '$lib/audit.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	// La bitácora se escribía desde el primer día y no había forma de leerla:
	// saber quién cambió un permiso exigía entrar a la base de datos.
	interface AuditEntry {
		id: number;
		actionKey: string;
		entityType: string | null;
		entityId: string | null;
		beforeData: Record<string, unknown> | null;
		afterData: Record<string, unknown> | null;
		userId: number | null;
		userName: string | null;
		username: string | null;
		branchId: number | null;
		branchName: string | null;
		ipAddress: string | null;
		createdAt: string;
	}

	type Range = 'today' | 'week' | 'month' | 'all';

	const RANGES: { value: Range; label: string }[] = [
		{ value: 'today', label: 'Hoy' },
		{ value: 'week', label: '7 días' },
		{ value: 'month', label: '30 días' },
		{ value: 'all', label: 'Todo' },
	];

	let entries = $state<AuditEntry[]>([]);
	let actionKeys = $state<string[]>([]);
	let nextCursor = $state<number | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let noBranchSelected = $state(false);
	let notAllowed = $state(false);

	let range = $state<Range>('week');
	let actionKey = $state('');
	let search = $state('');
	let expanded = $state<number | null>(null);

	function rangeStart(value: Range): string | null {
		if (value === 'all') return null;
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		if (value === 'week') start.setDate(start.getDate() - 6);
		if (value === 'month') start.setDate(start.getDate() - 29);
		return start.toISOString();
	}

	function query(cursor: number | null): string {
		const params = new URLSearchParams({ limit: '50' });
		const from = rangeStart(range);
		if (from) params.set('from', from);
		if (actionKey) params.set('actionKey', actionKey);
		if (search.trim()) params.set('search', search.trim());
		if (cursor !== null) params.set('cursor', String(cursor));
		return `?${params.toString()}`;
	}

	function when(iso: string): string {
		return new Date(iso).toLocaleString('es-DO', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	/**
	 * Los campos que cambiaron, con su valor antes y después. Un evento sin
	 * `before` es una creación; sin `after`, un borrado.
	 */
	function changes(entry: AuditEntry): { key: string; before: unknown; after: unknown }[] {
		const keys = new Set([
			...Object.keys(entry.beforeData ?? {}),
			...Object.keys(entry.afterData ?? {}),
		]);
		return [...keys].map((key) => ({
			key,
			before: entry.beforeData?.[key],
			after: entry.afterData?.[key],
		}));
	}

	async function load(reset = true) {
		if (reset) {
			loading = true;
			expanded = null;
		} else {
			loadingMore = true;
		}
		try {
			const response = await apiFetch(`/audit${query(reset ? null : nextCursor)}`);
			if (response.status === 409) {
				noBranchSelected = true;
				return;
			}
			if (response.status === 403) {
				notAllowed = true;
				return;
			}
			noBranchSelected = false;
			notAllowed = false;
			if (!response.ok) return;

			const page = (await response.json()) as {
				entries: AuditEntry[];
				nextCursor: number | null;
			};
			entries = reset ? page.entries : [...entries, ...page.entries];
			nextCursor = page.nextCursor;
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	async function loadActionKeys() {
		const response = await apiFetch('/audit/actions');
		if (response.ok) {
			actionKeys = ((await response.json()) as { actionKeys: string[] }).actionKeys;
		}
	}

	onMount(() => {
		loadActionKeys();
		load();
	});
</script>

<PageHeader
	title="Auditoría"
	description="Quién hizo qué, cuándo y desde dónde. Solo se lee: un registro que se pudiera editar desde aquí no serviría como registro."
/>

{#if noBranchSelected}
	<EmptyState
		icon="home"
		title="No hay sucursal seleccionada"
		description="La bitácora se muestra por sucursal, más los eventos del sistema."
	>
		{#snippet action()}
			<Button variant="primary" onclick={() => goto('/')}>Ir a Inicio</Button>
		{/snippet}
	</EmptyState>
{:else if notAllowed}
	<EmptyState
		icon="lock"
		title="No tienes acceso a la bitácora"
		description="Leer la auditoría requiere el permiso «Auditoría»."
	/>
{:else}
	<div class="filters">
		<div class="ranges" role="group" aria-label="Rango de fechas">
			{#each RANGES as entry (entry.value)}
				<button
					type="button"
					data-unstyled
					class="range"
					class:active={range === entry.value}
					aria-pressed={range === entry.value}
					onclick={() => {
						range = entry.value;
						load();
					}}
				>
					{entry.label}
				</button>
			{/each}
		</div>

		<Field label="Acción">
			{#snippet control({ id })}
				<select
					{id}
					bind:value={actionKey}
					onchange={() => load()}
				>
					<option value="">Todas</option>
					{#each actionKeys as key (key)}
						<option value={key}>{auditAction(key).label}</option>
					{/each}
				</select>
			{/snippet}
		</Field>

		<Field
			label="Buscar"
			type="search"
			bind:value={search}
			oninput={() => load()}
			placeholder="Empleado o entidad afectada"
		/>
	</div>

	{#if loading}
		<Skeleton lines={6} />
	{:else if entries.length === 0}
		<EmptyState
			icon="lock"
			title="Sin eventos"
			description="No hay nada registrado con esos filtros. Prueba con un rango más amplio."
		/>
	{:else}
		<ul class="trail">
			{#each entries as entry (entry.id)}
				{@const action = auditAction(entry.actionKey)}
				{@const entity = entityLabel(entry.entityType)}
				{@const detail = changes(entry)}
				<li class="event">
					<div class="event-main">
						<span class="event-when">{when(entry.createdAt)}</span>
						<span class="event-what">
							<Badge tone={action.tone}>{action.label}</Badge>
							{#if entity}
								<span class="event-entity">
									{entity}{#if entry.entityId}&nbsp;#{entry.entityId}{/if}
								</span>
							{/if}
						</span>
						<span class="event-who">
							{#if entry.userName}
								{entry.userName} <span class="muted">@{entry.username}</span>
							{:else}
								<span class="muted">Sin usuario</span>
							{/if}
						</span>
						<span class="event-where">
							{#if entry.branchName}
								{entry.branchName}
							{:else}
								<span class="muted">Sistema</span>
							{/if}
							{#if entry.ipAddress}
								<span class="muted"> · {entry.ipAddress}</span>
							{/if}
						</span>
						{#if detail.length > 0}
							<Button
								size="sm"
								variant="ghost"
								onclick={() => (expanded = expanded === entry.id ? null : entry.id)}
							>
								{expanded === entry.id ? 'Ocultar' : 'Ver cambio'}
							</Button>
						{:else}
							<span></span>
						{/if}
					</div>

					{#if expanded === entry.id && detail.length > 0}
						<table class="diff">
							<thead>
								<tr>
									<th scope="col">Campo</th>
									<th scope="col">Antes</th>
									<th scope="col">Después</th>
								</tr>
							</thead>
							<tbody>
								{#each detail as change (change.key)}
									<tr>
										<td>{fieldLabel(change.key)}</td>
										<td class="before">{formatValue(change.before)}</td>
										<td class="after">{formatValue(change.after)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</li>
			{/each}
		</ul>

		{#if nextCursor !== null}
			<div class="more">
				<Button variant="secondary" loading={loadingMore} onclick={() => load(false)}>
					Cargar más
				</Button>
			</div>
		{/if}
	{/if}
{/if}

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.filters :global(.field) {
		min-width: 200px;
	}

	.ranges {
		display: flex;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--color-surface);
	}

	.range {
		min-height: var(--control-h-md);
		padding: 0 var(--space-3);
		background: none;
		border: none;
		border-radius: 0;
		font: inherit;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.range + .range {
		border-left: 1px solid var(--color-border);
	}

	.range.active {
		background: var(--color-primary-tint);
		color: var(--color-primary-hover);
	}

	.range:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.trail {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		overflow: hidden;
	}

	.event + .event {
		border-top: 1px solid var(--color-border);
	}

	.event-main {
		display: grid;
		grid-template-columns: 150px minmax(220px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr) auto;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		min-height: var(--touch-min);
	}

	.event-when {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.event-what {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.event-entity {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.event-who,
	.event-where {
		font-size: var(--text-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.muted {
		color: var(--color-text-muted);
	}

	.diff {
		width: 100%;
		border-collapse: collapse;
		background: var(--color-surface-sunk);
		font-size: var(--text-sm);
	}

	.diff th,
	.diff td {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--color-border);
	}

	.diff th {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.before {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	.after {
		font-weight: 600;
	}

	.more {
		display: flex;
		justify-content: center;
		margin-top: var(--space-4);
	}

	@media (max-width: 900px) {
		.event-main {
			grid-template-columns: 1fr;
			gap: var(--space-1);
			padding: var(--space-3);
		}
	}
</style>
