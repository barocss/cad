# D1399 — reference face cache ownership

## Cause and correction

Resolves #610 at the producer boundary. Reference documents already assign their own feature IDs and the higher Model evaluation key distinguishes those documents. However, the shared worker read slot passes its previous native snapshot to reevaluate. The non-sketch kernel result key omitted the feature owner; resolvedDefinition intentionally removes id fields. Equal geometry under ref2 could therefore reuse ref1's actual B-rep and persistent face names even though the output body key changed.

The non-sketch result-cache key now includes `at`, the owning feature ID. Name-free sketch sharing is unchanged. No face-prefix replacement, shared-mesh mutation, global cache clearing, private worker-slot workaround or relaxed Datum validation is used. Geometry algorithms and admission are unchanged. Same-owner reuse remains; a changed owner rebuilds its own names. Existing malformed saved Datum bindings are not silently retargeted.

## Verification

- Read-only baseline reproduction with current source bundled in memory confirmed both reference read orders leaked the earlier owner's names. An in-memory candidate established the correction before source changes.
- Final focused Kernel66/66 and Model44/44 PASS. Coverage includes equal OBJ/different names, different geometry, both reference read orders, every supported planar face, foreign-face refusal, placement and codec reopening; single/multisolid MILLI/CENTI STEP reference ownership and physical scale; changed-owner rebuild, same-owner identity reuse, analytic producer rename and unrelated-branch/parameter reuse.
- Strict B-rep/tessellation/mass invariants checked for the kernel fixtures. Independent tetra volume1000/6 mm³ retained. STEP scale checks use a1e-9 relative tolerance. Earlier results remain unmodified.
- Kernel typecheck/build-fast, Model typecheck, focused lint, code-shape and diff check PASS. Root Studio TypeScript and production Vite build PASS. These are declared focused suites, not all repository tests or CI qualification.
- Actual Chrome WebGPU at1024×800 and1440×900:34 Datum creations. Two identical authored OBJ references with different names plus a different-size tetra each offer their own four planar face candidates; actual created of.reference/of.face match exactly. Filename insertion order is reversed at1440; reverse evaluation order is separately covered by Kernel/Model tests.
- Actual ref2 X50/Z rotation30, removal with dependent Datum cascade, Undo restoration and new Datum creation, Save/fresh Open and new Datum for all three references PASS. Existing ref1 Keep-out and stock nodes/outputs remain unchanged.
- Actual all-faces/fresh-Open screenshots reviewed; owner labels readable. Final browser source changes/errors empty; four contexts/browser/server closed. Foreign-face refusal and STEP combinations are Model-test coverage, not browser claims.

## Evidence and limitations

Browser `/tmp/d1310-publish.1Wqzsz/d1399-first`; receipt SHA256 `5ab99c95f042a3365932ae08337b0243da07e5d9c4e82d959bbde54190126d58`.
Kernel/Model logs `/tmp/cad-d1399-kernel.Oldqqx`; Studio build log `/tmp/d1310-publish.1Wqzsz/d1399-build.log`.
Frozen product SHA256 `7fac89efc4694374d274891a75c5bdba33e9cbc5c134204a90cc79531c23f7f3`.
Initial test runs exposed test assumptions, not additional product changes: facet edges may lack names; binary floating volume150 may be150.00000000000003; JSON round-trip normalizes signed zero. Tests were corrected to the actual contracts, STEP scale assertions strengthened, then complete focused suites rerun successfully. No tolerance or geometry code was relaxed.
No full performance benchmark, general persistent-name repair, manufacturing, cross-browser, assistive-technology or whole-CAD qualification. Existing HOLDs remain; #608 Rendering stays held. Next #611 handles reference-file read/parse failures locally.
