import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline'),pending=process.argv.includes('--pending-baseline');
// Independent tangent-arc oracle copied from ellipse-sketch-browser, not an exact-ellipse-solid claim.
const oracleSource=String.raw`"""Independent check of an ellipse sketch (closed tangent-arc outline of 192 points) and of the exact NURBS curve Make curves writes. Product imports: zero."""
import json, math, sys

data = json.load(sys.stdin)
doc = data['doc']; exp = data['expect']; mode = data['mode']; reported = data.get('volume')
cx, cy = exp['center']; rx = exp['rx']; ry = exp['ry']; ang = exp['angle']
ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
longer = max(rx, ry)

def local(x, y):
    dx, dy = x - cx, y - cy
    return (ca * dx + sa * dy, -sa * dx + ca * dy)
def implicit(x, y):
    u, v = local(x, y)
    return (u / rx) ** 2 + (v / ry) ** 2 - 1

GRID = 256
TABLE = [(rx * math.cos(2 * math.pi * k / GRID), ry * math.sin(2 * math.pi * k / GRID)) for k in range(GRID)]
def distance(x, y):
    u, v = local(x, y)
    best = min(range(GRID), key=lambda k: (TABLE[k][0] - u) ** 2 + (TABLE[k][1] - v) ** 2)
    lo = 2 * math.pi * (best - 1) / GRID; hi = 2 * math.pi * (best + 1) / GRID
    def d2(t): return (rx * math.cos(t) - u) ** 2 + (ry * math.sin(t) - v) ** 2
    for _ in range(80):
        a = lo + (hi - lo) / 3; b = hi - (hi - lo) / 3
        if d2(a) < d2(b): hi = b
        else: lo = a
    return math.sqrt(d2((lo + hi) / 2))

def finite(v, path):
    if isinstance(v, bool): raise AssertionError(('boolean is not a number', path))
    if isinstance(v, (int, float)): assert math.isfinite(v), ('non-finite', path)
    elif isinstance(v, list):
        for i, x in enumerate(v): finite(x, path + '[' + str(i) + ']')
    elif isinstance(v, dict):
        for k, x in v.items(): finite(x, path + '.' + k)
    elif v is None: raise AssertionError(('null', path))
finite(doc, 'doc')
out = {'status': 'PASS', 'productImports': 0, 'mode': mode}

if mode == 'sketch':
    node = doc['nodes'][0]; assert node['kind'] == 'sketch', node['kind']
    outline = node['outline']; assert outline['ellipse'] == {'center': [cx, cy], 'rx': rx, 'ry': ry, 'angle': ang}, ('stored definition', outline['ellipse'], exp)
    pts = outline['points']; n = len(pts); assert n == 192, ('outline points', n)
    bulges = outline.get('bulges') or [0] * n; assert len(bulges) == n, 'one bulge per point'
    tags = node['sideTags']['outer']; assert len(tags) == 192 and len(set(tags)) == 192, ('192 distinct outer side ids', len(tags), len(set(tags)))
    worst_implicit = 0.0; worst_position = 0.0
    for k in range(96):
        t = 2 * math.pi * k / 96; x = rx * math.cos(t); y = ry * math.sin(t)
        ex = cx + ca * x - sa * y; ey = cy + sa * x + ca * y; p = pts[2 * k]
        worst_position = max(worst_position, math.hypot(p[0] - ex, p[1] - ey) / longer)
        worst_implicit = max(worst_implicit, abs(implicit(p[0], p[1])))
    assert worst_implicit <= 1e-9, ('fit points on the exact ellipse', worst_implicit)
    assert worst_position <= 1e-9, ('fit points at the parameter positions', worst_position)
    worst_dist = 0.0; area = 0.0
    for i in range(n):
        p = pts[i]; q = pts[(i + 1) % n]; b = bulges[i]
        area += (p[0] * q[1] - q[0] * p[1]) / 2
        if b == 0:
            samples = [(p[0] + (q[0] - p[0]) * k / 32, p[1] + (q[1] - p[1]) * k / 32) for k in range(33)]
        else:
            c = math.hypot(q[0] - p[0], q[1] - p[1]); m = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
            nx, ny = -(q[1] - p[1]) / c, (q[0] - p[0]) / c; d = (c / 2) * (1 - b * b) / (2 * b)
            ctr = (m[0] + nx * d, m[1] + ny * d); r = math.hypot(p[0] - ctr[0], p[1] - ctr[1])
            start = math.atan2(p[1] - ctr[1], p[0] - ctr[0]); sweep = 4 * math.atan(b)
            samples = [(ctr[0] + r * math.cos(start + sweep * k / 32), ctr[1] + r * math.sin(start + sweep * k / 32)) for k in range(33)]
            end = samples[-1]; assert math.hypot(end[0] - q[0], end[1] - q[1]) <= 1e-7 * longer, ('arc ' + str(i) + ' ends on its chord end', end, q)
            area += r * r / 2 * (sweep - math.sin(sweep))
        for s in samples: worst_dist = max(worst_dist, distance(s[0], s[1]))
    area = abs(area)
    assert worst_dist <= 1e-5 * longer, ('outline within 1e-5 of the longer semi-axis', worst_dist, worst_dist / longer)
    exact = math.pi * rx * ry; rel_exact = abs(area - exact) / exact
    assert rel_exact <= 2e-5, ('area against pi rx ry', area, exact, rel_exact)
    out.update({'points': n, 'sideIds': len(tags), 'worstFitImplicit': worst_implicit, 'worstFitPosition': worst_position, 'worstOutlineDistance': worst_dist, 'worstOutlineDistanceRelative': worst_dist / longer,
                'outlineArea': area, 'exactArea': exact, 'areaRelativeToExact': rel_exact})
    if reported is not None:
        ext = [m for m in doc['nodes'] if m['kind'] == 'extrude' and m['sketch'] == 0]; assert len(ext) == 1, 'one extrude of the sketch'
        h = abs(float(ext[0]['height'])); assert h == exp['height'], ('extrude height', h)
        vol = area * h; rel = abs(vol - reported) / vol; rel_pi = abs(exact * h - reported) / (exact * h)
        assert rel <= 1e-6, ('Studio volume against height x outline area', vol, reported, rel)
        assert rel_pi <= 2e-5, ('Studio volume against pi rx ry height', exact * h, reported, rel_pi)
        out.update({'outlineVolume': vol, 'studioVolume': reported, 'volumeRelativeToOutline': rel, 'volumeRelativeToExact': rel_pi})
elif mode == 'curve':
    curves = data['curves']; assert len(curves) == 1, ('one direct curve', [c['name'] for c in curves])
    c = curves[0]; assert c['name'].startswith('Sketch curve 1'), c['name']
    p = c['degree']; P = c['controlPoints']; W = c['weights']; U = c['knots']; n = len(P) - 1
    assert p == 2, ('degree 2', p); assert len(W) == len(P) and len(U) == len(P) + p + 1, ('lengths', len(P), len(W), len(U))
    assert all(U[i] <= U[i + 1] for i in range(len(U) - 1)), 'knots do not decrease'
    assert len(set(U[:p + 1])) == 1 and len(set(U[-p - 1:])) == 1 and U[0] < U[-1], ('clamped knots', U)
    assert all(w > 0 for w in W), ('positive weights', W); assert any(abs(w - 1) > 1e-6 for w in W), ('rational: some weight differs from 1', W)
    assert all(abs(q[2]) <= 1e-12 for q in P), ('all poles at z 0', [q[2] for q in P])
    assert max(abs(P[0][i] - P[-1][i]) for i in range(3)) <= 1e-9 * longer, ('closed: first pole equals last', P[0], P[-1])
    def find_span(t):
        if t >= U[n + 1]: return n
        lo, hi = p, n + 1; mid = (lo + hi) // 2
        while t < U[mid] or t >= U[mid + 1]:
            if t < U[mid]: hi = mid
            else: lo = mid
            mid = (lo + hi) // 2
        return mid
    def at(t):
        i = find_span(t); N = [0.0] * (p + 1); N[0] = 1.0; left = [0.0] * (p + 1); right = [0.0] * (p + 1)
        for j in range(1, p + 1):
            left[j] = t - U[i + 1 - j]; right[j] = U[i + j] - t; saved = 0.0
            for r in range(j):
                temp = N[r] / (right[r + 1] + left[j - r]); N[r] = saved + right[r + 1] * temp; saved = left[j - r] * temp
            N[j] = saved
        num = [0.0, 0.0, 0.0]; den = 0.0
        for j in range(p + 1):
            w = N[j] * W[i - p + j]; den += w
            for k in range(3): num[k] += w * P[i - p + j][k]
        return [x / den for x in num]
    a = U[p]; b = U[-p - 1]; worst = 0.0; max_u = 0.0; max_v = 0.0; count = 800
    for k in range(count + 1):
        q = at(a + (b - a) * k / count); worst = max(worst, abs(implicit(q[0], q[1]))); assert abs(q[2]) <= 1e-12, ('point at z 0', q)
        u, v = local(q[0], q[1]); max_u = max(max_u, abs(u)); max_v = max(max_v, abs(v))
    assert worst <= 1e-9, ('every point satisfies the ellipse equation', worst)
    assert abs(max_u - rx) <= 1e-3 * rx and abs(max_v - ry) <= 1e-3 * ry, ('the curve reaches both semi-axes', max_u, max_v)
    s0 = at(a); s1 = at(b); assert max(abs(s0[i] - s1[i]) for i in range(3)) <= 1e-9 * longer, ('closed: start equals end', s0, s1)
    worst_product = 0.0
    for e in c['evals']:
        q = at(e['t']); worst_product = max(worst_product, max(abs(q[i] - e['point'][i]) for i in range(3)))
    assert worst_product <= 1e-9 * longer, ('product evaluation equals the oracle evaluation', worst_product)
    out.update({'name': c['name'], 'degree': p, 'poles': len(P), 'weights': W, 'knots': U, 'worstImplicit': worst, 'samples': count + 1, 'maxLocalU': max_u, 'maxLocalV': max_v, 'worstProductDifference': worst_product})
else:
    raise AssertionError(('unknown mode', mode))
print(json.dumps(out, indent=2))
`;
const pins=['apps/cad-studio/test/sketch-ellipse-placement-history-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/sketch/draftHistory.ts'];
const f=await createFlow({name:'sketch-ellipse-placement-history',output:process.argv[2],envFrozen:'SKETCH_ELLIPSE_PLACEMENT_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,oracleSource,qualification:'Observe and qualify completed Ellipse placement draft history, without expanding ellipse geometry support.',limits:['Three-click axis-aligned ellipses, existing 1:5 admission. Existing 192 tangent-arc outline approximation and independent oracle tolerances are retained. Pending tool switching is observation only until baseline.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {checkBrep,brepMassProperties} from '@barocss/cad';console.log(JSON.stringify(partBreps(JSON.parse(readFileSync(process.argv[2],'utf8'))).map(({key,brep})=>({key,check:checkBrep(brep,{strict:true}),volume:brepMassProperties(brep,1).volume}))));
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
const shapes=()=>f.page.locator('.vp-overlay .sk-shape').evaluateAll(es=>es.map(e=>{const b=e.getBBox(),q=n=>Math.round(n*1000)/1000;return {x:q(b.x),y:q(b.y),width:q(b.width),height:q(b.height),construction:e.classList.contains('construction')};}));
const fields=()=>f.sketchPanel().getByRole('group',{name:'Ellipse',exact:true});
async function begin(){await f.page.locator('.mode').getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[60,35]]);}
async function draw(c=[20,15],rx=10,ry=5){await f.tool('Ellipse','i');for(const p of [c,[c[0]+rx,c[1]],[c[0],c[1]+ry]])await f.worldClick(p);}
async function definition(c,rx,ry){for(const [label,v] of [['Centre X',c[0]],['Centre Y',c[1]],['Rx',rx],['Ry',ry],['Angle',0]])assert.equal(Number(await fields().getByLabel(label,{exact:true}).inputValue()),v);}
async function escape(){await f.page.locator('.topbar button.finish').focus();await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});}
async function physical(doc,label){const native=await f.inspect(label,doc);assert.equal(native.length,1,'one native body');const [n]=native;assert.ok(n.check.valid);const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1,'one displayed body');const [b]=bodies;assert.ok(Math.abs(n.volume-b.volume)<1e-6*n.volume);await f.runOracle({doc,mode:'sketch',expect:{center:[20,15],rx:12,ry:6,angle:0,height:3},volume:n.volume},label);return n;}
await f.run(async()=>{
 await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();const empty=await f.doc();
 if(pending){for(const stage of [1,2]){await begin();await f.tool('Ellipse','i');await f.worldClick([20,15]);if(stage===2)await f.worldClick([30,15]);const before=await shapes();await f.tool('Rectangle','r');await f.tool('Ellipse','i');f.report.observations.push({label:'pending-ellipse-tools',stage,before,after:await shapes(),undo:await button('Undo').isEnabled(),panel:await f.sketchPanelText()});await f.snapshot('pending-'+stage);await escape();await f.same(empty);
 await begin();await f.tool('Ellipse','i');await f.worldClick([20,15]);if(stage===2)await f.worldClick([30,15]);await button('New part').click();await f.page.waitForFunction(()=>!document.querySelector('.sk-panel')||!!document.querySelector('[role="dialog"]'));const dialog=f.page.getByRole('dialog',{name:'Discard sketch changes?',exact:true});const prompted=await dialog.isVisible();f.report.observations.push({label:'pending-only-new-part',stage,prompted,sketchVisible:await f.sketchPanel().isVisible(),doc:await f.doc()});await f.snapshot('pending-new-part-'+stage);if(prompted){await dialog.getByRole('button',{name:'Discard changes',exact:true}).click();}await f.sketchPanel().waitFor({state:'hidden'});await f.same(empty);
 }return;}
 await begin();await draw();await definition([20,15],10,5);const first=await shapes();assert.equal(first.length,1);const enabled=await button('Undo').isEnabled();const observation={label:'completed-ellipse',enabled,first};await f.same(empty);await f.snapshot('01-completed');
 if(baseline){if(enabled){await button('Undo').click();observation.afterUndo=await shapes();if(await button('Redo').isEnabled()){await button('Redo').click();observation.afterRedo=await shapes();}}f.report.observations.push(observation);await f.same(empty);await f.snapshot('02-baseline-observed');return;}
 assert.equal(enabled,true);await button('Undo').click();assert.deepEqual(await shapes(),[]);await button('Redo').click();assert.deepEqual(await shapes(),first);await definition([20,15],10,5);
 await draw([45,15],8,4);assert.equal((await shapes()).length,2);await button('Undo').click();assert.deepEqual(await shapes(),first);await button('Undo').click();assert.deepEqual(await shapes(),[]);await button('Redo').click();assert.deepEqual(await shapes(),first);await button('Redo').click();assert.equal((await shapes()).length,2);await button('Undo').click();assert.deepEqual(await shapes(),first);
 // Failed placement must neither remove the prior ellipse nor create an Undo entry.
 await draw([45,15],10,1);await f.sketchPanel().getByRole('alert').waitFor();assert.deepEqual(await shapes(),first);await f.same(empty);await f.snapshot('03-too-narrow-refused');await button('Undo').click();assert.deepEqual(await shapes(),[]);await button('Redo').click();assert.deepEqual(await shapes(),first);await escape();await f.same(empty);
 // Mixed authored drafts: only the last completed placement is undone.
 for(const previous of ['Rectangle','Circle','Slot']){await begin();await f.tool(previous,{Rectangle:'r',Circle:'c',Slot:'o'}[previous]);for(const point of previous==='Rectangle'?[[2,2],[12,8]]:previous==='Circle'?[[7,6],[10,6]]:[[3,6],[12,6],[3,8]])await f.worldClick(point);const before=await shapes();assert.equal(before.length,1);await draw([40,20],8,4);assert.equal((await shapes()).length,2);await button('Undo').click();assert.deepEqual(await shapes(),before);await button('Undo').click();assert.deepEqual(await shapes(),[]);await button('Redo').click();assert.deepEqual(await shapes(),before);
 // A new placement replaces the abandoned redo branch while the Ellipse tool owns a non-ellipse prior shape.
 await draw([42,23],6,3);await definition([42,23],6,3);const replacement=await shapes();assert.equal(replacement.length,2);assert.equal(await button('Redo').isEnabled(),false,'new placement retires the old redo branch');await button('Undo').click();assert.deepEqual(await shapes(),before);await button('Redo').click();assert.deepEqual(await shapes(),replacement);await definition([42,23],6,3);await f.tool('Ellipse','i');assert.deepEqual(await shapes(),replacement);await button('Undo').click();assert.deepEqual(await shapes(),before);await button('Redo').click();assert.deepEqual(await shapes(),replacement);await f.snapshot('mixed-branch-'+previous);await escape();await f.same(empty);}
 await begin();await draw();const beforeRectangle=await shapes();await f.tool('Rectangle','r');await f.worldClick([38,4]);await f.worldClick([50,10]);await button('Undo').click();assert.deepEqual(await shapes(),beforeRectangle);await button('Undo').click();assert.deepEqual(await shapes(),[]);await escape();await f.same(empty);
 // Local Ellipse draft consumes the first Escape; the second leaves sketch editing.
 for(const stage of [1,2]){await begin();await f.tool('Ellipse','i');await f.worldClick([20,15]);if(stage===2)await f.worldClick([30,15]);await f.page.locator('.topbar button.finish').focus();await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor();assert.deepEqual(await shapes(),[]);assert.equal(await button('Undo').isEnabled(),false);await f.same(empty);await f.snapshot('pending-escape-'+stage);await escape();await f.same(empty);}
 // Pending-only geometry is viewport-local and does not create a workspace dirty-draft prompt.
 for(const stage of [1,2]){await begin();await f.tool('Ellipse','i');await f.worldClick([20,15]);if(stage===2)await f.worldClick([30,15]);await button('New part').click();await f.sketchPanel().waitFor({state:'hidden'});assert.equal(await f.page.getByRole('dialog',{name:'Discard sketch changes?',exact:true}).count(),0);await f.same(empty);await f.snapshot('pending-only-new-part-fixed-'+stage);}
 const prompt=()=>f.page.getByRole('dialog',{name:'Discard sketch changes?',exact:true});
 for(const stage of [1,2]){await begin();await draw();const prior=await shapes();await f.tool('Ellipse','i');await f.worldClick([45,15]);if(stage===2)await f.worldClick([53,15]);await button('New part').click();await prompt().getByRole('button',{name:'Keep editing',exact:true}).click();await prompt().waitFor({state:'hidden'});await f.same(empty);assert.deepEqual(await shapes(),prior);if(stage===1)await f.worldClick([53,15]);await f.worldClick([45,19]);await definition([45,15],8,4);await button('Undo').click();assert.deepEqual(await shapes(),prior);await button('Redo').click();assert.equal((await shapes()).length,2);await escape();await f.same(empty);}
 const owner={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[10,8]},{id:'n1',kind:'extrude',sketch:0,height:2}],outputs:{b1:{node:1,side:'solid'}},nextId:2};await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'ellipse-owner.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(owner))});await f.same(owner);await f.ready();await begin();await draw();await f.tool('Ellipse','i');await f.worldClick([35,20]);await f.worldClick([45,20]);await button('New part').click();await prompt().getByRole('button',{name:'Discard changes',exact:true}).click();await f.sketchPanel().waitFor({state:'hidden'});await f.same(empty);await begin();await draw();await button('Undo').click();assert.deepEqual(await shapes(),[]);await f.same(empty);await button('Redo').click();await definition([20,15],10,5);await f.snapshot('new-owner-history');await escape();await f.same(empty);
 await begin();await draw();await definition([20,15],10,5);for(const [label,value] of [['Rx',12],['Ry',6]]){await fields().getByLabel(label,{exact:true}).fill(String(value));await fields().getByLabel(label,{exact:true}).press('Enter');}await definition([20,15],12,6);await button('Undo').click();await definition([20,15],12,5);await button('Undo').click();await definition([20,15],10,5);await button('Redo').click();await button('Redo').click();await definition([20,15],12,6);
 const sketch=(await f.finishSketch('04-finished')).doc;assert.deepEqual(sketch.nodes[0].outline.ellipse,{center:[20,15],rx:12,ry:6,angle:0});await f.openExtrudeHud();const solid=(await f.applyExtrude({distance:3,previous:sketch,label:'05-extruded'})).doc;const n=await physical(solid,'06-native');await f.undo();await f.same(sketch);await f.redo();await f.same(solid);assert.deepEqual(await physical(solid,'07-redo'),n);const saved=await f.save('ellipse-placement');await f.freshOpen(saved.file,saved.doc,'08-reopened');await f.same(solid);assert.deepEqual(await physical(solid,'09-reopened-native'),n);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('10-final');f.report.observations.push({...observation,atomic:true,refusalPreserves:true,panelRegression:true,reopened:true});
});
