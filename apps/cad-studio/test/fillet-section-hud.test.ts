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
const temporary = await mkdtemp(join(tmpdir(), 'section-input-hud-'));
let Hud: typeof HudComponent;
const shared = globalThis as typeof globalThis & { __sectionInputReact?: typeof React };
const previousReact = shared.__sectionInputReact;
shared.__sectionInputReact = React;
try {
  const outfile = join(temporary, 'hud.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/Hud.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'hud-ssr-store', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'shared-react' }));
      builder.onLoad({ filter: /.*/, namespace: 'shared-react' }, () => ({ contents: `const React=globalThis.__sectionInputReact; export default React; export const {${Object.keys(React).filter(key => key !== 'default' && /^[$A-Z_a-z][$\w]*$/.test(key)).join(',')}}=React;` }));
      builder.onResolve({ filter: /state\/valueStore$/ }, args => args.importer.endsWith('/Hud.tsx') ? { path: 'store', namespace: 'hud-ssr-store' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'hud-ssr-store' }, () => ({ contents: 'export const useStoreValue=store=>store.get();' }));
    } }],
  });
  ({ Hud } = await import(pathToFileURL(outfile).href));
} finally { shared.__sectionInputReact = previousReact; await rm(temporary, { recursive: true, force: true }); }

function context(): Ctx {
  const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  return { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } };
}
const help = 'Unitless section shape · greater than 0 and less than 1';
for (const [shape,key,label] of [['conic','rho','Rho'],['g2','tension','Tension']] as const) {
  test(`actual ${label} HUD has one linked unitless range, guarded Apply, and no ratio suffix`, () => {
    const active = newFilletActive('edge', context(), { radius: 4, shape, rho: .7, tension: .7 });
    active.preview = 'ok';
    const render = () => renderToStaticMarkup(createElement(Hud, { store: createValueStore<Active | null>(active), onChange() {}, onApply() {}, onCancel() {}, onHoleOptions: () => false }));
    for (const raw of [0, 1, '', -1, 2, NaN, Infinity]) {
      active.values = { ...active.values, [key]: raw };
      const html = render();
      assert.match(html, new RegExp(`aria-label="${label}"[^>]*aria-invalid="true"[^>]*aria-describedby="hud-number-range-${key}"`));
      assert.equal(html.split(help).length - 1, 1);
      assert.match(html, new RegExp(`<span id="hud-number-range-${key}"[^>]*role="status"`));
      assert.match(html, /<button[^>]*disabled=""[^>]*>Apply<\/button>/);
      assert.doesNotMatch(html, /<em>×<\/em>/);
    }
    for (const value of [.005, .995, .65]) {
      active.values = { ...active.values, [key]: value };
      const html = render(); assert.equal(html.split(help).length - 1, 1);
      assert.doesNotMatch(html, new RegExp(`aria-label="${label}"[^>]*aria-invalid`));
      assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Apply<\/button>/);
      assert.match(html, new RegExp(`aria-label="${label}"[^>]*min="0"[^>]*max="1"`));
    }
    active.preview = 'error'; active.error = { title: 'Native geometry refusal', hint: 'Pick another edge.', detail: 'Unrelated native refusal.' };
    assert.match(render(), /Native geometry refusal/);
    active.values = { ...active.values, [key]: 0 }; active.error = { ...active.error, historyField: key };
    assert.doesNotMatch(render(), /Native geometry refusal/);
  });
}
test('an ordinary ratio field retains its multiplier suffix', () => {
  const active = newFilletActive('edge', context()); active.fillet = undefined;
  active.cmd = { ...active.cmd, id: 'scale', label: 'Scale', fields: () => [{ key: 'factor', label: 'Factor', kind: 'ratio' }] };
  active.values = { factor: 2 }; active.preview = 'ok';
  const html = renderToStaticMarkup(createElement(Hud, { store: createValueStore<Active | null>(active), onChange() {}, onApply() {}, onCancel() {}, onHoleOptions: () => false }));
  assert.match(html, /<em>×<\/em>/); assert.doesNotMatch(html, /Unitless section shape/);
});
