class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const set = this.handlers.get(type);
    if (!set) return;
    set.delete(handler);
  }

  emit(type, payload) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }
}

export class CandleStream extends EventBus {
  constructor({ symbol, url, reconnectInterval = 4000 }) {
    super();
    this.symbol = symbol;
    this.url = appendSymbol(url, symbol);
    this.reconnectInterval = reconnectInterval;
    this.ws = null;
    this.shouldReconnect = true;
    this.connect();
  }

  connect() {
    if (!this.url) {
      console.warn('[CandleStream] No websocket URL supplied');
      return;
    }
    this.ws = new WebSocket(this.url);

    this.ws.addEventListener('open', () => {
      this.emit('status', { connected: true });
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.emit(payload.type, payload);
      } catch (error) {
        console.warn('[CandleStream] failed to parse payload', error.message);
      }
    });

    this.ws.addEventListener('close', () => {
      this.emit('status', { connected: false });
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    });

    this.ws.addEventListener('error', () => {
      this.ws?.close();
    });
  }

  changeSymbol(symbol) {
    this.symbol = symbol;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set-symbol', symbol }));
    } else {
      this.url = appendSymbol(this.url, symbol);
    }
  }

  close() {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}

function appendSymbol(url, symbol) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (symbol) {
      parsed.searchParams.set('symbol', symbol);
    }
    return parsed.toString();
  } catch (error) {
    console.warn('[CandleStream] invalid URL provided', url);
    return url;
  }
}
