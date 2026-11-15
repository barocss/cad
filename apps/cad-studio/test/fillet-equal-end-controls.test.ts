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
const temporary = await mkdtemp(join(tmpdir(), 'equal-end-hud-'));
let Hud: typeof HudComponent;
const shared = globalThis as typeof globalThis & { __equalEndReact?: typeof React };
const previousReact = shared.__equalEndReact;
shared.__equalEndReact = React;
try {
  const outfile = join(temporary, 'hud.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/Hud.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'hud-ssr-store', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'shared-react' }));
      builder.onLoad({ filter: /.*/, namespace: 'shared-react' }, () => ({ contents: `const React=globalThis.__equalEndReact; export default React; export const {${Object.keys(React).filter(key => key !== 'default' && /^[$A-Z_a-z][$\w]*$/.test(key)).join(',')}}=React;` }));
      builder.onResolve({ filter: /state\/valueStore$/ }, args => args.importer.endsWith('/Hud.tsx') ? { path: 'store', namespace: 'hud-ssr-store' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'hud-ssr-store' }, () => ({ contents: 'export const useStoreValue=store=>store.get();' }));
    } }],
  });
  ({ Hud } = await import(pathToFileURL(outfile).href));
} finally { shared.__equalEndReact = previousReact; await rm(temporary, { recursive: true, force: true }); }

function context(): Ctx {
  const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  return { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } };
}
test('actual HUD shows zero-end controls only in Varying, without adding explanations or altering the active draft', () => {
  const active = newFilletActive('edge', context(), { radius: 1, endRadius: 0, stationMode: 'ends', stationAt: 25, stationRadius: 2 });
  active.fillet = { ...active.fillet!, radiusMode: 'varying' };
  const before = JSON.stringify(active.values);
  const render = () => renderToStaticMarkup(createElement(Hud, { store: createValueStore<Active | null>(active), onChange() {}, onApply() {}, onCancel() {}, onHoleOptions: () => false }));
  assert.match(render(), /aria-label="Radius controls"/); assert.match(render(), /Ends and interior/); assert.equal(JSON.stringify(active.values), before);
  active.values = { ...active.values, stationMode: 'interior' };
  assert.match(render(), /aria-label="Interior position \(%\)"/); assert.match(render(), /aria-label="Interior radius"/);
  active.fillet = { ...active.fillet!, radiusMode: 'constant' };
  assert.doesNotMatch(render(), /aria-label="(?:Radius controls|Interior position \(%\)|Interior radius|End radius \(0: same\))"/);
});
