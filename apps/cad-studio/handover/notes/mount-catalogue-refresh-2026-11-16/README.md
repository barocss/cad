# Mount catalogue refresh (#31, partial)

Reproduced in actual Chrome: start Mount without rows, Cancel, load four sample mounts in Library, close Library and reopen Mount on the plate face. The document contains four rows, but the command's choices remain empty (0 vs 4).

`contentKey` included other shop catalogues but omitted `mounts`. App's evaluated memo therefore retained the earlier document, and Mount's command context read old rows even after reopening. Include mounts alongside the existing catalogue inputs. No active command is silently rebound and no preview hook is modified.

Verification: key changes for load, same-ID replacement and removal; equivalent rows and render-only changes keep the key. Frozen Chrome baseline failed at 0 vs 4; fixed run passed current choices/preview, catalogue Undo/Redo, Mount Apply and Undo/Redo with row provenance retained. Private receipts: `/tmp/cad-mount-catalogue-before2` and `/tmp/cad-mount-catalogue-after`. Screenshots inspected. No physical downloads. Samples are test fixtures, not manufacturing-qualified data.

Mount grouped History is a separate next change; #31 remains open. Existing WIP/HOLD unchanged.
