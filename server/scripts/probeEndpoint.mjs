import { TsxClient } from '../src/tsxClient.js';

const [, , endpoint = '/api/Order/open'] = process.argv;

async function main() {
  const client = new TsxClient();
  const payload = {
    accountId: 13302210,
    request: {
      accountId: 13302210,
      startTimestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      endTimestamp: new Date().toISOString(),
      page: 1,
      pageSize: 50
    }
  };

  const body = endpoint.includes('History')
    ? { contractId: 'CON.F.US.MGC.Z25', unit: 'minute', unitNumber: 1, limit: 10 }
    : payload;

  const result = await client.post(endpoint, body);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('probeEndpoint error:', error.response?.data || error.message || error);
  process.exit(1);
});
