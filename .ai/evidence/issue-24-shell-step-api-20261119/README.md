# #24: bounded imported-box Shell STEP API roundtrip

Evidence-only branch; no product changes. Executed source baseline: `1d857f2fcb288461cb905e682200edfc76418231`.

## Result and provenance

PASS in one Node process using existing `exportStudioStep`, `importStep`, `withNode`, `partSnapshot`, `checkBrep` and mass/face APIs. The repository-owned synthetic `two-boxes.step` fixture is hash-pinned by the checker. Source and reread documents both describe the actual imported solids using the public reader's body count.

- Imported box, top `n0.a.top`, Wall 3: before and after STEP text roundtrip, two strict-valid solids have volumes 144 and 468.00000000000006 mm³ (analytic total 612).
- Shell topology remains 11 faces, 24 edges, 16 vertices. The top has inner and outer loops. All eight cavity corners `[3,7] × [3,7] × [3,5]` are asserted independently of volume.
- Both sides report maximum vertex/pcurve gaps 0 and maximum edge-surface gap 4.884981308350689e-15 mm. The receipt retains full strict check reports; the checker asserts strict validity, not a new numerical certification standard.
- Wall 5 control returns `PARAMETER`, feature `n1`, with the exclusive less-than-5 mm opening limit. The checker asserts refusal; the exact diagnostic is retained in the receipt.
- Exported text was 16133 bytes. Its execution-specific SHA256 is retained; a later run may differ because the STEP header includes a timestamp. Native feature history omission is explicitly reported.

The first fixture attempt omitted `import.solids`, causing the expected-two-output assertion to fail before export. Corrected fixture metadata comes from `importStep(text).bodies.length`, matching the normal import contract. No product changes were needed. The final isolated checkout was clean. The heavy gate was released.

## Repeat

From repository root at the source baseline, with the repository's already installed dependencies and supported Node 22, acquire the local execution gate as required, then:

```sh
node --input-type=module -e 'import {build} from "esbuild"; await build({entryPoints:[".ai/evidence/issue-24-shell-step-api-20261119/check.ts"],outfile:"/tmp/cad24-shell-check.mjs",bundle:true,platform:"node",format:"esm",target:"node22",logLevel:"warning"})'
node /tmp/cad24-shell-check.mjs
```

The published checker only substitutes portable imports and a root-relative fixture path for the executed temporary paths. It has not been re-executed after this path-only publication normalization. No library install is needed, no browser starts, and no STEP download is triggered.

## Limits and existing Sew evidence

This is native Model STEP **in-memory API** validation, not actual Studio export/download/Open interaction, physical disk durability, an independent STEP reader, or external CAD interoperability. No screenshot is applicable. No product, Shell/Sew support, tolerance, or HOLD change; no new CI or full-suite claim. #24 remains open for root acceptance reconciliation.

Existing D1192 `apps/cad-studio/handover/notes/sew-step-fidelity-2026-11-14/qualification.json` already records both 0.02 mm gap source orders explicitly refused by STEP preparation and a no-gap control reopened as one strict solid of 1200 mm³ with zero vertex/edge gaps. The current `packages/barocss-cad/src/io/step.ts` enforces the 1e-6 mm sewn-boundary export limit. That deliberately unsupported gapped output is not reclassified as an untested successful roundtrip here.
