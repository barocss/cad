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

## Browser tools (WebMCP)

Use a secure Studio page in a browser with WebMCP support. Open **Chat** and click **WebMCP** to share the current part summary and measurements between supported planar faces. Click it again to stop sharing. The volume can be empty while Studio calculates it. Read the summary again after the part mass appears.

Studio shows the proposal controls that match the shared part. **Box** and **Cylinder** can propose the first solid. **Propose** can change the distance of a supported Extrude. On a standalone Cylinder, **Hole** can propose a centered through hole and **Shell** can propose a closed cavity with separate wall, floor and ceiling thicknesses in millimetres.

Click one proposal control to allow one proposal. Click the highlighted control again to revoke it, including while it shows **Evaluating…**. If the browser tool loses a response, check **Proposals** before you grant another request. When a proposal appears, use **Preview**, then **Accept** or **Reject**. Use **Save** to keep the result. After reopening the document, click **WebMCP** again if you want to share it.

## Development

```sh
pnpm --filter @barocss/cad-studio-app type-check
pnpm build
```

See the [Studio guide](../library-docs/docs/studio/index.md), [roadmap](handover/roadmap.md), and [decision log](handover/decisions.md).
