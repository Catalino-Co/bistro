// Constructor de la cuenta del cliente en ESC/POS. Mismo tratamiento que
// ticket.ts (latin1, 32 columnas), pero aquí el documento se le entrega a
// una persona que va a revisar lo que consumió y cuánto paga, así que los
// importes tienen que quedar alineados a la derecha y cuadrar a la vista.
const ESC = '\x1b';
const GS = '\x1d';
const INIT = `${ESC}@`;
const ALIGN_CENTER = `${ESC}a1`;
const ALIGN_LEFT = `${ESC}a0`;
const BOLD_ON = `${ESC}E1`;
const BOLD_OFF = `${ESC}E0`;
const DOUBLE_ON = `${GS}!\x11`;
const DOUBLE_OFF = `${GS}!\x00`;
const CUT = `${GS}V\x00`;

/** Ancho típico de una impresora térmica de 80 mm en fuente A. */
const WIDTH = 32;
const RULE = '-'.repeat(WIDTH);

export interface BillLine {
  quantity: number;
  itemName: string;
  note: string | null;
  /** Precio unitario ya con sus modificadores incluidos. */
  unitPrice: number;
  modifiers: { name: string; priceDelta: number }[];
}

export interface BillPayment {
  methodName: string;
  amount: number;
  tipAmount: number;
}

export interface BillInput {
  companyName: string;
  branchName: string;
  taxId: string | null;
  orderId: number;
  dineTableName: string;
  customerName: string | null;
  openedAt: Date;
  closedAt: Date | null;
  lines: BillLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  payments: BillPayment[];
  /** Marca el documento como reimpresión y añade cuántas van. */
  reprintNumber: number;
  printedAt: Date;
}

function money(value: number): string {
  return value.toFixed(2);
}

/** Texto a la izquierda, importe pegado al margen derecho. */
function row(left: string, right: string): string {
  const space = Math.max(1, WIDTH - right.length - left.length);
  if (left.length + right.length + 1 > WIDTH) {
    // No cabe en una línea: el importe baja solo, nunca se recorta.
    return `${left}\n${' '.repeat(Math.max(0, WIDTH - right.length))}${right}\n`;
  }
  return `${left}${' '.repeat(space)}${right}\n`;
}

function timestamp(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * La cuenta que se le entrega al cliente.
 *
 * NO es un comprobante fiscal: no lleva NCF ni pretende sustituirlo, y lo
 * dice en el pie con todas las letras. Emitir un comprobante con NCF exige
 * secuencias asignadas por la DGII y control de correlativo, que es un
 * trabajo aparte y una decisión de negocio antes que de código.
 *
 * Toda impresión a partir de la primera se marca como reimpresión y numera
 * cuántas van: si una cuenta se imprime cinco veces, eso tiene que verse en
 * el papel, no solo en la bitácora.
 */
export function buildBillBytes(input: BillInput, timeZone = 'America/Santo_Domingo'): Buffer {
  const parts: string[] = [INIT, ALIGN_CENTER, BOLD_ON, `${input.companyName}\n`, BOLD_OFF];

  parts.push(`${input.branchName}\n`);
  if (input.taxId) {
    parts.push(`RNC ${input.taxId}\n`);
  }

  if (input.reprintNumber > 0) {
    parts.push(BOLD_ON, `** REIMPRESION #${input.reprintNumber} **\n`, BOLD_OFF);
  }

  parts.push(ALIGN_LEFT, `${RULE}\n`);
  parts.push(row(`Orden #${input.orderId}`, input.dineTableName));
  if (input.customerName) {
    parts.push(`Cliente: ${input.customerName}\n`);
  }
  parts.push(`Abierta: ${timestamp(input.openedAt, timeZone)}\n`);
  if (input.closedAt) {
    parts.push(`Cerrada: ${timestamp(input.closedAt, timeZone)}\n`);
  }
  parts.push(`${RULE}\n`);

  for (const line of input.lines) {
    parts.push(row(`${line.quantity}x ${line.itemName}`, money(line.unitPrice * line.quantity)));
    for (const modifier of line.modifiers) {
      parts.push(`   + ${modifier.name}\n`);
    }
    if (line.note) {
      parts.push(`   * ${line.note}\n`);
    }
  }

  parts.push(`${RULE}\n`);
  parts.push(row('Subtotal', money(input.subtotal)));
  parts.push(row('ITBIS', money(input.taxTotal)));
  parts.push(BOLD_ON, DOUBLE_ON);
  parts.push(row('TOTAL', money(input.total)));
  parts.push(DOUBLE_OFF, BOLD_OFF);

  if (input.payments.length > 0) {
    parts.push(`${RULE}\n`);
    for (const payment of input.payments) {
      parts.push(row(payment.methodName, money(payment.amount)));
      if (payment.tipAmount > 0) {
        parts.push(row('  Propina', money(payment.tipAmount)));
      }
    }
  }

  parts.push(`${RULE}\n`, ALIGN_CENTER);
  parts.push(`${timestamp(input.printedAt, timeZone)}\n`);
  parts.push('Este documento no es un\ncomprobante fiscal con NCF.\n');
  parts.push('\nGracias por su visita\n');
  parts.push('\n\n\n', CUT);

  return Buffer.from(parts.join(''), 'latin1');
}
