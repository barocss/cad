# #256: cross-document Variant to actual STEP/3MF

Test/evidence only, no product fix. Synthetic same-name documents: A has HeightA20 and unsaved size40 preview. Public Open accepts independent B, HeightB10 with saved Tall22 active. Download STEP/3MF for B Tall22, explicitly Show Master, then download both for B10. All four actual browser download.saveAs files pass independent checks; no Blob/Worker patch or product-import substitute. Each export preserves B document, selection, history, dirty state and displayed input. Show Master itself is a deliberate document edit.

STEP: stdlib Part21 reader validates connected references, one solid, millimetres and eight topological vertex bounds (10×5×22 and 10×5×10). Each file also passes two positive and five corruption controls. Surface evaluation and native solid volume are NOT_CALCULATED; 1100/500 are analytical rectangular-prism expectations, not integrated STEP volume.

3MF: stdlib ZIP/XML reader checks declared millimetres, build/object identity and identity placement, 12 triangles, geometric directed-edge closure, bounds and signed triangle volumes 1100 and 499.99999999999994 mm³. No external slicer or manufacturing approval.

Actual tested source: 0c586b19acb3809d943da4a126c91ceab7aaef6d. Actual01 PASS without rerun. Source/errors/console errors empty; browser/context/server closed. Related Studio export ownership/preparation33/33 and Model O11 variability6/6 PASS. Integration includes #21 01a41b891 separately.

Remaining: OPFS Save/Close/fresh Open, other accepted entry routes, typed/assembly combined outputs, independent STEP surface/solid-volume evaluation. Existing #256 remains OPEN. This is not entire file-format acceptance.

Run from apps/cad-studio with VARIANT_BOUNDARY_EXPORT_FROZEN=1, VARIANT_BOUNDARY_EXPORT_HEAD=<current HEAD>, PW_DIR and CHROME, then node test/variant-boundary-export-browser.mjs <external absolute output directory>. Only synthetic test artifacts are published.
