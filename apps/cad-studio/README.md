# CAD Studio

The browser app for creating and editing BaroCSS CAD documents. Use it to sketch, model parts, inspect assemblies, build drawings, and review agent proposals. Native `.bcad` files retain editable modeling history.

## Start Studio

From the repository root, use Node.js 22.19.0 and pnpm 9.15.4.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [Studio](http://127.0.0.1:52020). Start a part or open a `.bcad` file. WebGPU is the primary viewport backend. Studio also provides a WebGL2 fallback.

## Local automation

```sh
node apps/cad-studio/scripts/cad-mcp.mjs --doc ./part.bcad
node apps/cad-studio/scripts/cad-cli.mjs --help
```

The [agent guide](../library-docs/docs/agent/index.md) explains tool access and approval. The [MCP and CLI guide](../library-docs/docs/agent/cli.md) covers document paths and command arguments.

## Development

```sh
pnpm --filter @barocss/cad-studio-app type-check
pnpm build
```

See the [Studio guide](../library-docs/docs/studio/index.md), [roadmap](handover/roadmap.md), and [decision log](handover/decisions.md).
