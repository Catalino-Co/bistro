<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { session } from '$lib/session.svelte.js';

	// El único agregado que sabía calcular el sistema era el total de UNA
	// orden. Esta pantalla es la primera que responde "¿cómo va el día?".
	interface Slice {
		id: number | null;
		name: string;
		quantity: number;
		amount: string;
	}
	interface DailySummary {
		sales: {
			orderCount: number;
			subtotal: string;
			taxTotal: string;
			total: string;
			averageTicket: string;
		};
		openNow: { orderCount: number; total: string };
		tipTotal: string;
		payments: { paymentMethodId: number; paymentMethodName: string; count: number; amount: string }[];
		byFamily: Slice[];
		byStation: Slice[];
		byHour: { hour: number; orderCount: number; amount: string }[];
	}

	let summary = $state<DailySummary | null>(null);
	let loading = $state(true);
	let noBranchSelected = $state(false);
	let notAllowed = $state(false);

	const today = new Date();

	function money(value: string | number): string {
		return `RD$ ${Number(value).toLocaleString('es-DO', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`;
	}

	function hourLabel(hour: number): string {
		if (hour === 0) return '12a';
		if (hour === 12) return '12p';
		return hour < 12 ? `${hour}a` : `${hour - 12}p`;
	}

	// Las horas se dibujan de la primera con venta a la última, no las 24:
	// un local que abre a las 11 no necesita once barras vacías delante.
	const hourBars = $derived.by(() => {
		const slices = summary?.byHour ?? [];
		if (slices.length === 0) return [];
		const first = Math.min(...slices.map((s) => s.hour));
		const last = Math.max(...slices.map((s) => s.hour));
		const byHour = new Map(slices.map((s) => [s.hour, s]));
		const peak = Math.max(...slices.map((s) => Number(s.amount)));
		return Array.from({ length: last - first + 1 }, (_, i) => {
			const hour = first + i;
			const slice = byHour.get(hour);
			const amount = Number(slice?.amount ?? 0);
			return {
				hour,
				amount,
				orderCount: slice?.orderCount ?? 0,
				ratio: peak === 0 ? 0 : amount / peak,
				isPeak: amount > 0 && amount === peak,
			};
		});
	});

	function plural(count: number, one: string, many: string): string {
		return `${count} ${count === 1 ? one : many}`;
	}

	function withRatio(slices: Slice[]) {
		const peak = Math.max(0, ...slices.map((s) => Number(s.amount)));
		return slices.map((slice) => ({
			...slice,
			ratio: peak === 0 ? 0 : Number(slice.amount) / peak,
		}));
	}

	async function loadSummary() {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
		const response = await apiFetch(
			`/reports/daily?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
		);
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
		if (response.ok) {
			summary = (await response.json()) as DailySummary;
		}
	}

	onMount(() => {
		loadSummary().finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Resumen del día"
	description="{session.currentBranch?.name ?? 'Sucursal'} · {today.toLocaleDateString('es-DO', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	})}"
>
	{#snippet actions()}
		<Button variant="secondary" icon="orders" onclick={() => goto('/orders')}>Órdenes</Button>
		<Button variant="primary" icon="pos" onclick={() => goto('/pos')}>Ir al salón</Button>
	{/snippet}
</PageHeader>

{#if noBranchSelected}
	<EmptyState
		icon="home"
		title="No hay sucursal seleccionada"
		description="Elige una sucursal en la barra lateral para ver cómo va su día."
	/>
{:else if loading}
	<Skeleton lines={4} height="4rem" />
{:else if notAllowed}
	<EmptyState
		icon="lock"
		title="No tienes acceso a los reportes"
		description="Las cifras de venta requieren el permiso «Reportes». Desde aquí puedes seguir trabajando en el salón."
	>
		{#snippet action()}
			<Button variant="primary" icon="pos" onclick={() => goto('/pos')}>Ir al salón</Button>
		{/snippet}
	</EmptyState>
{:else if summary}
	<div class="tiles">
		<article class="tile is-lead">
			<span class="tile-label">Ventas de hoy</span>
			<span class="tile-value">{money(summary.sales.total)}</span>
			<span class="tile-note">
				{money(summary.sales.subtotal)} + {money(summary.sales.taxTotal)} de ITBIS
			</span>
		</article>
		<article class="tile">
			<span class="tile-label">Órdenes cobradas</span>
			<span class="tile-value">{summary.sales.orderCount}</span>
			<span class="tile-note">Ticket promedio {money(summary.sales.averageTicket)}</span>
		</article>
		<article class="tile">
			<span class="tile-label">Propinas</span>
			<span class="tile-value">{money(summary.tipTotal)}</span>
			<span class="tile-note">Sobre las órdenes cobradas hoy</span>
		</article>
		<article class="tile">
			<span class="tile-label">En mesa ahora</span>
			<span class="tile-value">{money(summary.openNow.total)}</span>
			<span class="tile-note">
				{plural(summary.openNow.orderCount, 'orden abierta', 'órdenes abiertas')} · sin cobrar
			</span>
		</article>
	</div>

	<section class="panel">
		<header>
			<h2>Ventas por hora</h2>
			<p class="muted">Cada barra es lo cobrado en esa hora.</p>
		</header>
		{#if hourBars.length === 0}
			<p class="muted">Todavía no se ha cobrado nada hoy.</p>
		{:else}
			<div class="hours">
				{#each hourBars as bar (bar.hour)}
					<div class="hour">
						<div
							class="hour-bar"
							class:is-peak={bar.isPeak}
							style:height="{Math.max(bar.ratio * 100, bar.amount > 0 ? 4 : 0)}%"
							title="{hourLabel(bar.hour)}: {money(bar.amount)} en {bar.orderCount} órdenes"
						></div>
						{#if bar.isPeak}
							<span class="hour-peak">{money(bar.amount)}</span>
						{/if}
						<span class="hour-label">{hourLabel(bar.hour)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<div class="breakdowns">
		{#each [{ title: 'Por familia', slices: summary.byFamily }, { title: 'Por estación', slices: summary.byStation }] as block (block.title)}
			<section class="panel">
				<header>
					<h2>{block.title}</h2>
					<p class="muted">Sin impuesto, sobre lo vendido hoy.</p>
				</header>
				{#if block.slices.length === 0}
					<p class="muted">Sin datos todavía.</p>
				{:else}
					<ul class="bars">
						{#each withRatio(block.slices) as slice (slice.name)}
							<li>
								<span class="bar-label">{slice.name}</span>
								<span class="bar-track">
									<span class="bar-fill" style:width="{Math.max(slice.ratio * 100, 2)}%"></span>
								</span>
								<span class="bar-value">
									{money(slice.amount)}
									<span class="bar-qty">{plural(slice.quantity, 'ítem', 'ítems')}</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	</div>

	<section class="panel">
		<header>
			<h2>Métodos de pago</h2>
			<p class="muted">Incluye lo cobrado en cada forma de pago, propina aparte.</p>
		</header>
		{#if summary.payments.length === 0}
			<p class="muted">Sin pagos registrados hoy.</p>
		{:else}
			<ul class="bars">
				{#each withRatio(summary.payments.map((p) => ({ id: p.paymentMethodId, name: p.paymentMethodName, quantity: p.count, amount: p.amount }))) as slice (slice.name)}
					<li>
						<span class="bar-label">{slice.name}</span>
						<span class="bar-track">
							<span class="bar-fill" style:width="{Math.max(slice.ratio * 100, 2)}%"></span>
						</span>
						<span class="bar-value">
							{money(slice.amount)}
							<span class="bar-qty">{plural(slice.quantity, 'pago', 'pagos')}</span>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="panel">
		<header>
			<h2>Accesos rápidos</h2>
		</header>
		<div class="shortcuts">
			<a href="/pos"><Icon name="pos" size={20} /> Salón</a>
			<a href="/orders"><Icon name="orders" size={20} /> Órdenes</a>
			<a href="/kitchen"><Icon name="kitchen" size={20} /> Cocina</a>
			<a href="/menu"><Icon name="catalog" size={20} /> Catálogo</a>
		</div>
	</section>
{/if}

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}

	.tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
	}

	/* Una sola cifra lidera; las demás la acompañan. */
	.tile.is-lead {
		border-color: var(--color-primary);
		background: var(--color-primary-tint);
	}

	.tile-label {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.tile-value {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 700;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	.tile.is-lead .tile-value {
		color: var(--color-primary-hover);
		font-size: var(--text-3xl);
	}

	.tile-note {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: var(--space-5);
		margin-bottom: var(--space-5);
	}

	.panel header {
		margin-bottom: var(--space-4);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.muted {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	/* --- ventas por hora --- */

	.hours {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 180px;
		padding-top: var(--space-5);
	}

	.hour {
		flex: 1;
		min-width: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		position: relative;
	}

	.hour-bar {
		width: 100%;
		background: var(--color-primary-tint);
		/* El extremo del dato se redondea; la base queda anclada. */
		border-radius: 4px 4px 0 0;
		min-height: 0;
	}

	.hour-bar.is-peak {
		background: var(--color-primary);
	}

	.hour-peak {
		position: absolute;
		top: 0;
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-primary-hover);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.hour-label {
		margin-top: var(--space-1);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	/* --- desgloses --- */

	.breakdowns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--space-5);
	}

	.breakdowns .panel {
		margin-bottom: 0;
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.bars li {
		display: grid;
		grid-template-columns: minmax(90px, 1fr) minmax(60px, 2fr) auto;
		align-items: center;
		gap: var(--space-3);
	}

	.bar-label {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bar-track {
		height: 10px;
		background: var(--color-surface-sunk);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.bar-fill {
		display: block;
		height: 100%;
		background: var(--color-primary);
		border-radius: 0 4px 4px 0;
	}

	.bar-value {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.bar-qty {
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--color-text-muted);
	}

	/* --- accesos rápidos --- */

	.shortcuts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.shortcuts a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		text-decoration: none;
		font-weight: 600;
	}

	.shortcuts a:hover {
		border-color: var(--color-primary);
		background: var(--color-primary-tint);
		color: var(--color-primary-hover);
	}

	.shortcuts a:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
