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
const temporary = await mkdtemp(join(tmpdir(), 'interior-input-hud-'));
let Hud: typeof HudComponent;
const shared = globalThis as typeof globalThis & { __interiorInputReact?: typeof React };
const previousReact = shared.__interiorInputReact;
shared.__interiorInputReact = React;
try {
  const outfile = join(temporary, 'hud.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/Hud.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'hud-ssr-store', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'shared-react' }));
      builder.onLoad({ filter: /.*/, namespace: 'shared-react' }, () => ({ contents: `const React=globalThis.__interiorInputReact; export default React; export const {${Object.keys(React).filter(key => key !== 'default' && /^[$A-Z_a-z][$\w]*$/.test(key)).join(',')}}=React;` }));
      builder.onResolve({ filter: /state\/valueStore$/ }, args => args.importer.endsWith('/Hud.tsx') ? { path: 'store', namespace: 'hud-ssr-store' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'hud-ssr-store' }, () => ({ contents: 'export const useStoreValue=store=>store.get();' }));
    } }],
  });
  ({ Hud } = await import(pathToFileURL(outfile).href));
} finally { shared.__interiorInputReact = previousReact; await rm(temporary, { recursive: true, force: true }); }

function context(): Ctx {
  const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  return { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } };
}
test('actual HUD links each invalid position once and blocks Apply even with an old ready preview', () => {
  const active = newFilletActive('edge', context(), { radius: 1, endRadius: 4, stationMode: 'two-interior', stationAt: 25, stationRadius: 2, station2At: 25, station2Radius: 1 });
  active.preview = 'ok';
  const render = () => renderToStaticMarkup(createElement(Hud, { store: createValueStore<Active | null>(active), onChange() {}, onApply() {}, onCancel() {}, onHoleOptions: () => false }));
  let html = render();
  assert.match(html, /aria-label="Interior 2 position \(%\)"[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]*hud-fillet-interior-station2At/);
  assert.equal(html.split('id="hud-fillet-interior-station2At"').length - 1, 1);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Apply<\/button>/);
  active.values = { ...active.values, station2At: 62.5 };
  html = render(); assert.doesNotMatch(html, /id="hud-fillet-interior-station2At"/);
  active.preview = 'error'; active.error = { title: 'Native geometry refusal', hint: 'Pick another edge.', detail: 'Native radius does not fit.' };
  html = render(); assert.match(html, /Native geometry refusal/);
});
