import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { curveLength, directOps, emptyDirect, importSource, type DirectGeometry } from '@barocss/cad-model/engine/direct';
import { joinEndpointGuidance } from '../src/ui/joinEndpointGuidance';
import { TwoCurveRoles } from '../src/ui/TwoCurveRoles';
import { DirectPanel } from '../src/ui/DirectPanel';

type Props = { children?: unknown; [key: string]: unknown };
function elements(node: unknown): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
const line = (id: string, points: number[][]) => `@curve #${id} {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[${points.map(point => `[${point.map(value => value.toFixed(15)).join(',')}]`).join(',')}];weights:[1,1];}`;
function pair(first = [[10, 10, 0], [25, 10, 0]], second = [[25, 15, 0], [40, 15, 0]]) {
  return importSource(emptyDirect(), `@model pair {version:0;length-unit:mm;${line('a', first)}${line('b', second)}}`, 'Pair');
}
const idsOf = (direct: DirectGeometry) => direct.objects.map(object => object.id) as [string, string];
function roles(direct: DirectGeometry, ids: [string, string], onSelect?: (ids: string[]) => void) {
  let view: unknown;
  function Probe() { view = TwoCurveRoles({ direct, ids, onSelect }); return null; }
  renderToStaticMarkup(createElement(Probe));
  const group = elements(view).find(element => element.props['aria-label'] === 'Join endpoints'); assert.ok(group);
  return { view, group };
}

test('Join compares first end to second start and reports 5mm / reverse 30mm / correct 0 without changing sources', () => {
  const direct = pair(), ids = idsOf(direct), before = structuredClone(direct);
  assert.deepEqual(joinEndpointGuidance(direct, ids), { firstDegree: 1, secondDegree: 1, degreeCompatible: true, firstEnd: [25, 10, 0], secondStart: [25, 15, 0], gap: 5, matches: false, reverseMatches: false });
  assert.throws(() => directOps.joinCurves(direct, ...ids), /exactly numerically equal/);
  const moved = directOps.move(direct, [ids[1]], [0, -5, 0]), movedBefore = structuredClone(moved);
  const reverse = [ids[1], ids[0]] as [string, string];
  assert.deepEqual(joinEndpointGuidance(moved, reverse), { firstDegree: 1, secondDegree: 1, degreeCompatible: true, firstEnd: [40, 10, 0], secondStart: [10, 10, 0], gap: 30, matches: false, reverseMatches: true });
  assert.throws(() => directOps.joinCurves(moved, ...reverse), /exactly numerically equal/);
  assert.equal(joinEndpointGuidance(moved, ids)?.matches, true); assert.equal(joinEndpointGuidance(moved, ids)?.gap, 0);
  const joined = directOps.joinCurves(moved, ...ids);
  assert.equal(joined.objects.length, 3); assert.equal(joined.objects[0].hidden, true); assert.equal(joined.objects[1].hidden, true);
  assert.equal(curveLength(joined, joined.objects[2].id), 30);
  assert.deepEqual(direct, before); assert.deepEqual(moved, movedBefore);
});

test('named endpoints and opposite-order recovery are local, accessible and require explicit selection action', () => {
  const direct = pair([[10, 10, 0], [25, 10, 0]], [[25, 10, 0], [40, 10, 0]]), ids = idsOf(direct), before = structuredClone(direct);
  const selected = [ids[1], ids[0]] as [string, string], calls: string[][] = [];
  const { view, group } = roles(direct, selected, next => calls.push(next));
  assert.equal(group.props.role, 'group'); assert.equal(group.props.id, 'direct-join-endpoints');
  assert.match(text(group), new RegExp(`First end · Pair · b \\[${ids[1]}\\]: \\(40, 10, 0\\) mm`));
  assert.match(text(group), /Second start · Pair · a/); assert.match(text(group), /Gap: 30 mm/);
  assert.match(text(group), /Use Swap curve order, then try Join/); assert.match(text(group), /requires exact endpoint equality; no snapping/);
  assert.deepEqual(calls, [], 'reading guidance never changes selection');
  const swap = elements(view).find(element => element.props['aria-label'] === 'Swap curve order'); assert.ok(swap);
  (swap.props.onClick as () => void)(); assert.deepEqual(calls, [ids]); assert.deepEqual(selected, [ids[1], ids[0]]);
  assert.doesNotMatch(text(roles(direct, ids).group), /opposite order|try Join/);
  assert.match(text(roles(direct, selected).group), /Select the second curve first, then the first curve/);
  assert.doesNotMatch(text(roles(pair(), ids).group), /opposite order|try Join/);
  const html = renderToStaticMarkup(createElement(DirectPanel, { direct, selected, onChange() {}, onError() {}, onHide() {} }));
  assert.match(html, /<button[^>]*aria-describedby="direct-join-endpoints"[^>]*>Join<\/button>/);
  assert.doesNotMatch(html.match(/<button[^>]*>Join<\/button>/)![0], /\sdisabled(?:=|[\s>])/);
  assert.deepEqual(direct, before);
});

