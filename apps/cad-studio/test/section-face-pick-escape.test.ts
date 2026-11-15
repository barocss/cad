import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { useSectionState as SectionHook } from '../src/viewport/useSectionState';
import { axisPlane, type Section } from '../src/viewport/sectionView';
import { useViewportPicking } from '../src/viewport/useViewportPicking';
import { SectionBar } from '../src/ui/SectionBar';

// Run the real state hook with deterministic React slots, including the render gap
// between Escape and the next pointer event. This does not simulate DOM focus.
type Hooks = { useState(value: unknown): unknown; useRef(value: unknown): unknown; useMemo(make: () => unknown): unknown };
const shared = globalThis as typeof globalThis & { __sectionEscapeHooks?: Hooks };
const studio = existsSync(resolve('src/viewport/useSectionState.ts')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'section-escape-'));
let useSectionState: typeof SectionHook;
try {
  const outfile = join(temporary, 'section.mjs');
  await build({ entryPoints: [join(studio, 'src/viewport/useSectionState.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'section-hooks', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'section-hooks' }));
      builder.onLoad({ filter: /.*/, namespace: 'section-hooks' }, () => ({ contents:
        'export const useState=(v)=>globalThis.__sectionEscapeHooks.useState(v),useRef=(v)=>globalThis.__sectionEscapeHooks.useRef(v),useMemo=(f)=>globalThis.__sectionEscapeHooks.useMemo(f),useCallback=(f)=>f,useSyncExternalStore=(_s,get)=>get();' }));
    } }],
  });
  ({ useSectionState } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }

