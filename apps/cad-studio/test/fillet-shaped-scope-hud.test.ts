import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { Ctx } from '@barocss/cad-model/app/commands';
import { newFilletActive } from '../src/app/filletFamily';
import { createValueStore } from '../src/state/valueStore';
import type { Hud as HudComponent } from '../src/ui/Hud';
import type { Active } from '../src/app/commandState';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Only adapt the external store subscription for SSR; render the real HUD and its field filtering.
const studio = existsSync(resolve('src/ui/Hud.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'shaped-scope-hud-'));
let Hud: typeof HudComponent;
const shared = globalThis as typeof globalThis & { __shapedScopeReact?: typeof React };
const previousReact = shared.__shapedScopeReact;
shared.__shapedScopeReact = React;
try {
  const outfile = join(temporary, 'hud.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/Hud.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'hud-ssr-store', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'shared-react' }));
      builder.onLoad({ filter: /.*/, namespace: 'shared-react' }, () => ({ contents: `const React=globalThis.__shapedScopeReact; export default React; export const {${Object.keys(React).filter(key => key !== 'default' && /^[$A-Z_a-z][$\w]*$/.test(key)).join(',')}}=React;` }));
      builder.onResolve({ filter: /state\/valueStore$/ }, args => args.importer.endsWith('/Hud.tsx') ? { path: 'store', namespace: 'hud-ssr-store' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'hud-ssr-store' }, () => ({ contents: 'export const useStoreValue=store=>store.get();' }));
    } }],
  });
  ({ Hud } = await import(pathToFileURL(outfile).href));
} finally { shared.__shapedScopeReact = previousReact; await rm(temporary, { recursive: true, force: true }); }

function context(): Ctx {
  const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  return { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } };
}

const explanation = 'This count describes the source selection, not the complete fillet scope. Exact tangent scope unavailable.';
const render = (active: Active | null) => renderToStaticMarkup(createElement(Hud, {
  store: createValueStore<Active | null>(active), onChange() {}, onApply() {}, onCancel() {}, onHoleOptions: () => false,
}));
for (const shape of ['conic', 'g2'] as const) test(`${shape} accepted HUD separates source picks from unavailable tangent scope`, () => {
  const active = newFilletActive('edge', context(), { radius: 4, shape, rho: .5, tension: .5 });
  const candidate = active.cmd.build!(active.ctx, active.values), result = evaluateDoc(candidate, 1);
  assert.ok(result.ok); active.preview = 'ok';
  const before = structuredClone({ values: active.values, selection: active.ctx.selection, doc: active.ctx.doc });
  const html = render(active);
  assert.match(html, /Selected source edges<\/b><span>1 edge<\/span>/);
  assert.equal(html.split(explanation).length - 1, 1);
  assert.doesNotMatch(html, /Picked native edges|Tangent edges added/);
  assert.deepEqual({ values: active.values, selection: active.ctx.selection, doc: active.ctx.doc }, before);
  for (const preview of ['busy', 'error', 'input'] as const)
    assert.doesNotMatch(render({ ...active, preview }), /Selected source edges|This count describes/);
  assert.doesNotMatch(render({ ...active, values: { ...active.values, shape: 'circular' } }), /Selected source edges|This count describes/);
  assert.doesNotMatch(render({ ...active, fillet: undefined }), /Selected source edges|This count describes/);
  assert.doesNotMatch(render({ ...active, cmd: { ...active.cmd, id: 'face-fillet' } }), /Selected source edges|This count describes/);
  const exact = render({ ...active, filletScope: { picked: ['one'], added: ['two'], radius: 4 } });
  assert.match(exact, /Picked native edges/); assert.match(exact, /Tangent edges added/);
  assert.doesNotMatch(exact, /Selected source edges|This count describes/);
});
test('face-derived source edges retain their existing meaning, without claiming direct picks', () => {
  const ctx = context(), face = ctx.bodies[0].mesh.faces.find(f => f.name === 'n1.top')!;
  assert.ok(face);
  const active = newFilletActive('edge', { ...ctx, selection: { edges: [], bodies: [], faces: [{ body: 0, face: face.index }] } }, { shape: 'g2', tension: .5 });
  // Rendering contract only, not an assertion that this particular face preview is supported.
  active.preview = 'ok';
  const html = render(active);
  assert.match(html, /Selected source edges/); assert.match(html, /round the picked face/);
  assert.ok(html.includes(explanation)); assert.doesNotMatch(html, /direct picks/);
  assert.equal(render(null), '');
});
