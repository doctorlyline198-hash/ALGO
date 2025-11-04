import { TsxClient } from '../src/tsxClient.js';

async function main() {
  const client = new TsxClient();
  const accounts = await client.getAccounts();
  console.log(JSON.stringify(accounts, null, 2));
}

main().catch((error) => {
  console.error('inspectAccounts error:', error);
  process.exit(1);
});
