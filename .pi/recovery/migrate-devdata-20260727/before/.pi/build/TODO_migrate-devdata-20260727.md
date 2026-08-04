# TODO — migrate-devdata-20260727

Status: `blocked`
Completed phase: 2. Create and verify run-owned APFS sparsebundle
Current phase: 3. Copy and validate SDK, AVD, and UTM independently — BLOCKED
Next phase: explicit authorization for read-only diagnosis of the seven missing SDK paths and a non-destructive recovery/copy plan
Changed product files: `/Volumes/Mac_JH_SSD/DevData.sparsebundle` and `/Volumes/DevData/MIGRATION_RECEIPT.txt` (new durable destination/evidence)

1. `complete` — Pre-mutation gates
   - Authorized paths/symbols: three declared source roots, exact external destination/mount paths, hdiutil/bsdtar/ditto tools.
   - Prerequisite: external identity/capacity, collisions, exact runtime checks, source baselines, and copy semantics all PASS in TILL-DO.
   - Exit evidence: TILL-DO baseline and validation plan.
2. `complete` — Create and verify DevData sparsebundle
   - Authorized files: `/Volumes/Mac_JH_SSD/DevData.sparsebundle`, `/Volumes/DevData` mount only.
   - Prerequisite: repeat exact collision/capacity check immediately before `hdiutil create`.
   - Exit evidence: final recheck passed at 332,891,392 KiB external free; hdiutil created exact 150 GiB sparsebundle and attached it `-nobrowse` at `/Volumes/DevData` as writable APFS (`disk8s1`, UUID `F4BD8EF6-A43B-4373-86C7-4CEEA1DC2128`), 150 GiB free.
3. `blocked` — Copy and validate SDK, AVD, and UTM independently
   - Authorized files: only `/Volumes/DevData/Android/sdk`, `/Volumes/DevData/Android/avd`, `/Volumes/DevData/UTM/Linux.utm`, receipt.
   - Prerequisite: phase 2 mount verification.
   - Exit evidence: BLOCKED before checksum comparison: SDK source has 138,791 entries / 118,248 files / 91 symlinks / 16,471,552 KiB logical; destination has 138,784 / 118,241 / 91 / 16,113,660 KiB. No source mutation, retry, or deletion occurred. Receipt records exact evidence.
4. `pending` — Android cutover and acceptance
   - Authorized files: exact Android source paths, unique timestamped source siblings, migration-created symlinks.
   - Prerequisite: validated SDK and AVD copies.
   - Exit evidence: resolved symlinks; non-stateful `adb version` and `emulator -list-avds`; expected AVD names; only then exact backups removed.
5. `pending` — Conditional UTM registration/cutover
   - Authorized files: external Linux.utm and unique internal sibling backup only.
   - Prerequisite: validated UTM copy and non-booting registration evidence.
   - Exit evidence: external registration and stopped-state proof, or PARTIAL with internal source retained.
6. `pending` — Receipt and final preservation review
   - Authorized file: `/Volumes/DevData/MIGRATION_RECEIPT.txt`.
   - Prerequisite: all completed/retained outcomes known.
   - Exit evidence: recorded df, validation, mount instruction, backups, focused authorized-path listing, and no Colima interaction.