test('tiny and Z gaps keep full precision and exact native mismatch, never a tolerance match', () => {
  const epsilon = 1e-12, direct = pair([[0, 0, 0], [1, 0, 0]], [[1 + epsilon, 0, epsilon], [2, 0, epsilon]]), ids = idsOf(direct);
  const result = joinEndpointGuidance(direct, ids); assert.ok(result); assert.equal(result.matches, false); assert.ok(result.gap > 0);
  const group = roles(direct, ids).group;
  assert.ok(text(group).includes(String(1 + epsilon))); assert.ok(text(group).includes(String(epsilon))); assert.ok(text(group).includes(`Gap: ${String(result.gap)} mm`));
  assert.throws(() => directOps.joinCurves(direct, ...ids), /exactly numerically equal/);
  const z = pair([[0, 0, 0], [1, 0, 0]], [[1, 0, 5], [2, 0, 5]]);
  assert.equal(joinEndpointGuidance(z, idsOf(z))?.gap, 5);
});

test('authored rational/nonuniform endpoints and signed zeros follow native numeric equality, not sampled rounding', () => {
  const direct = importSource(emptyDirect(), '@model rational {version:0;length-unit:mm; @curve #a {type:nurbs;degree:2;knots:[-3,-3,-3,8,8,8];control-points:[[0,0,0],[1,4,0],[2,0,-0]];weights:[1,0.5,2];} @curve #b {type:nurbs;degree:2;knots:[12,12,12,20,20,20];control-points:[[2,0,0],[3,-2,0],[4,0,0]];weights:[3,0.75,1];}}', 'Rational');
  const result = joinEndpointGuidance(direct, idsOf(direct)); assert.ok(result);
  assert.equal(Object.is(result.firstEnd[2], -0), true);
  assert.equal(result.matches, true, 'native === treats negative zero and zero as equal'); assert.equal(result.gap, 0);
  assert.deepEqual(result.secondStart, [2, 0, 0]);
});

test('endpoint match makes no guarantee about other native admission gates; unavailable selection is not guessed', () => {
  const direct = importSource(pair(), '@model degree {version:0;length-unit:mm; @curve #quadratic {type:nurbs;degree:2;knots:[0,0,0,1,1,1];control-points:[[25,10,0],[30,16,0],[40,10,0]];weights:[1,0.5,1];}}', 'Degree');
  const ids: [string, string] = [direct.objects[0].id, direct.objects[2].id], before = structuredClone(direct);
  assert.equal(joinEndpointGuidance(direct, ids)?.matches, true); assert.throws(() => directOps.joinCurves(direct, ...ids), /same native degree/);
  assert.doesNotMatch(text(roles(direct, ids).group), /ready|will join|success|opposite order/i);
  assert.match(text(roles(direct, ids).group), /same native degree for these curves. First: 1; Second: 2/);
  const reversed = text(roles(direct, [ids[1], ids[0]]).group);
  assert.match(reversed, /same native degree for these curves. First: 2; Second: 1/);
  assert.doesNotMatch(reversed, /then try Join|and try Join|endpoints match in the opposite order/);
  const html = renderToStaticMarkup(createElement(DirectPanel, { direct, selected: ids, onChange() {}, onError() {}, onHide() {} }));
  assert.doesNotMatch(html.match(/<button[^>]*>Join<\/button>/)![0], /\sdisabled(?:=|[\s>])/);
  assert.equal(joinEndpointGuidance(direct, ['missing', ids[1]]), null); assert.equal(joinEndpointGuidance(direct, [ids[0], ids[0]]), null);
  const ambiguous = { ...direct, objects: [...direct.objects, direct.objects[0]] };
  assert.equal(joinEndpointGuidance(ambiguous, ids), null);
  const broken = { ...direct, sources: { ...direct.sources, [direct.objects[0].source]: 'invalid source' } };
  assert.equal(joinEndpointGuidance(broken, ids), null);
  assert.match(text(roles(broken, ids).group), /Join endpoints unavailable/);
  assert.deepEqual(direct, before);
});

test('a straight and quadratic span use the existing Swap guidance when the endpoints run in the opposite order', () => {
  const direct = importSource(pair(), '@model degree {version:0;length-unit:mm; @curve #quadratic {type:nurbs;degree:2;knots:[0,0,0,1,1,1];control-points:[[25,10,0],[30,16,0],[40,10,0]];weights:[1,1,1];}}', 'Degree');
  const ids: [string, string] = [direct.objects[0].id, direct.objects[2].id];
  assert.equal(joinEndpointGuidance(direct, ids)?.degreeCompatible, true);
  assert.doesNotMatch(text(roles(direct, ids).group), /same native degree/);
  assert.match(text(roles(direct, [ids[1], ids[0]]).group), /endpoints match in the opposite order/);
});
