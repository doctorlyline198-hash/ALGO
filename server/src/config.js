import dotenv from 'dotenv';
import { resolveContract } from './contracts.js';

dotenv.config();

const required = ['TSX_API_ENDPOINT', 'TSX_MARKET_HUB', 'TSX_USERNAME', 'TSX_API_KEY'];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] Missing ${key}. Populate server/.env to enable live connectivity.`);
  }
}
const defaultContractInput = process.env.DEFAULT_CONTRACT || 'MGCZ5';
const defaultContract = resolveContract(defaultContractInput);

export const config = {
  apiEndpoint: process.env.TSX_API_ENDPOINT || 'https://api.topstepx.com',
  historyEndpoint: resolveHistoryEndpoint(process.env.TSX_HISTORY_ENDPOINT, process.env.TSX_API_ENDPOINT),
  marketHub: process.env.TSX_MARKET_HUB || 'https://rtc.topstepx.com/hubs/market',
  username: process.env.TSX_USERNAME || '',
  password: process.env.TSX_PASSWORD || '',
  apiKey: process.env.TSX_API_KEY || '',
  defaultContract,
  port: Number(process.env.PORT || 3001),
  historyLimit: resolveHistoryLimit(process.env.CANDLE_HISTORY_LIMIT)
};

function resolveHistoryLimit(raw) {
  const fallback = 4320; // default to three days of 1m bars
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 10_000);
}

function resolveHistoryEndpoint(explicit, fallback) {
  const candidate = (explicit || fallback || '').trim();
  if (!candidate) {
    return 'https://api.topstepx.com';
  }
  return candidate.replace(/\/$/, '');
}
