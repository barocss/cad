# #257 retained output independent readback
This is evidence-only, not a product change or a fresh writer/browser/export run.
The retained synthetic symmetric output came from historical run 02; its whole document matched both that run's actual UI snapshot and run 04's accepted symmetric capture in a read-only provenance check. Its original native inspector diagnostic recorded exit 0. The historical oracle failed because it did not decode DXF %%p. The complete run 02 receipt remains FAIL.
The retained saved/deviation output came from run 04's standalone saved stdout. Its whole document equals the actual OPFS saved JSON (2431 bytes), whose hash matches the public 2026-11-16 acceptance record.
Historical final standalone writer still failed with SIGKILL at symmetric; its failed receipt is not replaced. No native writer was rerun.
Run: python3 -I verify.py
The verifier checks pinned artifact hashes, whole document parity, raw L tolerance, independent Decimal unit conversion, SVG's data-dim=L texts, and DXF DIMENSION text plus its referenced BLOCK's TEXT entries. Standard %%p decoding is applied.
Limits: only L symmetric/deviation on the captured fixture. Angle/fit and other geometry families are not newly certified. No new browser, download, native Save/Open, PDF, golden update or full suite. Old browser evidence remains separately documented. This bundle alone does not claim issue closure.
No original full receipt, local paths, profiles or screenshots are included.
