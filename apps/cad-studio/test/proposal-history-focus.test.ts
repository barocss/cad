import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { ProposalBrowser } from '../src/ui/ProposalBrowser';
import type { ChatColumn as Column } from '../src/layout/ChatColumn';

// Run the actual column with recording refs/layout effects, and inspect the real
// proposal JSX. DOM replacement and native Enter behavior also need browser QA.
type Props = { children?: unknown; [key: string]: unknown };
type View = ReactElement<Props>;
type Hooks = { useRef(value: unknown): unknown; useLayoutEffect(effect: () => void, deps: unknown[]): void };
const shared = globalThis as typeof globalThis & { __proposalHistoryHooks?: Hooks };
const studio = existsSync(resolve('src/layout/ChatColumn.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'cad-proposal-history-'));
let ChatColumn: typeof Column;
try {
  const outfile = join(temporary, 'column.mjs');
  await build({ entryPoints: [join(studio, 'src/layout/ChatColumn.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'column-hooks', setup(builder) {
      builder.onResolve({ filter: /^(react(?:\/jsx-runtime)?|\.\.\/ui\/atoms|\.\/useLayout)$/ }, args => ({ path: args.path, namespace: 'recorder' }));
      builder.onLoad({ filter: /.*/, namespace: 'recorder' }, ({ path }) => ({ contents: path === 'react'
        ? 'export const useRef=(...a)=>globalThis.__proposalHistoryHooks.useRef(...a),useLayoutEffect=(...a)=>globalThis.__proposalHistoryHooks.useLayoutEffect(...a);'
        : path === 'react/jsx-runtime' ? 'export const jsx=(type,props,key)=>({$$typeof:Symbol.for("react.transitional.element"),type,props,key}),jsxs=jsx;export const Fragment=Symbol.for("react.fragment");'
        : path === './useLayout' ? 'export const CHAT_STRIP=44;' : 'export const Icon=()=>null;' }));
    } }],
  });
  ({ ChatColumn } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }

function elements(node: unknown): View[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
const history = (node: unknown) => elements(node).find(el => 'data-proposal-history-toggle' in el.props)!;
const named = (node: unknown, name: string) => elements(node).find(el => el.props['aria-label'] === name)!;
const marker = '[data-proposal-history-toggle]';
function panel(decidedShown: boolean, setDecidedShown: Parameters<typeof ProposalBrowser>[0]['setDecidedShown'] = () => {}) {
  return ProposalBrowser({ controller: { ghost: null, isStale: () => false } as unknown as Parameters<typeof ProposalBrowser>[0]['controller'],
    doc: { ...emptyDoc(), proposals: [{ id: 'P1', status: 'accepted', title: 'Box', summary: 'Box', by: { agent: 'test' }, at: '2026-11-15', base: '0', ops: [],
      risk: { level: 'low', features_touched: 0, references_broken: 0, hard_requirements_changed: [], approval: [] }, decided: { by: 'user', at: '2026-11-15' } }] },
    bodies: [], fresh: true, massReady: true, placedPreviewEnabled: true, decidedShown, setDecidedShown });
}
function fixture() {
  const old = shared.__proposalHistoryHooks;
  const refs: { current: unknown }[] = [];
  let cursor = 0, before: unknown[] | undefined, pending: (() => void) | undefined, focuses = 0, queries = 0;
  let current = { isConnected: true };
  const aside = { contains: (node: unknown) => node === current, querySelector(selector: string) { assert.equal(selector, marker); queries++; return { focus() { focuses++; } }; } };
  shared.__proposalHistoryHooks = {
    useRef(value) { return refs[cursor++] ??= { current: value }; },
    useLayoutEffect(effect, deps) {
      if (!before || !deps.every((value, i) => Object.is(value, before![i]))) pending = effect;
      before = deps;
    },
  };
  const props: Parameters<typeof Column>[0] = { open: false, width: 360, onOpen: () => {}, onWidth: () => {}, openProposals: 0, decided: 1, decidedShown: false,
    onShowDecided: () => { props.decidedShown = !props.decidedShown; }, proposals: null, content: 'chat' };
  return { props,
    render() {
      cursor = 0; props.proposals = panel(props.decidedShown, next => { props.decidedShown = typeof next === 'function' ? next(props.decidedShown) : next; });
      const tree = ChatColumn(props) as View;
      (tree.props.ref as { current: unknown }).current = aside;
      const effect = pending; pending = undefined; effect?.();
      return tree;
    },
    capture(tree: View, owned = true) {
      const toggle = owned ? current : { isConnected: true };
      (tree.props.onClickCapture as (event: unknown) => void)({ currentTarget: aside, target: { closest(selector: string) { assert.equal(selector, marker); return toggle; } } });
    },
    activate(tree: View) { this.capture(tree); (history(tree).props.onClick as () => void)(); },
    replace() { current.isConnected = false; current = { isConnected: true }; },
    get focuses() { return focuses; }, get queries() { return queries; },
    cleanup() { shared.__proposalHistoryHooks = old; },
  };
}

test('history activation restores the replacement inside its own column on repeated expand/collapse', () => {
  const f = fixture();
  try {
    let tree = f.render();
    for (let i = 0; i < 4; i++) {
      const toggle = history(tree); assert.ok(toggle);
      assert.equal(toggle.props['aria-pressed'], i % 2 === 1);
      assert.equal(toggle.props['aria-label'], i % 2 ? 'Hide decided proposals' : 'Show decided proposals');
      f.activate(tree); f.replace(); tree = f.render();
      assert.equal(f.focuses, i + 1); assert.equal(f.queries, i + 1);
    }
  } finally { f.cleanup(); }
});

test('unrelated updates, foreign toggles and surviving panel buttons do not request focus', () => {
  const f = fixture();
  try {
    let tree = f.render(); assert.equal(f.focuses, 0);
    f.props.decidedShown = true; f.replace(); tree = f.render(); assert.equal(f.focuses, 0, 'programmatic expansion');
    f.capture(tree, false); f.props.decidedShown = false; f.replace(); tree = f.render(); assert.equal(f.focuses, 0, 'foreign toggle');
    f.props.openProposals = 1; tree = f.render();
    f.activate(tree); tree = f.render(); assert.equal(f.focuses, 0, 'same panel button survives');
    f.props.decidedShown = false; f.replace(); f.render(); assert.equal(f.focuses, 0, 'previous activation was consumed');
    assert.equal(f.queries, 0);
  } finally { f.cleanup(); }
});

test('panel toggle exposes its next action and pressed state and keeps decided cards intact', () => {
  for (const shown of [false, true]) {
    const view = panel(shown), toggle = history(view);
    assert.equal(toggle.props['aria-pressed'], shown);
    assert.equal(toggle.props['aria-label'], shown ? 'Hide decided proposals' : 'Show decided proposals');
    assert.equal(toggle.props['data-tip'], shown ? 'Hide decided proposals' : 'Show accepted and rejected');
    assert.equal(text(view).includes('accepted by user'), shown);
  }
});

test('closed Model keeps Open chat without redundant copy and Drawing keeps it disabled', () => {
  const f = fixture();
  try {
    f.props.decidedShown = true;
    let tree = f.render(); const calls: boolean[] = []; f.props.onOpen = open => calls.push(open); tree = f.render();
    assert.equal(text(tree).includes('The chat is closed.'), false);
    assert.equal(named(tree, 'Open chat').props.disabled, false);
    (named(tree, 'Open chat').props.onClick as () => void)(); assert.deepEqual(calls, [true]);
    for (const shown of [false, true]) {
      f.props.content = null; f.props.decidedShown = shown; tree = f.render();
      assert.equal(named(tree, 'Open chat').props.disabled, true);
      assert.equal(named(tree, 'Open chat').props.title, 'The chat opens in Model view');
    }
  } finally { f.cleanup(); }
});
