import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { sendToPrinter } from './printer-client.js';

describe('sendToPrinter', () => {
  let server: net.Server | undefined;
  let sockets: net.Socket[] = [];

  afterEach(async () => {
    if (server) {
      // The half-open timeout test leaves its accepted socket open on
      // purpose; server.close()'s callback otherwise waits forever for it,
      // since closeAllConnections() isn't available on every Node version
      // this repo might run on.
      for (const socket of sockets) socket.destroy();
      sockets = [];
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  function listen(
    handler: (socket: net.Socket) => void,
    options?: net.ServerOpts,
  ): Promise<number> {
    return new Promise((resolve) => {
      server = net.createServer(options, (socket) => {
        sockets.push(socket);
        handler(socket);
      });
      server.listen(0, '127.0.0.1', () => {
        resolve((server!.address() as net.AddressInfo).port);
      });
    });
  }

  it('delivers the exact bytes to a printer that accepts and closes', async () => {
    const received: Buffer[] = [];
    const port = await listen((socket) => {
      socket.on('data', (chunk) => received.push(chunk));
      socket.on('end', () => socket.end());
    });

    const result = await sendToPrinter('127.0.0.1', port, Buffer.from('hola cocina'));

    expect(result).toEqual({ outcome: 'printed' });
    expect(Buffer.concat(received).toString()).toBe('hola cocina');
  });

  it('fails when nothing is listening on the port', async () => {
    // Momentarily bind then close, so the port is very likely free but no
    // one answers the connection attempt.
    const port = await listen(() => {});
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    const result = await sendToPrinter('127.0.0.1', port, Buffer.from('x'), 2000);
    expect(result.outcome).toBe('failed');
  });

  it('fails on timeout when the printer never responds or closes', async () => {
    // allowHalfOpen: without it, Node auto-answers our end()'s FIN with its
    // own, which closes the client socket almost immediately -- defeating
    // the "hung printer" this test means to simulate.
    const port = await listen(
      (socket) => {
        socket.on('data', () => {});
      },
      { allowHalfOpen: true },
    );

    const result = await sendToPrinter('127.0.0.1', port, Buffer.from('x'), 200);
    expect(result).toEqual({ outcome: 'failed', error: 'timeout' });
  });
});
