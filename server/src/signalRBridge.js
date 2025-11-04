import EventEmitter from 'events';
import WebSocket from 'ws';
import { HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import { config } from './config.js';
import { resolveContract } from './contracts.js';
import { logger } from './logger.js';
import { monitor } from './monitor.js';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

export class SignalRBridge extends EventEmitter {
  constructor({ tsxClient }) {
    super();
    this.tsxClient = tsxClient;
    this.connection = null;
    this.contract = resolveContract(config.defaultContract?.id || config.defaultContract?.code);
    this.isStarting = false;
    this.samples = { trade: false, quote: false };
  }

  get contractId() {
    return this.contract?.id;
  }

  get contractCode() {
    return this.contract?.code;
  }

  getCurrentContract() {
    return this.contract ? { ...this.contract } : null;
  }

  async start(contractInput) {
    const target = resolveContract(contractInput || this.contractId || this.contractCode);
    if (!target?.id) {
      logger.error({ contractInput }, 'SignalR bridge unable to resolve contract');
      return;
    }

    const switching = this.contract?.id !== target.id;
    if (switching || !this.contract) {
      this.contract = target;
      this.samples = { trade: false, quote: false };
    }

    if (this.isStarting) {
      return;
    }

    if (this.connection) {
      if (switching) {
        await this.stop();
      } else {
        await this.subscribe(this.contract);
        return;
      }
    }

    this.isStarting = true;
    try {
      const token = await this.tsxClient.getToken();
      const url = `${config.marketHub}?access_token=${encodeURIComponent(token)}`;

      this.connection = new HubConnectionBuilder()
        .withUrl(url, {
          skipNegotiation: true,
          transport: HttpTransportType.WebSockets,
          accessTokenFactory: () => token
        })
  .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (_) => 5_000 })
  .configureLogging(LogLevel.Information)
        .build();

      this.connection.on('GatewayTrade', (cid, payload) => {
        const trades = Array.isArray(payload) ? payload : [payload];
        if (!this.samples.trade && trades.length) {
          logger.debug({ cid, payload: trades[0] }, 'Sample GatewayTrade payload');
          this.samples.trade = true;
        }
        for (const trade of trades) {
          this.emit('trade', { cid, payload: trade, contract: this.getCurrentContract() });
        }
      });

      this.connection.on('GatewayQuote', (cid, payload) => {
        if (!this.samples.quote) {
          logger.debug({ cid, payload }, 'Sample GatewayQuote payload');
          this.samples.quote = true;
        }
        this.emit('quote', { cid, payload, contract: this.getCurrentContract() });
      });

      this.connection.on('GatewayDepth', (cid, payload) => {
        this.emit('depth', { cid, payload, contract: this.getCurrentContract() });
      });

      this.connection.onreconnected(() => {
        logger.warn({ contractId: this.contractId, code: this.contractCode }, 'SignalR reconnected, resubscribing');
        this.subscribe(this.contract);
      });

      await this.connection.start();
      logger.info({ contractId: this.contractId, code: this.contractCode }, 'SignalR connected');
      await this.subscribe(this.contract);
      this.isStarting = false;
    } catch (error) {
      this.isStarting = false;
      monitor.recordError(error, { phase: 'signalr-start', contractId: this.contractId, code: this.contractCode });
      logger.error({ err: error, contractId: this.contractId, code: this.contractCode }, 'SignalR start failed');
      setTimeout(() => this.start(this.contractId || this.contractCode), 10_000);
    }
  }

  async stop() {
    if (!this.connection) return;
    try {
      await this.connection.stop();
    } catch (error) {
      logger.warn({ err: error }, 'SignalR stop warning');
    }
    this.connection = null;
  }

  async subscribe(contract = this.contract) {
    if (!this.connection || !contract?.id) return;
    try {
      await this.connection.invoke('SubscribeContractQuotes', contract.id);
      await this.connection.invoke('SubscribeContractTrades', contract.id);
      await this.connection.invoke('SubscribeContractMarketDepth', contract.id);
      logger.info({ contractId: contract.id, code: contract.code }, 'SignalR subscribed');
    } catch (error) {
      monitor.recordError(error, { phase: 'signalr-subscribe', contractId: contract.id, code: contract.code });
      logger.error({ err: error, contractId: contract.id, code: contract.code }, 'SignalR subscribe failed');
    }
  }
}
