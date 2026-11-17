# #255 final local-library selection acceptance

Parent `151feb46276210062505cb53639a6009ab18fe21`, CI 43979740882 SUCCESS. Existing D572 insertion policy is unchanged. The synchronous exact-entry check, removal of embedded libraries for ID lookup and restoration of the same embedded list now live in the private Studio `librarySelection` adapter. UI commit, refresh and error presentation remain in LibraryPanel. This is a consumer boundary, not a pure function or a new public Model API.

## Original minimum contract audit

| Contract | Evidence |
| --- | --- |
| Consume exactly the selected library/part/variant or refuse a changed source | D572 actual Insert/Place B at 12 mm; same name/version replacement with new-only variant at 14 mm. Current helper tests use exact entry identity, including same ID/version replacement; current UI rechecks B origin/version/recipe for both actions. |
| Do not display B but silently insert embedded A | Same synchronous strip/restore policy. Current actual UI consumes B and retains embedded A's agent/unconfirmed metadata. ID-only Model API retains its existing document-priority policy. |
| Stale refusal leaves document, registry and user store unchanged | Current tests force a captured stale entry for both actions and assert unchanged document JSON, exact registry object identities, registry content JSON, store bytes and write count. Guard runs before any Model lookup that could register A. |
| Preserve replacement, built-in protection, explicit regenerate and existing parts | Current tests cover successful local replacement, missing part/variant atomic refusal, built-in collision and malformed replacement. Existing nodes, instance placement and embedded list identity stay unchanged. D572 retained Model 7/7 includes explicit newer-version regeneration and Save/Open; no Model implementation changed in these consumer fixes. |
| Preserve provenance, license, estimates and confirmation | Current tests retain embedded A agent/unconfirmed and selected B MIT/estimate/person/confirmed metadata without registry writes during insertion. D572 actual stored source metadata and prior library-tools evidence retained. |
| Same version/different manifest and new-only variants are safe | D572 actual 14 mm new-only variant; current adapter tests distinguish same ID/version by entry identity and consume only B's variant. Missing part/old-only variant throws without changing any captured state. |

The pending-file extension is separately qualified by `library-file-ownership-2026-11-16`: latest file wins, Close cancels old completion, accepted Open cancels it, failed Open retains the current read. No whole-panel remount or team-fetch policy change.

## New verification

- `library-selection` **5/5 PASS**; Studio tsc and targeted lint PASS. Store write failure keeps the existing session-only policy: the live new entry can be used, but prior persisted bytes remain unchanged. This test does not claim persistence succeeded or introduce retry behavior.
- Vite build **5.71 s PASS**.
- Actual Chrome `/tmp/cad-library-selection-acceptance-01/receipt.json`: **4 cases PASS**. Insert and Place use B version 2.0.0 / recipe height 12, preserve embedded A, and first Undo/Redo restores exact documents and store bytes. Malformed JSON and built-in ID collision each wait for their specific refusal text, then verify row/store/document/history/selection unchanged. Errors, console errors, source changes and downloads empty; all browser/server cleanup complete.
- Root viewed `place-accepted.png` showing B 2.0.0 and the placed cylinder; the acceptance worker also viewed the built-in refusal. No independent numerical volume claim is made for this smoke run.

Frozen browser command under shared heavy gate:

```sh
LIBRARY_SELECTION_FROZEN=1 PW_DIR=/Users/user/.cache/barocss-playwright CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node apps/cad-studio/test/library-selection-acceptance-browser.mjs /tmp/new-artifacts
```

Initial unit fixture failures are preserved in `/tmp/cad-library-selection-tests.log` and `...-tests-final.log`: an invalid semver was refused; a legacy sketch without ID was normalized and its string plane had the wrong type. Fixtures were corrected to valid semver and explicit stable ID/DocPlane. Product admission and assertions were not loosened. Final logs: `/tmp/cad-library-selection-{tests,tsc,lint}-final2.log`.

## Retained evidence and limits

D572 (`library-source-selection-2026-11-10/README.md` and `qualification.json`) retains the actual annular-spacer independent geometry, first Undo/Redo, 3,526-byte native Save and fresh Open without B, including exact source/placement. Its fixed receipt remains available at `/Users/user/.cache/barocss-cad-evidence/d572-2026-11-10/fixed01/receipt.json`. These are historical PASS, not rerun today. The new consumer extraction and local read guards do not change saved feature data, Model regeneration or file readers.

All six minimum contracts now have bounded evidence, sufficient to close #255 after this commit's CI succeeds. This is not general library-family or whole-CAD certification. Team network/sharing races, other catalogue readers, actual storage-quota UI, all New/template/recovery permutations and forced stale React click handling are not newly tested. Exact stale-entry behavior is tested at the same production adapter instead. No downloads, exports, native inspector subprocess, GPU shared-code edits, dependencies, schema/migration, original #126 WIP or HOLD changes. #257 SIGKILL and units golden remain unresolved and were not repeated.
