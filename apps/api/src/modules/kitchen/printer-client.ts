import net from 'node:net';

export type SendToPrinterResult = { outcome: 'printed' } | { outcome: 'failed'; error: string };

// Raw ESC/POS network printing: connect, write the ticket bytes, and let
// the printer close the connection once it's done -- no reply protocol to
// speak, just a socket. A connection failure (printer off, wrong IP, no
// route) or a timeout both resolve as 'failed' rather than throwing, since
// a station's printer being unreachable shouldn't blow up the request that
// triggered it (see orders.repo.ts's sendToKitchen, which sends regardless
// of print outcome).
export function sendToPrinter(
  host: string,
  port: number,
  data: Buffer,
  timeoutMs = 5000,
): Promise<SendToPrinterResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: SendToPrinterResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => settle({ outcome: 'failed', error: 'timeout' }), timeoutMs);

    socket.once('connect', () => {
      socket.end(data);
    });
    socket.once('close', () => settle({ outcome: 'printed' }));
    socket.once('error', (err) => settle({ outcome: 'failed', error: err.message }));
  });
}
