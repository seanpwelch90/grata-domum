# Server operations and recovery

Status: implementation runbook, September 27, 2026. **No production deployment, service installation, real household backup, or restore has been performed by this implementation.** Rehearse these steps with fictional data first. The household owner chooses the production machine, data directory, stable address, and service manager before release.

## What must be preserved

The Next.js server uses SQLite at `$GRATA_DATA/grata.db` and image files under `$GRATA_DATA/media/`. With `GRATA_DATA` unset, it uses `data/` under the process working directory. Always set an **absolute** production path so a changed working directory cannot silently create an empty household. SQLite uses WAL mode; `grata.db-wal` can contain committed transactions not yet in the main file. Never copy only `grata.db` while the application is running.

The database contains household content, password hashes, pairing/session records, Wi-Fi information, and the Home Assistant token. Treat the whole backup, including media, as private. Keep it out of Git, shared screenshots, cloud sync folders without appropriate protection, and coding-agent fixtures. A restored database also restores its authorization state; devices revoked after the backup may regain authorization. Review/revoke them before restoring normal access.

## Prepare and start

Use a maintained Node runtime satisfying `package.json` (minimum 22.13; this checkout was verified with Node 22.19.0) and npm with `package-lock.json`. Run from the repository root. Do not run dev/build/start processes against the same `.next` directory concurrently. A production upgrade needs a maintenance window or a separately built release checkout.

1. Confirm the production data path and take a verified backup before an upgrade.
2. Stop the existing server before replacing its build. Install the checked-in dependencies and build; do not use `npm update` as part of deployment.
3. Start with the same absolute data directory every time. The existing `npm start` binds port 8787 on all interfaces.

Example shell session; replace the data path before using it:

```sh
cd /absolute/path/to/grata-domum
node --version
npm ci
export GRATA_DATA=/absolute/private/path/to/grata-data
npm run build
npm start
```

`npm start` is a foreground process. Closing that terminal stops service unless an independently configured service manager owns it. For the first rehearsal, keep the terminal visible. Confirm the read-only health endpoint:

```sh
curl --fail --silent http://127.0.0.1:8787/api/v1/health
```

An existing household should report `setupRequired: false`. **If it unexpectedly asks for setup, stop and inspect the working directory and `GRATA_DATA`; do not create another household or seed sample content.** Check the admin UI using the known household password. Do not publish its contents as verification evidence.

## Stable LAN address and clients

Reserve the server's address in the router/DHCP configuration, or use a tested local hostname that resolves from both iPad and Apple TV. Record the chosen base URL (for example `http://welcome-host.local:8787`) in the private operational notes, not public fixtures. `localhost` on a guest device means that device, not the home server.

Verify the URL on the actual guest network, including any Wi-Fi client isolation rules. Limit access to the trusted home LAN; do not add router port forwarding or public exposure. LAN HTTP is the current application decision. Credentials and content are not encrypted over that transport. Internet exposure or TLS deployment requires its own reviewed configuration.

Pair clients against the stable address. Changing the server origin requires the documented forget/re-pair flow; do not reuse cached household data under an unrelated address. Confirm that clients reconnect after a normal server restart.

## Restart and reboot service

For foreground operation, stop the owning terminal process with Control-C, wait for it to exit, and repeat `npm start` with the same working directory and `GRATA_DATA`. Verify health, the correct household, and a paired display. A restart must not run setup, reset a database, or remove media/cache directories.

For unattended operation, choose the host's normal service manager (launchd on macOS, systemd on Linux). Its configuration must explicitly specify:

- The absolute supported Node executable; shell/nvm initialization does not run automatically.
- The release working directory and absolute `GRATA_DATA`.
- `NODE_OPTIONS=--experimental-sqlite` and an explicit PATH if starting through npm.
- A non-root service account that can read the checkout and read/write only its private data/log directories.
- The equivalent of `npm start`, one process instance, restart-on-failure policy, and bounded private logs.

Do not install a guessed launch agent or daemon from this document. A macOS LaunchAgent starts at login; it does **not** satisfy a before-login reboot requirement. A service that must run before login needs an intentionally configured daemon and available storage. Record the chosen service identifier and exact stop/start/status commands after configuration. Before release, reboot the host, verify server availability at the intended login stage, then verify both paired native clients reconnect. Until that rehearsal passes, unattended startup is **unverified**.

## Consistent database and media backup

Use a brief maintenance window. Stop **all** processes that can write the household: production server, dev server, scripts, or other checkout using the same `GRATA_DATA`. Wait for their exit and keep them stopped through the database **and media** copy. SQLite's backup API gives a consistent database including WAL transactions; stopping writers also makes that database and the separate media directory one consistent household snapshot.

The following creates a new, uniquely named backup directory; it does not overwrite a previous backup. Set both absolute paths deliberately. The Python standard library is sufficient.

