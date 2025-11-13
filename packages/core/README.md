# Firefly III MCP Server - Core

Core module for the Firefly III MCP (Model Context Protocol) server. This package provides the foundation for interacting with the Firefly III API through the Model Context Protocol.

*[查看中文版](README_ZH.md)*

## Installation

```bash
npm install @firefly-iii-mcp/core
```

## Usage

This package is primarily used by the `@firefly-iii-mcp/local` and `@firefly-iii-mcp/cloudflare-worker` packages, but can also be used directly to create custom MCP server implementations.

```typescript
import { getServer, McpServerConfig } from '@firefly-iii-mcp/core';

// Create configuration
const config: McpServerConfig = {
  pat: 'YOUR_PERSONAL_ACCESS_TOKEN',
  baseUrl: 'YOUR_FIREFLY_III_URL'
};

// Get server instance
const server = getServer(config);

// Connect to a transport
// Example using StdioServerTransport
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Features

- Provides complete interaction with the Firefly III API
- Implements the Model Context Protocol standard
- Supports multiple transport methods (stdio, HTTP, etc.)

## Requirements

- Node.js >= 20
- ESM module support

## Development

This package is part of a monorepo managed with Turborepo. Please refer to the [CONTRIBUTING.md](../../CONTRIBUTING.md) file in the project root for detailed contribution guidelines.

### Regenerating tools

The build step runs `scripts/generate-tools.ts`, which dereferences the Firefly III OpenAPI schema. By default it always loads the bundled snapshot in `packages/core/assets/firefly-iii-6.2.13-v1.yaml`, so no external download is required.

If you want to experiment with a different Firefly version, set one of the following before running `npm run build`:

- `FIREFLY_III_OPENAPI_FILE` – absolute or relative path to a local Firefly III OpenAPI YAML file (highest priority)
- `FIREFLY_III_OPENAPI_URL` – alternate URL that serves the schema

If both are unset the bundled snapshot is used, ensuring builds succeed even in restricted environments.

## License

This project is licensed under the [MIT License](../../LICENSE). 
