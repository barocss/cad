# BaroCSS CAD documentation

The VitePress site for CAD Studio, Viewer, the TypeScript libraries, and the agent interface. Start with the [getting started guide](docs/guide/getting-started.md).

From the workspace root:

```sh
pnpm dev:docs
pnpm build:docs
pnpm --filter @barocss/library-docs check:docs
```

Write guides in `docs/` and register pages in `docs/.vitepress/sidebar.mjs`. Keep runnable examples in `samples/` and run them with `pnpm --filter @barocss/library-docs test:samples`.
