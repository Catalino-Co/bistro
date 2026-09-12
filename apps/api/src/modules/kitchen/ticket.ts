// ESC/POS control codes -- the standard command set thermal kitchen
// printers speak over a raw TCP socket (see printer-client.ts). Encoded as
// latin1: the station/table/item names in this codebase are Spanish text
// (á, é, í, ó, ú, ñ), and latin1 maps those to the single-byte values most
// ESC/POS printers expect on their default (CP850/858-ish) code page --
// unlike utf8, which would emit multi-byte sequences the printer prints as
// garbage. If a specific printer model needs a different code page, that's
// a real-hardware detail to adjust here once it's known.
const ESC = '\x1b';
const GS = '\x1d';
const INIT = `${ESC}@`;
const ALIGN_CENTER = `${ESC}a1`;
const ALIGN_LEFT = `${ESC}a0`;
const BOLD_ON = `${ESC}E1`;
const BOLD_OFF = `${ESC}E0`;
const CUT = `${GS}V\x00`;

export interface TicketLine {
  quantity: number;
  itemName: string;
  note: string | null;
}

export interface TicketInput {
  stationName: string;
  dineTableName: string;
  orderId: number;
  lines: TicketLine[];
}

const RULE = '-'.repeat(32);

export function buildTicketBytes(input: TicketInput): Buffer {
  const parts: string[] = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    `${input.stationName}\n`,
    BOLD_OFF,
    ALIGN_LEFT,
    `Mesa: ${input.dineTableName}\n`,
    `Orden #${input.orderId}\n`,
    `${RULE}\n`,
  ];

  for (const line of input.lines) {
    parts.push(`${line.quantity}x ${line.itemName}\n`);
    if (line.note) {
      parts.push(`  * ${line.note}\n`);
    }
  }

  parts.push('\n\n\n', CUT);
  return Buffer.from(parts.join(''), 'latin1');
}
