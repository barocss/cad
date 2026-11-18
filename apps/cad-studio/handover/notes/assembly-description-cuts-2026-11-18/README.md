# #681: assembly summary after occurrence cuts

Baseline 3a28c7a: two shared 40×40×10 plates, only p2 has radius5 through hole. Actual volume15214.6018366mm³; BOM masses43.2/41.079g. Public get_assembly reported16000mm³ for both. Actual Studio hole and BOM confirmed; no UI output defect is claimed.

Fix changes only nonnested cut occurrence geometry summary to placedBase evaluation. Definition feature count/body keys/member interfaces/mate faces remain unchanged. Existing nested path preserved.

Validation: focused83/83 (summary, assembly-cut, nested-references, instance-patterns), changed-file lint. Edge cut bounds shrink to x60..90 with volume12000, definition faces/keys unchanged; failed cut evaluation does not fallback to original geometry.

Actual frozen Chrome PASS: public summary p2=15214.602, p1=16000; original/shared definition unchanged, Studio/BOM consumption and native Save/Open preserved. All contexts/browser/server closed, source unchanged. Captures show consumer geometry, receipt contains exact public report.

- baseline.png: existing correct Studio/BOM paired with incorrect baseline summary
- fixed.png: same correct consumer with corrected summary
- reopened.png: saved document reopened
