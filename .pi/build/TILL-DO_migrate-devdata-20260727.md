# TILL-DO — migrate-devdata-20260727

## Authority and baseline — PASS
- Direct user authorization covers this host migration only: create `/Volumes/Mac_JH_SSD/DevData.sparsebundle`, populate its named contents, Android symlink cutover after validation, and conditional UTM cutover. ColimaData, Colima/Lima, and unrelated paths are protected.
- External identity rechecked 2026-07-27: `/Volumes/Mac_JH_SSD` is mounted writable external ExFAT (`disk4s1`, UUID `A6865877-7283-37F1-B597-2509463D1CDD`), 318 GiB available (>100 GiB).
- Exact destinations `/Volumes/Mac_JH_SSD/DevData.sparsebundle` and `/Volumes/DevData` were absent; the established non-timestamp backup base names were absent. No collision will be reused or removed.
- Exact-name process checks found UTM, Android Studio, emulator, adb, and listed qemu-system names inactive. Colima/Lima were not queried or changed.

## Continuation gate — PASS
- Direct 2026-07-27 authorization permits literal repair of exactly the seven documented SDK AppleDouble sidecars, then independent structured validation and conditional cutover only within the stated paths; no whole-tree retry or Colima/Lima access is authorized.
- Immediate recheck: DevData remains mounted writable APFS (`disk8s1`, UUID `F4BD8EF6-A43B-4373-86C7-4CEEA1DC2128`) with 84 GiB free; Mac_JH_SSD has 249 GiB free. All six exact source/destination roots exist as real directories and the sparsebundle exists.
- Exact `ps` command-path matching found no UTM, `qemu-system-*`, Android Studio, emulator, or adb process. No Colima/Lima process or path was queried, changed, or stopped.

## Continuation execution stop — BLOCKED
- The attempted `ditto` copy of the seven literal AppleDouble filenames did not retain those filenames: the first post-copy `cmp` found destination `emulator/._LICENSE` absent, and read-only follow-up found all seven destination sidecars absent.
- This is a required path/content-representation mismatch. No retry, cleanup, validation, cutover, runtime invocation, UTM registration, or deletion may proceed without new explicit recovery authorization.

## Contract and scope — PASS
- Sources are real non-symlink directories on APFS `/dev/disk3s5` (Data UUID `E8BE86C2-59AC-4E5D-AB3E-6ABEFB70A5B4`): SDK 16,471,552 KiB logical / 16,208,635 KiB allocated / 138,791 entries; AVD 23,791,820 / 23,916,449 / 97; UTM 29,530,012 / 30,312,026 / 6. Full baseline details will be recorded in the durable receipt.
- Source UTM `config.plist` passes `plutil -lint`. No source contents, VM configuration, guest, emulator, or SDK runtime will be started or modified.
- Android source has four hard-linked regular files. `ditto` documentation confirms metadata, resource forks, xattrs, ACLs, and hard-link preservation. `bsdtar` 3.5.3 documentation confirms APFS mac metadata/xattrs/ACLs, sparse reading/extraction, and preservation permissions; it will be used in a streaming pax copy to retain sparse-file handling and hard links.

## Validation and resources — PASS
- Nondisposable sources are only read/copy/renamed under explicit authorization; no test, boot, server, guest, emulator, image repair, or teardown will run.
- Run-owned durable destination is uniquely absent and will be created only after immediate gate recheck. There is no teardown once an accepted canonical copy exists.
- Validation plan: independent recursive counts; `du` logical/allocated comparison; `plutil`; per-file SHA-256 manifests generated directly from each tree and compared; a checksum dry-run/metadata listing where supported; Android non-stateful `adb version` and `emulator -list-avds` only after symlink resolution. UTM acceptance requires non-booting registration plus stopped-state evidence; otherwise retain its internal source and report PARTIAL.

## Recovery and stop gates — PASS
- Before each source rename, the validated external canonical copy is the byte-for-byte recovery copy; source data is not edited. Timestamped sibling backups will be unique and retained until the corresponding acceptance check passes. This is the viable recovery snapshot because the internal APFS has only 23 GiB free and cannot hold a second 69+ GiB source snapshot.
- Stop without destructive retry on capacity/mount/collision/runtime/copy/validation mismatch, guest start, unsupported semantics, or access outside authorized paths. No sudo, broad deletion, cleanup, auto-mount, or Colima access.
