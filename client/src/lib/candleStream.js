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
    this.baseUrl = url;
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

    console.log('[CandleStream] Connecting to websocket:', this.url);
    this.ws = new WebSocket(this.url);

    this.ws.addEventListener('open', () => {
      this.emit('status', { connected: true });
      console.log('[CandleStream] WebSocket opened for symbol:', this.symbol);
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[CandleStream] Received message:', payload);
        this.emit(payload.type, payload);
      } catch (error) {
        console.warn('[CandleStream] failed to parse payload', error.message);
      }
    });

    this.ws.addEventListener('close', () => {
      this.emit('status', { connected: false });
      console.log('[CandleStream] WebSocket closed for symbol:', this.symbol);
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    });

    this.ws.addEventListener('error', () => {
      console.warn('[CandleStream] WebSocket error for symbol:', this.symbol);
      this.ws?.close();
    });
  }

  changeSymbol(symbol) {
    console.log('[CandleStream] Changing symbol:', symbol);
    this.symbol = symbol;
    this.shouldReconnect = false;
    this.ws?.close();
    // Always rebuild URL from the original base to preserve auth params
    this.url = appendSymbol(this.baseUrl, symbol);
    console.log('[CandleStream] New websocket URL:', this.url);
    this.shouldReconnect = true;
    this.connect();
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

