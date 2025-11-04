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
  marketHub: process.env.TSX_MARKET_HUB || 'https://rtc.topstepx.com/hubs/market',
  username: process.env.TSX_USERNAME || '',
  password: process.env.TSX_PASSWORD || '',
  apiKey: process.env.TSX_API_KEY || '',
  defaultContract,
  port: Number(process.env.PORT || 3001)
};
