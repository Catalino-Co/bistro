import { describe, expect, it } from 'vitest';
import { buildTicketBytes } from './ticket.js';

describe('buildTicketBytes', () => {
  it('includes the station, table, order, and each line with its quantity', () => {
    const bytes = buildTicketBytes({
      stationName: 'Bar',
      dineTableName: 'Mesa 1',
      orderId: 42,
      lines: [
        { quantity: 2, itemName: 'Coca-Cola', note: null },
        { quantity: 1, itemName: 'Ron Mamajuana', note: 'con hielo' },
      ],
    });
    const text = bytes.toString('latin1');

    expect(text).toContain('Bar');
    expect(text).toContain('Mesa: Mesa 1');
    expect(text).toContain('Orden #42');
    expect(text).toContain('2x Coca-Cola');
    expect(text).toContain('1x Ron Mamajuana');
    expect(text).toContain('* con hielo');
  });

  it('does not print a note line for a line with no note', () => {
    const bytes = buildTicketBytes({
      stationName: 'Bar',
      dineTableName: 'Mesa 1',
      orderId: 1,
      lines: [{ quantity: 1, itemName: 'Agua', note: null }],
    });
    expect(bytes.toString('latin1')).not.toContain('*');
  });

  it('starts with the ESC/POS init sequence and ends with a cut', () => {
    const bytes = buildTicketBytes({
      stationName: 'Bar',
      dineTableName: 'Mesa 1',
      orderId: 1,
      lines: [],
    });
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40])); // ESC @
    expect(bytes.subarray(-3)).toEqual(Buffer.from([0x1d, 0x56, 0x00])); // GS V 0
  });
});
