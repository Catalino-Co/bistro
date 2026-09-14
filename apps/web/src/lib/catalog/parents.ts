/**
 * Los selectores de padre de las pantallas del catálogo piden `status=all`,
 * porque una rama puede colgar de un padre pausado o archivado y sin eso
 * quedaría fuera del alcance de la pantalla.
 *
 * Eso obliga a dos cosas, y las dos viven aquí para que no se apliquen en
 * una pantalla y se olviden en la otra.
 */
export interface ParentNode {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  archivedAt: string | null;
}

/**
 * Un padre archivado se ve idéntico a uno activo si solo se pinta su nombre
 * -- y en esta base hay dos familias llamadas «Bebidas», una archivada con
 * todo el menú debajo y otra recién creada y vacía. Sin el sufijo, elegir la
 * equivocada deja la lista en blanco sin decir por qué.
 */
export function parentOptionLabel(node: ParentNode): string {
  if (node.archivedAt) return `${node.name} · archivada`;
  if (node.status !== 'active') return `${node.name} · inactiva`;
  return node.name;
}

/**
 * Y la selección por defecto tiene que caer en un padre activo: abrir la
 * pantalla apuntando a uno archivado es empezar en el caso raro.
 */
export function defaultParentId(nodes: ParentNode[]): number | null {
  const active = nodes.find((node) => node.archivedAt === null && node.status === 'active');
  return (active ?? nodes[0])?.id ?? null;
}
