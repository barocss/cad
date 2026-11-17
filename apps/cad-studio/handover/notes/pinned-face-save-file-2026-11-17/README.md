# #239: pinned face measurement actual saved-file boundary

2026-11-17. Test/evidence only. Parent `62a98187f642797a4caf362df0d68c90a7d325ad`.

## New bounded actual result

**First run PASS.** Public Inspect → Measure, Top/Bottom canvas picks, and Pin measurement establish the existing 8 mm opposite-cap pin on a 20 × 12 × 8 rectangular Extrude. Pin leaves the accepted Doc, dirty flag and actual Undo/Redo controls unchanged. Public native Save generates one genuine browser download, saved by Playwright `download.saveAs`, not a Blob/anchor interception. An independent Python process opens the resulting file from disk and compares its complete JSON with the pre-pin accepted document. The 465-byte file has no extra pin/session metadata. SHA-256: `d5aed626652f09d755a65e2fae23b0df8102e13dc6c76f9d839ff3813136c0e3`.

A new browser context opens that exact file through File Open. The authored document remains equal, with no pinned panel, transient Measure panel or measurement overlay. This run does not requalify native geometry or distance algorithms.

Actual source capsule: 531 files unchanged through cleanup. Page/console errors and watched changes: zero. Two contexts, browser and server closed; shared gate released and source freeze ended. Both screenshots were directly inspected by the executing agent and parent and contain only a synthetic fixture. PNG01 shows the 8 mm panel and overlay before Save; PNG02 shows the fresh document without either. Raw receipt retains its historical runner visual-review marker; this note records actual inspection separately.

## Research completion matrix: adopt narrowly, defer explicitly

The issue's old header/NOT_RUN describes its initial research, not the present implementation. The current issue has no follow-up comments. The old source issue number in D928–D957 notes is #2337; this audit concerns migrated cad issue #239.

| Original verification/contract | Evidence and disposition |
| --- | --- |
| Existing Measure versus explicit pin/edit routing | D928 actual pin returns to ordinary selection/History. Adopt implemented path, not a new Measure engine. |
| Independent dimensions and first Undo/Redo | D928 demonstrates 8→13.25 mm and back, native dimensions/volume cross-check. Different literal heights than proposed 10→12; same supported cap-pair contract. No new numerical test here. |
| Selection/focus while retaining targets | D928 different-face selection/clear and numeric History editing. Full pan/zoom/resize and all focus combinations are not newly claimed. |
| Identity and missing targets | D930 suppression/deletion with another body occupying the former index; no retarget. Existing helper tests refuse duplicate bodies, missing caps and changed sketch identity. Arbitrary split/merge/general plane families are deferred. |
| Pending/refused/late responses | D929 held genuine candidate/current replies and same-ID Open; D956 controlled Worker error/Retry; D957 Clear before genuine reply delivery. Natural crash/delay and every race combination remain unqualified. |
| Session/files/workspaces | D931 Drawing/Render return, Close/fresh Project Open and repin. Its second clean Save reads existing bytes and is not proof of another write. This new actual download while pinned supplies that missing saved-file boundary without native-folder access. |
| Checks and adoption decision | D928 Model52/Studio14 and types; D931 Model12/Studio103; D956 focused2; D957 syntax/diff evidence are historical, not rerun. This driver syntax/lint and actual run PASS. Adopt the narrow default-XY positive plain rectangular Extrude native opposite-cap pair; defer arbitrary planar pairs/feature families, assemblies, context-menu pinning and broader topology. |

**Closure recommendation:** the research issue can record this bounded adopt/defer outcome. This is not completion of general planar-face pinning, all monitors/workspaces/topologies, or whole CAD. D957's held-reply deferred mass-recovery limitation remains; it is not repaired or retested here. The source naming/schema system, Physics/Motion, native-folder, shared GPU and all other HOLD/WIP scopes are unchanged.

## Reproduction and evidence

Owned driver: `apps/cad-studio/test/pinned-face-save-file-browser.mjs`. No existing product/helper files changed.

```sh
export PATH=$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH
export PW_DIR=$HOME/.cache/barocss-playwright
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
cd apps/cad-studio
node --check test/pinned-face-save-file-browser.mjs
pnpm exec eslint test/pinned-face-save-file-browser.mjs
# After all writers stop, acquire shared heavy gate; release it via EXIT trap.
PINNED_FACE_FILE_FROZEN=1 node test/pinned-face-save-file-browser.mjs /tmp/cad-pinned-face-file-01
```

`createFlow` generates before/frozen/after/after-cleanup source hashes and checks equality. Original full receipt and runtime log remain in `/tmp/cad-pinned-face-file-01/receipt.json` and `/tmp/cad-pinned-face-file-01-run.log`; curated receipt records the raw receipt hash. `pinned-face-save-file-oracle.py` is the independent JSON file reader, and `downloaded-file-oracle.json` is its result. No build, product type check or native suite was repeated because this change is test/evidence only. No executed failure preceded this first actual PASS.

### Historical evidence links

- [D928](../pinned-opposite-face-measure-2026-11-13/README.md)
- [D929](../pinned-face-measure-held-replies-2026-11-13/README.md)
- [D930](../pinned-face-measure-target-removal-2026-11-13/README.md)
- [D931](../pinned-face-measure-project-session-2026-11-13/README.md)
- [D956](../pinned-face-measure-worker-retry-2026-11-13/README.md)
- [D957](../pinned-face-measure-clear-held-2026-11-13/README.md)
