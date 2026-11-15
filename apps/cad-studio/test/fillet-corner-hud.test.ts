import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { Ctx } from '@barocss/cad-model/app/commands';
import { friendly } from '@barocss/cad-model/engine/errors';
import { edgeFinishFailure } from '../src/app/failedFeature';
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
const temporary = await mkdtemp(join(tmpdir(), 'corner-recovery-hud-'));
let Hud: typeof HudComponent;
const shared = globalThis as typeof globalThis & { __cornerRecoveryReact?: typeof React };
const previousReact = shared.__cornerRecoveryReact;
shared.__cornerRecoveryReact = React;
try {
  const outfile = join(temporary, 'hud.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/Hud.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'hud-ssr-store', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'shared-react' }));
      builder.onLoad({ filter: /.*/, namespace: 'shared-react' }, () => ({ contents: `const React=globalThis.__cornerRecoveryReact; export default React; export const {${Object.keys(React).filter(key => key !== 'default' && /^[$A-Z_a-z][$\w]*$/.test(key)).join(',')}}=React;` }));
      builder.onResolve({ filter: /state\/valueStore$/ }, args => args.importer.endsWith('/Hud.tsx') ? { path: 'store', namespace: 'hud-ssr-store' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'hud-ssr-store' }, () => ({ contents: 'export const useStoreValue=store=>store.get();' }));
    } }],
  });
  ({ Hud } = await import(pathToFileURL(outfile).href));
} finally { shared.__cornerRecoveryReact = previousReact; await rm(temporary, { recursive: true, force: true }); }

function context(): Ctx {
  const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  return { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } };
}

// Render-only fixture; real corner refusal, accepted straight-edge control and
// Circular recovery are tested separately in fillet-corner-recovery.test.ts.
for (const shape of ['conic', 'g2'] as const) test(`actual HUD links the mapped ${shape} failure to Section once without altering the draft`, () => {
  const active = newFilletActive('edge', context(), { radius: 1, shape, rho: .5, tension: .5 }), candidate = active.cmd.build!(active.ctx, active.values), feature = candidate.nodes.at(-1)!;
  const detail = `edge n1.side0|n1.top: a ${shape === 'conic' ? 'conic' : 'G2'} fillet where the ball rolls round an edge at a corner is not supported yet`;
  active.preview = 'error'; active.error = edgeFinishFailure({ ...friendly(detail, 'CAPABILITY'), feature: feature.id }, feature);
  const store = createValueStore<Active | null>(active), before = structuredClone(active.values);
  const render = () => renderToStaticMarkup(createElement(Hud, { store, onChange() {}, onApply() {}, onCancel() {}, onHoleOptions: () => false }));
  const html = render();
  assert.match(html, /aria-label="Section"[^>]*aria-invalid="true"[^>]*aria-describedby="hud-fillet-section-recovery"/);
  assert.equal(html.split('id="hud-fillet-section-recovery"').length - 1, 1);
  assert.equal(html.split('Try Circular with the same picked edges.').length - 1, 1);
  assert.equal(html.split('Kernel detail').length - 1, 1); assert.ok(html.includes(detail));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Apply<\/button>/);
  assert.deepEqual(active.values, before);
  store.set({ ...active, values: { ...active.values, shape: 'circular' }, preview: 'busy' });
  assert.doesNotMatch(render(), /hud-fillet-section-recovery|Try Circular/);
  store.set(null); assert.equal(render(), '');
  store.set({ ...active, error: { ...friendly('Unrelated capability refusal', 'CAPABILITY') } });
  assert.doesNotMatch(render(), /hud-fillet-section-recovery|Try Circular/); assert.match(render(), /Unrelated capability refusal/);
});
