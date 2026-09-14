# Estándares de interfaz

Lo que se decidió una vez y no hay que volver a decidir en cada pantalla.
Si algo de aquí estorba en un caso concreto, cámbialo aquí primero y
explica por qué — no lo ignores en silencio en una pantalla suelta.

## Navegación de un módulo: tarjetas, no pestañas

**Cuando un módulo tiene varias secciones, el módulo abre en un índice de
tarjetas: una tarjeta por sección, cada una con su icono, su nombre y una
línea de qué se administra ahí.** Cada sección es su propia ruta y su
propia pantalla.

No se usan pestañas, ni columnas lado a lado, ni recuadros dentro de una
sola pantalla gigante para separar secciones de un módulo.

Por qué:

- Una pestaña es una palabra suelta. Hay que abrirla para saber qué hay
  detrás, y el que la abre por primera vez no tiene forma de adivinarlo.
  En una tarjeta cabe una línea de explicación, y esa línea es la
  diferencia entre encontrar algo y buscarlo.
- Las pestañas se rompen al crecer. Cuatro caben; seis se van fuera de
  pantalla en una tableta, que es donde de verdad se usa esto. Una rejilla
  de tarjetas simplemente baja de fila.
- Una pantalla por sección es una URL por sección: se puede enlazar, se
  puede marcar, y el botón de atrás significa algo.
- El toque es de 44 px mínimo. Una tarjeta lo cumple sin esfuerzo; una
  tira de pestañas apretadas, no.

Se implementa con [`CardNav`](../apps/web/src/lib/components/CardNav.svelte),
con la lista de secciones declarada en
[`nav.ts`](../apps/web/src/lib/nav.ts) junto al resto de la navegación.
La pantalla índice es solo `PageHeader` + `CardNav`.

```svelte
<PageHeader title="Catálogo" description="…" />
<CardNav items={CATALOG_ITEMS} label="Secciones del catálogo" />
```

El `+layout.svelte` del módulo pone la vuelta al índice en las rutas hijas
— en una tableta sin botón de atrás, esa es la diferencia entre navegar y
quedarse encerrado.

**Orden de las tarjetas:** el del dominio, no el alfabético. En Catálogo es
el del árbol (familia → subfamilia → categoría → ítem), con lo transversal
al final.

Ejemplos vivos: `/menu` y `/settings`.

### Lo que esto NO es

Las pestañas dentro del detalle de **un registro** (Datos · Modificadores ·
Estación en la ficha de un ítem) no son navegación de módulo: son facetas
del mismo registro que ya está abierto, y ahí una pestaña está bien. La
regla es para las secciones de un módulo.

### Lo que se gana, medido

Ajustes eran ocho secciones tras una sub-navegación lateral de 232 px que
se llevaba un cuarto del ancho en cada una de ellas. Auditoría —una tabla
de seis columnas— se quedaba sin sitio y cortaba las dos últimas. Al pasar
a tarjetas, esa columna desaparece de las ocho pantallas y la tabla entra
entera.

## Otras reglas ya en pie

- **Archivar, no borrar.** Nada de lo que tenga historial de uso se elimina.
  Se archiva (`archived_at` nullable), sale de todas las listas y del POS, y
  se puede restaurar. Archivar fuerza además `status = 'inactive'` como
  seguro, para que una consulta que solo mire `status` también lo excluya.
- **Toda acción destructiva pasa por `ConfirmDialog`**, y el mensaje dice
  qué se conserva, no solo qué se pierde.
- **Los códigos de error de la API no se muestran nunca.** Se traducen en
  [`errors.ts`](../apps/web/src/lib/errors.ts).
- **Las listas vacías usan `EmptyState`**, que distingue «todavía no hay
  nada» de «no cargó» y ofrece la acción de crear el primero.
- **Un solo `Button variant="primary"` visible por bloque.**
- **Los estilos de elemento de `tokens.css` le ganan a las clases de un
  componente.** Svelte compila los estilos con `:where()`, que no suma
  especificidad, así que `label { flex-direction: column }` gana sobre tu
  `.toggle { display: flex }`. Si un componente estiliza un `button`, un
  `label` o un `select`, declara TODAS las propiedades que le importan, no
  solo las que quiere cambiar.