```sh
export GRATA_DATA=/absolute/private/path/to/grata-data
export GRATA_BACKUP_ROOT=/absolute/private/path/to/backups
python3 - <<'PY'
import datetime, hashlib, json, os, pathlib, shutil, sqlite3, tempfile
os.umask(0o077)
source = pathlib.Path(os.environ["GRATA_DATA"])
backup_root = pathlib.Path(os.environ["GRATA_BACKUP_ROOT"])
assert source.is_absolute() and backup_root.is_absolute(), "Use absolute paths"
assert (source / "grata.db").is_file(), "Source database does not exist; stop"
assert source.resolve() not in backup_root.resolve().parents and source.resolve() != backup_root.resolve(), "Keep backups outside the live data directory"
backup_root.mkdir(parents=True, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
target = pathlib.Path(tempfile.mkdtemp(prefix=f"grata-{stamp}-", dir=backup_root))
with sqlite3.connect((source / "grata.db").as_uri() + "?mode=ro", uri=True) as src:
    with sqlite3.connect(target / "grata.db") as dst:
        src.backup(dst)
        assert dst.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
        assert dst.execute("PRAGMA foreign_key_check").fetchall() == []
    dst.close()
src.close()
if (source / "media").exists():
    shutil.copytree(source / "media", target / "media")
else:
    (target / "media").mkdir()
checksums = {str(p.relative_to(target)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(target.rglob("*")) if p.is_file()}
(target / "checksums.json").write_text(json.dumps(checksums, indent=2) + "\n")
print("Verified backup directory:", target)
PY
```

If this command fails, the incomplete directory is **not** a verified backup; preserve the live data and investigate. After success, restart the original service and verify health. Keep multiple dated backups, including one before each upgrade. Store at least one protected copy off the server according to the household owner's chosen retention/encryption policy. Record the application revision and Node version alongside the backup without embedding household credentials.

## Restore rehearsal without overwriting the live house

Do not restore over a running server or copy a live database into test fixtures. Stop the original server first; this also avoids concurrent Next instances writing the same `.next` directory. Keep the original data directory untouched. Set `GRATA_BACKUP` to a verified backup directory and `GRATA_RESTORE_PARENT` to a separate private scratch directory:

```sh
export GRATA_BACKUP=/absolute/private/path/to/backups/grata-TIMESTAMP-UNIQUE
export GRATA_RESTORE_PARENT=/absolute/private/path/to/restore-rehearsals
python3 - <<'PY'
import hashlib, json, os, pathlib, shutil, sqlite3, tempfile
os.umask(0o077)
source = pathlib.Path(os.environ["GRATA_BACKUP"])
parent = pathlib.Path(os.environ["GRATA_RESTORE_PARENT"])
assert source.is_absolute() and parent.is_absolute(), "Use absolute paths"
checksums = json.loads((source / "checksums.json").read_text())
for relative, expected in checksums.items():
    item = (source / relative).resolve()
    assert source.resolve() in item.parents, "Unexpected backup path"
    assert hashlib.sha256(item.read_bytes()).hexdigest() == expected, "Backup checksum mismatch"
parent.mkdir(parents=True, exist_ok=True)
restored = pathlib.Path(tempfile.mkdtemp(prefix="grata-restore-", dir=parent))
shutil.copy2(source / "grata.db", restored / "grata.db")
shutil.copytree(source / "media", restored / "media")
with sqlite3.connect((restored / "grata.db").as_uri() + "?mode=ro", uri=True) as db:
    assert db.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
db.close()
print("Verified restored directory:", restored)
PY
```

Point `GRATA_DATA` at the newly printed restored directory, and start the already-built app bound only to loopback on a rehearsal port:

```sh
export GRATA_DATA=/absolute/private/path/to/restore-rehearsals/grata-restore-UNIQUE
NODE_OPTIONS=--experimental-sqlite ./node_modules/.bin/next start --hostname 127.0.0.1 --port 8791
```

From the server itself, verify health shows the expected setup state. Sign in to the restored admin workspace and inspect known visits and authenticated cover/avatar/map images. Do not connect production clients, generate new pairing, run guest controls, test Home Assistant, or submit changes to the live house during rehearsal. No real household screenshots belong in the repository. Stop the rehearsal process, restore the original `GRATA_DATA` in the production service configuration, then restart and verify the original service. Keep the rehearsal result and backup location in private operations notes.

For actual disaster recovery, use the same verify/copy-to-new-directory process. After reviewing the restored devices and sessions, explicitly change the production service to the verified new directory. Retain the displaced data for recovery; do not delete it to make startup succeed. If an upgraded application migrated the schema, use the corresponding application revision for recovery instead of assuming an older binary can open a newer database.

## Release evidence still required

- Actual host/service configuration and stable LAN URL recorded privately.
- Start, controlled restart, and reboot verified on that host.
- Verified backup and isolated restore with matching media completed.
- Correct household confirmed after restart; paired iPad and Apple TV reconnect.
- Native signing/install/update and physical-device acceptance completed separately in [verification status](../verification.md).
