# RAGdoll — Release Guide

## Prerequisites

Before your first release you need to:

1. **Generate an updater signing keypair**
   ```bash
   pnpm tauri signer generate -w ~/.tauri/ragdoll.key
   ```
   This prints a **public key** to stdout and writes the private key to `~/.tauri/ragdoll.key`.

2. **Paste the public key** into `src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "<PASTE_PUBLIC_KEY_HERE>",
       ...
     }
   }
   ```

3. **Add secrets to the GitHub repository** (Settings → Secrets → Actions):
   | Secret | Value |
   |---|---|
   | `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/ragdoll.key` |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | passphrase you chose (empty string if none) |

---

## Cutting a release

1. **Update the version** in all three places:
   - `package.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
   - `src-tauri/tauri.conf.json` → `"version"`

2. **Update CHANGELOG.md** with the release notes.

3. **Commit** the version bump:
   ```bash
   git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md
   git commit -m "chore: bump version to v0.x.0"
   ```

4. **Tag and push**:
   ```bash
   git tag v0.x.0
   git push origin main --tags
   ```
   Pushing the tag triggers the `release.yml` workflow.

5. The CI will:
   - Build the Python sidecar with PyInstaller on all four platforms
   - Bundle everything with `tauri build`
   - Create a **draft** GitHub release with installers + `latest.json`

6. **Review the draft release**, verify all artefacts are present, then **publish** it.
   Once published the auto-updater endpoint goes live and existing installs will be notified.

---

## Platform artefacts

| Platform | Bundle type |
|---|---|
| Windows x64 | `.msi` + NSIS `.exe` |
| macOS Intel | `.dmg` |
| macOS Apple Silicon | `.dmg` |
| Linux x64 | `.AppImage` + `.deb` |

---

## Troubleshooting

**`TAURI_SIGNING_PRIVATE_KEY` is missing / wrong** — the build succeeds but the updater won't verify the signature. Double-check the secret value has no trailing newline.

**Sidecar fails to start in release build** — run the app from a terminal so you can see the `[RAGdoll]` log lines. The binary must be placed alongside the main executable and must be executable (`chmod +x` on macOS/Linux).

**`latest.json` is not uploaded** — the `tauri-apps/tauri-action` generates this file automatically when `updaterJsonPath` is set. If it's missing, check the action logs for signing errors.
