# Revision child admission (#649)

Base `1b8fdbbef`. A synthetic valid schema-4 root linked-route file is accepted by root read/encode. In actual Studio, selecting it as a placed plate's New revision created pending Rev B. Save then failed with `BAD_REFERENCE: Route bundle: nested route bundles are not supported`, **before accepting** the revision. The original placed part remained, but the assembly document could not be saved.

This violates the existing root-only route contract: `route-bundle-admission.test.ts` refuses linked routes under instances and pendingParts, and Insert part already rejects this input. It does not justify expanding nested route support or automatically detaching the file.

`assembly/definitions.ts` now checks each incoming definition in child context using the existing route admission helper before offer, definition edit or acceptance can change state. It checks the incoming part rather than the whole current assembly, preserving recovery by replacing a bad pending candidate with an ordinary file or dismissing it. The existing pending document is retained on refusal. Root file format and normal part revision policy are unchanged.

## Verified

- Unit baseline independently verifies that the route root can encode, but the accepted pending assembly cannot. Offer/edit/accept protection baselines all fail (3/3) before the fix.
- New admission, existing definitions, route admission and assembly-cut regression batch: **68/68 PASS**. Covers nested/pending route children, schema-only and orphan markers, normal and explicitly detached parts, immutable refusal, invalid pending replacement/dismiss and acceptance guard.
- Model and Studio TypeScript **PASS**; changed source/test scoped ESLint and diff whitespace **PASS**.
- Actual baseline **FAIL**, captured at Save refusal after accepted pending route. Actual fixed01 **PASS on first corrected-product run**, no driver correction required. Both frozen source capsules match cleanup.
- Fixed browser: route refusal leaves exact original document; native Save and fresh Open work. An ordinary pending Rev B survives a subsequent refused route offer unchanged. Ordinary acceptance, first Undo/Redo and native Save/fresh Open pass. Two real downloaded native files compare semantically equal to the accepted documents.
- Baseline, refusal and existing-pending screenshots visually reviewed. Independent read-only source review found no blocker.

Limits: one synthetic plate occurrence and a valid synthetic route bundle from the existing admission-test construction. The normal control changes plate height 8→12; this is not new route geometry qualification, route nesting support, automatic detach, STEP exchange or manufacturing certification. Existing WIP/HOLD and PDF/lint limitations outside these paths remain unchanged.

Reproduce from repository root with Node 22:

```
node packages/barocss-cad-model/scripts/test.mjs assembly-revision-admission definitions.test route-bundle-admission assembly-cut
node node_modules/typescript/bin/tsc --noEmit -p packages/barocss-cad-model/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
ASSEMBLY_REVISION_ADMISSION_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/assembly-revision-admission-browser.mjs <fresh output>
```
