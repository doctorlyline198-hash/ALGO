import { WebSocketServer } from 'ws';
import EventEmitter from 'events';
import { URL } from 'url';

export class CandleRouter extends EventEmitter {
  constructor({ server, path = '/stream', getSnapshot }) {
    super();
    this.clients = new Set();
    this.getSnapshot = getSnapshot;

    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws, request) => {
      const { searchParams } = new URL(request.url, 'http://localhost');
      const symbol = searchParams.get('symbol') || 'MGCZ5';
      ws.symbol = symbol;
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'set-symbol' && msg.symbol) {
            ws.symbol = msg.symbol;
            this.sendSnapshot(ws, msg.symbol);
          }
        } catch (error) {
          console.warn('[WS] failed to parse message', error.message);
        }
      });

      this.sendSnapshot(ws, symbol);
    });
  }

  broadcast(type, payload) {
    const message = JSON.stringify({ type, ...payload });
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        if (!payload.symbol || payload.symbol === ws.symbol) {
          ws.send(message);
        }
      }
    }
  }

  sendSnapshot(ws, symbol) {
    if (!this.getSnapshot) return;
    const snapshot = this.getSnapshot(symbol) || [];
    ws.send(JSON.stringify({ type: 'snapshot', symbol, candles: snapshot }));
  }
}
