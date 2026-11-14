# BaroCSS CAD

BaroCSS CAD is a TypeScript CAD system with a native modeling kernel, a desktop web Studio, a standalone Viewer and an agent interface.
The workspace includes the CAD React components, format adapters, GPU renderer and CAD-linked physics tools.

## Develop

Use Node 22.19.0 and pnpm 9.15.4.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm dev:viewer
pnpm dev:docs
```

Run `pnpm build` for Studio, `pnpm build:viewer` for Viewer and `pnpm build:docs` for the documentation site.
Run `pnpm type-check`, `pnpm lint` and `pnpm test` for the workspace.

## Project

- [First feature milestones in the standalone repository](docs/migration/engineering-start.md)
- [CAD roadmap](apps/cad-studio/handover/roadmap.md)
- [Decision log](apps/cad-studio/handover/decisions.md)
- [CAD kernel](packages/barocss-cad/README.md)
- [CAD Viewer](apps/cad-viewer/README.md)
- [Documentation](apps/library-docs/docs/index.md)
- [Repository migration](docs/migration/README.md)
- [Historical source](https://github.com/barocss/barocss)
