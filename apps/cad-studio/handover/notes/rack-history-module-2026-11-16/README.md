# Rack module ownership and History (#30)

Native reproduction confirmed that changing a linked rack's stored module2→3 left mesh positions, indices and volume identical: the kernel takes the linked gear's normal module instead. History no longer offers that ineffective input. Standalone rack Module still edits geometry and supports its existing binding contract; a captured standalone setter/binder cannot overwrite the module after the rack becomes linked. Missing links are not guessed or normalized.

The implicit Root fillet display and default-reset comparison now use0.38 times the current parent gear's normal module, rather than the stale creation-time copy. An explicit root radius/binding remains its own value. Derived module parameters are read without marking the root radius itself as directly bound. Missing/non-gear parents yield an unknown default rather than a false stored-module radius. Existing optional-field binding limits are not expanded.

The Browser/History feature label also names the linked gear's current module or parameter. Without parent context it says which feature the rack links to, rather than asserting a stale module. Stored snapshots are not rewritten. No App props, model schema, kernel geometry, matching tolerance or manufacturing capability changed.

## Verification

- Original Module tests:3 FAIL/1 PASS. Original default root check:0.76 versus expected1.14. Native evidence proves stored-module edits had no geometry effect.
- Final focused6 + editFields5 =11/11 PASS, covering latest nodes, standalone editing/binding, stale setters, missing references, explicit root values, parent/own parameter distinction, numeric/parameter/missing-parent labels. Existing primitives19/19 also passed; native helical/straight/meshing regression tests retained.
- Frozen actual Studio `/tmp/cad-rack-history-browser-02` PASS. Linked Rack omits Module; parent Gear module2→3 changes the actual rack length. Undo/Redo, JSON reopen, current labels, default root1.14, parent-bound M3 with an editable (not falsely bound) root radius, standalone2→3 and closing an unapplied4 draft all pass.
- Independent Python formula length=teeth×π×module compares native mesh bounds:10teeth module2 gives62.83185307179586mm; module3 gives94.24777960769379mm (pitch6.283185307179586→9.42477796076938mm). Linked and standalone agree, tolerance1e-6mm. Worker and separate product evaluation volumes also agree. This is not manufacturing qualification.
- Browser01 passed the functional checks but visual review found the stale Rack m2 label. Corrected the label and reran02 with explicit numeric and parameter label assertions. Reviewed `06-parent-module-bound-root-editable.png`. No errors, console errors, source changes or downloads.
- Final full Model tsc, Studio tsc, production build4.69s, target lint and diff check PASS. Full Model tsc had reproduced TS7022 in unchanged hole-types.test.ts:97; separate commit5960c3279 adds only a local `StudioDoc['nodes'][number]` annotation, retaining all runtime assertions. Hole7/7, target lint and full Model tsc passed after it. No type cast or check suppression.

#30's listed Spiral Bevel, Throated Worm, V/Timing Belt and Rack failures are now addressed by a708d2f2a,7b9291924,80cefbd7b and this change. Existing selected-gear matching checks from the issue were already PASS; the primitives suite continues to cover their model contracts. No broad release or manufacturing certification is implied. Existing #126 WIP/HOLD untouched.

Model: `node scripts/test.mjs rack-history-module editFields`.
Studio under heavy gate with standard PW_DIR/CHROME: `RACK_HISTORY_FROZEN=1 node test/rack-history-module-browser.mjs <output>`.
