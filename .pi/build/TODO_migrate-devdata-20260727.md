# TODO — migrate-devdata-20260727

Status: `partial`
Completed phase: 4. Android cutover and acceptance
Current phase: 5. Conditional UTM registration/cutover — BLOCKED on UTM's visual Move action
Next phase: user performs UTM `Linux` → `Move` to a directory on `/Volumes/DevData`; then verify registry path and remove the redundant validated external pre-copy if appropriate
Changed product files: `/Volumes/Mac_JH_SSD/DevData.sparsebundle`, validated DevData copies, Android SDK/AVD symlinks, and `/Volumes/DevData/MIGRATION_RECEIPT.txt`. Internal UTM source remains canonical. Recovery snapshots: `.pi/recovery/migrate-devdata-20260727/before/`.

1. `complete` — Pre-mutation gates
   - Authorized paths/symbols: three declared source roots, exact external destination/mount paths, hdiutil/bsdtar/ditto tools.
   - Prerequisite: external identity/capacity, collisions, exact runtime checks, source baselines, and copy semantics all PASS in TILL-DO.
   - Exit evidence: TILL-DO baseline and validation plan.
2. `complete` — Create and verify DevData sparsebundle
   - Authorized files: `/Volumes/Mac_JH_SSD/DevData.sparsebundle`, `/Volumes/DevData` mount only.
   - Prerequisite: repeat exact collision/capacity check immediately before `hdiutil create`.
   - Exit evidence: final recheck passed at 332,891,392 KiB external free; hdiutil created exact 150 GiB sparsebundle and attached it `-nobrowse` at `/Volumes/DevData` as writable APFS (`disk8s1`, UUID `F4BD8EF6-A43B-4373-86C7-4CEEA1DC2128`), 150 GiB free.
3. `complete` — Repair and validate SDK, AVD, and UTM independently
   - Authorized files: the seven documented literal SDK sidecars within `/Volumes/DevData/Android/sdk`, `/Volumes/DevData/Android/avd`, `/Volumes/DevData/UTM/Linux.utm`, and receipt.
   - Prerequisite: writable APFS DevData and inactive prohibited runtimes.
   - Exit evidence: all seven sidecars preserved literally; exact path/type sets matched. Full per-file byte comparison passed for SDK, AVD, and UTM. Tree SHA-256 values are recorded in the receipt; destination UTM plist passed `plutil -lint`.
4. `complete` — Android cutover and acceptance
   - Authorized files: exact Android source paths, unique timestamped source siblings, migration-created symlinks.
   - Prerequisite: validated SDK and AVD copies.
   - Exit evidence: SDK and AVD symlinks resolve to DevData; `adb version` passed; AVD listing returned `Pixel_9_Pro_ievo` and `Pixel_9_Pro_oppo`; no runtime remained active; exact backups were removed after acceptance.
5. `blocked` — Conditional UTM registration/cutover
   - Authorized files: external Linux.utm and unique internal sibling backup only.
   - Prerequisite: validated UTM copy and non-booting registration evidence.
   - Exit evidence: external copy is byte-validated and VM remained stopped, but LaunchServices did not change UTM Registry package path. Rollback restored the internal source. UTM's documented visual `Move` action is required; no raw registry edit or guest boot was attempted.
6. `complete` — Receipt and final preservation review
   - Authorized file: `/Volumes/DevData/MIGRATION_RECEIPT.txt`.
   - Prerequisite: completed Android and retained UTM outcomes known.
   - Exit evidence: receipt records hashes, Android acceptance, UTM rollback, manual mount/move action, and final capacity (Data 62 GiB free; Mac_JH_SSD 248 GiB; DevData 84 GiB; ColimaData 55 GiB). Colima remained mounted/running and untouched.
