# D2238 — Compare linked spur gear contact with tooth overlap

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · Base `1ad019681`.

Desktop Studio created a default module 2, 20-tooth spur gear and its 40-tooth **Meshing gear**. Both gears have 10 mm face width and a 60 mm centre distance. The tested placement matches zero relative phase. The mate's absolute rotation is 175.5°.

- **PASS, actual desktop linked pair.** Strict native topology passes on both bodies. Studio reports clear over a full tooth period. The addendum disks have 4 mm of overlap along the centre line. The independent involute check places the selected box in a gap of the linked mate.
- **PASS, overlapping placement control.** The same centres with an independent mate at 180° give a 4.5° relative phase error and a positive interference report. The box [19.9, 15.9, 1] to [20.1, 16.1, 9] mm lies in both ideal tooth cores. Its 0.32 mm³ supplies an independent witness. The minimum angular margins are 0.06883 and 0.03443 radians, clear of the fitted flank error. Actual Studio opened and displayed this independent placement.
- **FAIL, first drivers.** An incorrect source import path, the starter demonstration part and focus on the New part button prevented the first setup attempts. Actual creation and both placement checks passed after the driver corrections.
- **NOT_RUN.** The original screenshot's source document, an exact Boolean intersection volume, other gear families, load behaviour, mobile and full suites. The comparison used the current nominal linked workflow and an authored overlap control. First mechanical CAD remains 8/10.

```sh
bash "$OUT/desktop.sh" baseline-focus
git diff --check
```
