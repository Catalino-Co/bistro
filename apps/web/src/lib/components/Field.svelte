<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	/**
	 * Campo de formulario con etiqueta visible, ayuda y error.
	 *
	 * Reemplaza el patrón de usar `placeholder` como etiqueta, que deja al
	 * usuario sin contexto justo cuando empieza a escribir (y a un lector de
	 * pantalla sin nada que anunciar).
	 *
	 * `value` es SIEMPRE string, incluso con type="number": un `bind:value`
	 * sobre un input numérico devuelve `number` y revienta cualquier
	 * `.trim()` en el handler. Convierte con `Number(...)` al enviar.
	 *
	 * Para un `<select>` o `<textarea>`, pasa el snippet `control` y usa los
	 * atributos que recibe para conservar la accesibilidad del conjunto.
	 */
	interface Props extends Omit<HTMLInputAttributes, 'value' | 'type' | 'id' | 'class'> {
		label: string;
		hint?: string;
		error?: string;
		type?: 'text' | 'number' | 'password' | 'email' | 'tel' | 'search' | 'date' | 'time';
		value?: string;
		control?: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	}

	let {
		label,
		hint,
		error,
		type = 'text',
		value = $bindable(''),
		required = false,
		control,
		oninput,
		...rest
	}: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;

	const describedBy = $derived(
		[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined,
	);
</script>

<div class="field" class:field--invalid={Boolean(error)}>
	<label for={id}>
		{label}
		{#if required}<span class="req" aria-hidden="true">*</span>{/if}
	</label>

	{#if control}
		{@render control({ id, describedBy, invalid: Boolean(error) })}
	{:else}
		<input
			{...rest}
			{id}
			{type}
			{required}
			{value}
			aria-describedby={describedBy}
			aria-invalid={error ? 'true' : undefined}
			oninput={(event) => {
				value = event.currentTarget.value;
				// El handler propio va después de actualizar `value`: si no, un
				// buscador que lea el valor en cada tecla iría siempre un carácter
				// por detrás. Y si se dejara en `...rest`, este oninput lo pisaría.
				oninput?.(event);
			}}
		/>
	{/if}

	{#if error}
		<p class="error" id={errorId}>{error}</p>
	{:else if hint}
		<p class="hint" id={hintId}>{hint}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.field label {
		display: block;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.req {
		color: var(--color-danger);
		margin-left: 0.15em;
	}

	.field :global(input),
	.field :global(select),
	.field :global(textarea) {
		width: 100%;
		min-height: var(--control-h-md);
	}

	.field--invalid :global(input),
	.field--invalid :global(select),
	.field--invalid :global(textarea) {
		border-color: var(--color-danger);
	}

	.hint,
	.error {
		margin: 0;
		font-size: var(--text-xs);
	}

	.hint {
		color: var(--color-text-muted);
	}

	.error {
		color: var(--color-danger);
		font-weight: 600;
	}
</style>
