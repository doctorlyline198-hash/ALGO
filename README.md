# TopstepX Dashboard Clone

A complete trading dashboard application integrating with TopstepX for live market data and order execution.

## Project Structure

- `client/`: a Vite + React replica of the TopstepX trading dashboard with live candles, order entry, analytics, strategy panels, and risk controls.
- `server/`: a Node.js SignalR bridge that authenticates against TopstepX, consolidates trade ticks into 1-minute candles, and streams them to the frontend over WebSockets.
- `scripts/`: build and test scripts for the monorepo.

## Quick start

1. Create `server/.env` with your credentials (never commit this file):

	```env
	TSX_API_ENDPOINT=https://api.topstepx.com
	TSX_MARKET_HUB=https://rtc.topstepx.com/hubs/market
	TSX_USERNAME=<your_username>
	TSX_PASSWORD=<optional_password>
	TSX_API_KEY=<your_api_key>
	DEFAULT_CONTRACT=MGCZ5
	PORT=3001
	```

2. Create `client/.env` pointing to the local bridge:

	```env
	VITE_API_URL=http://localhost:3001
	VITE_WS_URL=ws://localhost:3001/ws
	VITE_DEFAULT_CONTRACT=MGCZ5
	```

3. Install dependencies:

	```powershell
	cd server; npm install
	cd ../client; npm install
	```

4. Run the bridge and the UI in separate terminals:

	```powershell
	# Terminal 1
	cd server; npm run dev

	# Terminal 2
	cd client; npm run dev
	```

5. Open `http://localhost:5173` to view the dashboard. Switching the contract in the search bar automatically re-subscribes the backend bridge and updates the chart stream.

## Development

### Running Tests

```bash
# Test client build
npm run lint-client

# Test server build
npm run lint-server
```

### Building for Production

```bash
# Build client
cd client && npm run build

# The server runs with Node.js
cd server && npm start
```

## Features

### API Endpoints

- The bridge emits 1-minute aggregated candles and serves current account information through `GET /api/accounts`.
- Additional REST proxies are available: `POST /api/accounts/search`, `GET|POST /api/contracts` for contract discovery, and `POST /api/orders` for submitting orders via Topstep.

### Security

- Secrets stay in `.env`; rotate them if you ever commit inadvertently.
- Never commit `.env` files to the repository.

### Current Limitations

- UI components accept live data, but still include mock strategy rows and analytics as placeholders until real strategy endpoints are wired up.

## Contributing

This is a monorepo using npm workspaces. Before committing:

1. Ensure all tests pass: `npm run lint-client && npm run lint-server`
2. Follow the existing code style
3. Update documentation as needed

## Security Notes

**Development Server Vulnerability**: The current version of Vite (5.4.21) has a moderate severity vulnerability in its esbuild dependency (GHSA-67mh-4wv8-2f99). This only affects the development server and does not impact production builds. Updating to Vite 7+ would require testing for breaking changes. Consider using the production build (`npm run build && npm run preview`) for any sensitive development work.
