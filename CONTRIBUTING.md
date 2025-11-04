# Contributing to ALGO

Thank you for your interest in contributing to the TopstepX Dashboard Clone project!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/ALGO.git`
3. Install dependencies: `npm run install:all`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Setting Up Environment

Before starting development, you need to set up the environment files:

1. Copy `server/.env.example` to `server/.env` and fill in your TopstepX credentials
2. Copy `client/.env.example` to `client/.env` (defaults should work for local development)

### Running the Application

Start the server and client in separate terminals:

```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client
cd client
npm run dev
```

The client will be available at `http://localhost:5173`

### Code Style

- Follow the existing code style in the project
- Use meaningful variable and function names
- Keep functions small and focused
- Add comments for complex logic

### Before Committing

1. **Test your changes**: Run `npm test` from the root directory
2. **Build successfully**: Ensure both client and server build without errors
3. **Check for console errors**: Test the UI and check browser console

Pre-commit hooks will automatically run lint-staged to check your code.

## Testing

```bash
# Run all tests
npm test

# Test client build
npm run lint-client

# Test server build
npm run lint-server
```

## Pull Request Process

1. Update the README.md if you've made significant changes
2. Ensure all tests pass
3. Update documentation as needed
4. Create a pull request with a clear description of changes
5. Link any related issues

## Project Structure

```
ALGO/
├── client/           # React frontend application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── lib/         # Utility libraries
│   │   └── data/        # Static data and mocks
│   └── tests/       # E2E tests
├── server/          # Node.js backend server
│   └── src/         # Server source code
└── scripts/         # Build and test scripts
```

## Need Help?

- Check existing issues for similar problems
- Create a new issue with detailed information
- Include error messages, logs, and steps to reproduce

## Security

- Never commit `.env` files
- Never commit API keys or credentials
- Report security vulnerabilities privately

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