function rig(run: (render: () => ReturnType<typeof SectionHook>) => void) {
  const previous = shared.__sectionEscapeHooks, slots: unknown[] = []; let index = 0;
  shared.__sectionEscapeHooks = {
    useState(value) {
      const i = index++; if (!(i in slots)) slots[i] = value;
      return [slots[i], (next: unknown) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo(make) { const i = index++; if (!(i in slots)) slots[i] = make(); return slots[i]; },
    useRef(value) { const i = index++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
  };
  try { run(() => { index = 0; return useSectionState('webgpu'); }); }
  finally { shared.__sectionEscapeHooks = previous; }
}
const section: Section = { mode: 'planes', planes: [axisPlane('x', 10, 'positive'), axisPlane('y', 6, 'positive'), axisPlane('z', 4, 'positive')] };

test('Escape retires each plane picker synchronously and preserves the section, including live drag state', () => {
  rig(render => {
    let state = render(); state.setSection(section); state = render();
    for (const plane of [0, 1, 2]) {
      state.setSectionFacePick(plane); state = render();
      assert.equal(state.sectionFacePickRef.current, plane);
      assert.equal(state.cancelSectionFacePick(false), true);
      assert.equal(state.sectionFacePickRef.current, null, 'no queued face event can consume the canceled request');
      state = render(); assert.equal(state.sectionFacePick, null); assert.equal(state.section, section);
      assert.equal(state.sectionRef.current, section);
    }
    const dragging = { ...section, planes: [...section.planes] };
    state.dragSection(() => dragging, false); state = render();
    state.setSectionFacePick(1); state = render();
    assert.equal(state.cancelSectionFacePick(false), true);
    assert.equal(state.sectionLive.get(), dragging, 'canceling a pick does not commit or discard a section drag');
    assert.equal(render().section, dragging);
  });
});

test('held Escape repeats remain consumed; a new idle Escape permits ordinary clearing and rearming works', () => {
  rig(render => {
    let state = render(); assert.equal(state.cancelSectionFacePick(false), false);
    assert.equal(state.cancelSectionFacePick(true), false);
    state.setSectionFacePick(0); state = render();
    assert.equal(state.cancelSectionFacePick(false), true); state = render();
    for (let i = 0; i < 4; i++) assert.equal(state.cancelSectionFacePick(true), true);
    assert.equal(state.cancelSectionFacePick(false), false, 'new nonrepeat press reaches idle selection clearing');
    assert.equal(state.cancelSectionFacePick(true), false);
    state.setSectionFacePick(2); state = render(); assert.equal(state.cancelSectionFacePick(false), true);
    state = render(); assert.equal(state.sectionFacePick, null);
  });
});

test('a face click after cancellation follows ordinary section selection, not a section plane replacement', () => {
  const doc = rectanglePart(20, 12, 8), before = structuredClone(doc), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const face = evaluated.bodies[0].mesh.faces.findIndex(f => f.kind === 'plane'); assert.ok(face >= 0);
  const hit = { face: { body: 0, face }, edge: null, point: null };
  rig(render => {
    let state = render(); state.setSection(section); state.setSectionFacePick(2); state = render();
    let selection: Selection = { faces: [], edges: [], bodies: [0] }, replacements = 0, notices = 0;
    let picking!: ReturnType<typeof useViewportPicking>;
    const options = { doc, modelUnavailable: false, nativeVertexReady: false, nativePlanePickState: { current: {} },
      sectionPickRef: { current: (picked: typeof hit) => ({ ...picked, cap: false }) },
      activeStore: { get: () => null }, setActive() {}, measure: null, assembly: { pick: () => false },
      sectionRef: state.sectionRef, sectionFacePickRef: state.sectionFacePickRef, viewBodiesRef: { current: evaluated.bodies },
      sectionBoxRef: { current: { min: [0, 0, 0], max: [20, 12, 8] } }, setSection() { replacements++; },
      setSectionFacePick: state.setSectionFacePick, setToast() { notices++; }, activeRef: { current: null }, halvesShownRef: { current: false },
      setPick() {}, setInstanceSel() {}, setSelection(next: (s: Selection) => Selection) { selection = next(selection); }, directSel: [], setDirectSel() {}, setMeasure() {},
      measureNativeReady: { current: false }, measureInstances: { current: new Map() }, placedMeasureContextReady: () => false,
      pickFilterRef: { current: 'all' }, onReferenceFacePick: () => false, onRevolveAxisPick: () => false, onTransformFacePick: () => false,
      retargetSweep: () => false, scene: { active: null, section, sketch: false, bodies: evaluated.bodies, selection, setMenu() {} },
    } as unknown as Parameters<typeof useViewportPicking>[0];
    function Probe() { picking = useViewportPicking(options); return null; }
    renderToStaticMarkup(createElement(Probe));
    assert.equal(state.cancelSectionFacePick(false), true);
    assert.deepEqual(selection, { faces: [], edges: [], bodies: [0] }, 'Escape itself retains selection');
    picking.onPick(hit, false);
    assert.deepEqual(selection, { faces: [hit.face], edges: [], bodies: [] });
    assert.equal(replacements, 0); assert.equal(notices, 0); assert.equal(state.sectionRef.current, section);
  });
  assert.deepEqual(doc, before);
});

test('existing SectionBar removes the waiting status and pressed state without replacing its controls', () => {
  for (const plane of [0, 1, 2]) {
    const html = (facePick: number | null) => renderToStaticMarkup(createElement(SectionBar, { section, facePick,
      setSection() {}, setFacePick() {}, hatch: true, setHatch() {}, box: { min: [0, 0, 0], max: [20, 12, 8] }, onSketch() {}, eye: () => null, onProblem() {} }));
    const armed = html(plane), canceled = html(null);
    assert.match(armed, /Click a flat face/); assert.doesNotMatch(canceled, /Click a flat face/);
    assert.equal((armed.match(/aria-pressed="true"/g) ?? []).length, 2, 'waiting picker and Hatch are pressed');
    assert.equal((canceled.match(/aria-pressed="true"/g) ?? []).length, 1, 'Hatch remains pressed');
    for (const index of [1, 2, 3]) assert.ok(canceled.includes(`aria-label="Section plane ${index} from a face"`));
  }
});
