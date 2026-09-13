import { describe, expect, it } from 'vitest';
import { buildBillBytes, type BillInput } from './bill.js';

// El formato de la cuenta se prueba aquí, sin base ni impresora: es papel
// que se le entrega a un cliente, y un importe desalineado o un total que
// no cuadra es una discusión en la mesa.
const BASE: BillInput = {
  companyName: 'Grupo Demo',
  branchName: 'Sucursal Centro',
  taxId: '131-00000-1',
  orderId: 42,
  dineTableName: 'Mesa 1',
  customerName: null,
  openedAt: new Date('2026-09-12T18:00:00Z'),
  closedAt: new Date('2026-09-12T19:30:00Z'),
  lines: [{ quantity: 2, itemName: 'Coca-Cola', note: null, unitPrice: 120, modifiers: [] }],
  subtotal: 240,
  taxTotal: 43.2,
  total: 283.2,
  payments: [{ methodName: 'Efectivo', amount: 283.2, tipAmount: 20 }],
  reprintNumber: 0,
  printedAt: new Date('2026-09-12T19:31:00Z'),
};

/** El texto imprimible, sin los códigos de control ESC/POS. */
function text(input: BillInput): string {
  return buildBillBytes(input)
    .toString('latin1')
    // Los caracteres de control del patrón son justo lo que hay que
    // quitar: ESC y GS son la mitad del formato de una térmica.
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[@a][0-9]?|\x1bE[01]|\x1d![\x00-\xff]|\x1dV\x00/g, '');
}

function lines(input: BillInput): string[] {
  return text(input).split('\n');
}

describe('customer bill', () => {
  it('puts the company, branch and RNC at the top', () => {
    const printed = lines(BASE);
    expect(printed[0]).toBe('Grupo Demo');
    expect(printed[1]).toBe('Sucursal Centro');
    expect(printed[2]).toBe('RNC 131-00000-1');
  });

  it('right-aligns every amount to the 32-column margin', () => {
    for (const line of lines(BASE)) {
      if (!/\d\.\d{2}$/.test(line)) continue;
      expect(line).toHaveLength(32);
    }
  });

  it('multiplies the line by its quantity', () => {
    // 2 x 120.00 = 240.00, no 120.00
    expect(text(BASE)).toContain('2x Coca-Cola');
    expect(lines(BASE).find((line) => line.startsWith('2x Coca-Cola'))).toContain('240.00');
  });

  it('folds the modifiers into the unit price so the line adds up', () => {
    const withModifier = text({
      ...BASE,
      lines: [
        {
          quantity: 1,
          itemName: 'Hamburguesa',
          note: 'sin cebolla',
          // 350 de base + 25 del extra, ya sumados por quien arma la cuenta
          unitPrice: 375,
          modifiers: [{ name: 'Queso extra', priceDelta: 25 }],
        },
      ],
    });
    expect(withModifier).toContain('+ Queso extra');
    expect(withModifier).toContain('* sin cebolla');
    expect(withModifier.split('\n').find((l) => l.startsWith('1x Hamburguesa'))).toContain(
      '375.00',
    );
  });

  it('shows the totals and the payment with its tip apart', () => {
    const printed = text(BASE);
    expect(printed).toMatch(/Subtotal\s+240\.00/);
    expect(printed).toMatch(/ITBIS\s+43\.20/);
    expect(printed).toMatch(/TOTAL\s+283\.20/);
    expect(printed).toMatch(/Efectivo\s+283\.20/);
    expect(printed).toMatch(/Propina\s+20\.00/);
  });

  it('never claims to be a fiscal receipt', () => {
    const printed = text(BASE);
    expect(printed).toContain('no es un');
    expect(printed).toContain('comprobante fiscal con NCF');
    // Nada que pueda confundirse con un NCF asignado por la DGII.
    expect(printed).not.toMatch(/\bNCF[:\s]*[A-Z]\d{2}\d+/);
  });

  it('marks a reprint on the paper, not only in the audit log', () => {
    expect(text(BASE)).not.toContain('REIMPRESION');
    expect(text({ ...BASE, reprintNumber: 3 })).toContain('** REIMPRESION #3 **');
  });

  it('drops the payments block while the order is still open', () => {
    const preBill = text({ ...BASE, closedAt: null, payments: [] });
    expect(preBill).not.toContain('Efectivo');
    expect(preBill).not.toContain('Cerrada:');
    // Pero el total sí va: es lo que el cliente va a revisar.
    expect(preBill).toMatch(/TOTAL\s+283\.20/);
  });

  it('breaks a long line instead of cutting the amount off', () => {
    const printed = lines({
      ...BASE,
      lines: [
        {
          quantity: 12,
          itemName: 'Mofongo de camarones con tostones',
          note: null,
          unitPrice: 1250,
          modifiers: [],
        },
      ],
    });
    const amountLine = printed.find((line) => line.trim() === '15000.00');
    expect(amountLine).toBeDefined();
    expect(amountLine).toHaveLength(32);
  });

  it('encodes Spanish accents as single latin1 bytes the printer understands', () => {
    const bytes = buildBillBytes({ ...BASE, branchName: 'Sucursal Ñuñoa' });
    // 'Ñ' es 0xD1 en latin1; en utf8 serían dos bytes y saldría basura.
    expect(bytes.includes(0xd1)).toBe(true);
  });
});
