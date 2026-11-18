# #231: pinned COM missing-member recovery

Synthetic native cubes only. This is a test/evidence addition, not a product fix or completion of #231.

Actual Chrome PASS: pin two cubes, History suppress the second, reject the whole pinned set rather than display partial mass, Undo restore both and COM, Redo reject, Clear while unavailable, Undo without resurrecting the pin, explicitly repin, then Open a different document under the same filename/body keys and clear the session. Pin/Clear preserve document, history and dirty state. Analytic total mass is 10.55 g and COM is (5765/211, 5, 5) mm.

Actual01 stopped on an incorrect fixture assumption that ordinary feature Undo clears dirty state. Actual02 stopped on an incorrect fixture assumption that Open disables Undo. Both were fixture-only corrections; existing document-boundary history is preserved. Actual03 completed every listed step.

No delayed Worker delivery/restart, project switch, export, saved-file identity provenance, assembly, dynamics or safety claim. Same-filename Open is existing regression coverage, not a new feature. Existing issue remains OPEN.

Run from apps/cad-studio with PINNED_MASS_RECOVERY_FROZEN=1, PINNED_MASS_RECOVERY_HEAD=<current HEAD>, PW_DIR and CHROME set, then node test/pinned-mass-member-recovery-browser.mjs <external absolute output directory>.

Actual Chrome tested dd40abe23a824c9d5263983291218ff7234af95b. Integration includes #27 596547415 without product edits here. Related Studio tests: 10/10 PASS. Source changes/errors/console errors empty; context, browser and server closed. Public images contain only synthetic test geometry.
