/**
 * Los selectores de padre de las pantallas del catálogo piden `status=all`,
 * porque una rama puede colgar de un padre pausado o archivado y sin eso
 * quedaría fuera del alcance de la pantalla.
 *
 * Eso obliga a tres cosas, y las tres viven aquí para que no se apliquen en
 * una pantalla y se olviden en la otra.
 */
export interface ParentNode {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  archivedAt: string | null;
}

function stateSuffix(node: ParentNode): string {
  if (node.archivedAt) return ' · archivada';
  if (node.status !== 'active') return ' · inactiva';
  return '';
}

/**
 * Las etiquetas del selector, calculadas sobre la lista entera y no una a
 * una, porque las dos razones para no poder distinguir dos opciones solo se
 * ven mirando al resto:
 *
 * 1. El estado. Un padre archivado se ve idéntico a uno activo si solo se
 *    pinta su nombre, y elegir el equivocado deja la lista en blanco sin
 *    decir por qué.
 * 2. El nombre repetido. Nada impide llamar «Bebidas» a dos familias -- y
 *    en un restaurante de verdad pasa, con «Postres» de cocina y «Postres»
 *    de bar. Cuando el nombre y el estado no bastan, el id es feo pero es lo
 *    único que de verdad las separa, y además invita a renombrar una.
 */
export function parentOptionLabels(nodes: ParentNode[]): Map<number, string> {
  const labels = new Map<number, string>();
  const seen = new Map<string, number>();
  for (const node of nodes) {
    const label = `${node.name}${stateSuffix(node)}`;
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  for (const node of nodes) {
    const label = `${node.name}${stateSuffix(node)}`;
    labels.set(node.id, (seen.get(label) ?? 0) > 1 ? `${label} · #${node.id}` : label);
  }
  return labels;
}

/**
 * Y la selección por defecto tiene que caer en un padre activo: abrir la
 * pantalla apuntando a uno archivado es empezar en el caso raro.
 */
export function defaultParentId(nodes: ParentNode[]): number | null {
  const active = nodes.find((node) => node.archivedAt === null && node.status === 'active');
  return (active ?? nodes[0])?.id ?? null;
}
