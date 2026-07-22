# Android app & PWA

RunPlan installs as an app two ways:

- **Any device (PWA):** open the site → browser menu → *Install app* / *Add to Home
  Screen*. Works on Android, iOS and desktop.
- **Android APK:** **Settings → Install the app → Download for Android**, or fetch
  `/runplan.apk` directly. Open the file to install (allow installs from your browser if
  asked).

## Architecture

The APK is a **Trusted Web Activity** (TWA) — a thin, signed wrapper that opens the live
site full-screen in Chrome's engine. Consequences worth knowing:

- **App content updates automatically with the site.** Deploying new features requires
  no APK rebuild — the wrapper only pins the URL, icon, name and colours.
- Android hides the browser UI only if it can verify the site vouches for the app:
  `public/.well-known/assetlinks.json` must contain the SHA-256 fingerprint of the APK's
  signing key. If an installed app shows a URL bar, that verification failed.
- Chrome must be installed on the device.

The PWA layer that backs this lives in `public/`: `manifest.webmanifest`, icons
(`icons/`), and a deliberately minimal service worker (`sw.js`) — cache-first for hashed
build assets, network-first for pages (plans are never stale) with an offline fallback
page. The session middleware (`src/proxy.ts`) exempts these files plus
`.well-known/` and `runplan.apk` from the login redirect.

## Rebuilding the APK

Only needed for wrapper changes (name, icon, splash/theme colours, start URL) or a
version bump — not for app features. Built with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).

Prerequisites (one-off): Node, JDK 17, Android command-line tools. Two path quirks:

- Bubblewrap validates its `androidSdkPath` by looking for `bin/` (or `tools/`) directly
  inside it, while Gradle/AGP needs a **standard SDK root** (`platforms/`,
  `build-tools/`, …). Satisfy both with a standard layout plus a symlink:
  `ln -s cmdline-tools/latest/bin <sdk-root>/bin`.
- Accept licenses **into that same root**:
  `sdkmanager --licenses --sdk_root=<sdk-root>`, and pre-install
  `platforms;android-<compileSdk>` — an interrupted auto-download can leave a corrupt
  `platforms/android-XX` that AGP rejects with
  `Failed to find target with hash string 'android-XX'` (wipe and reinstall cleanly).

`~/.bubblewrap/config.json`:

```json
{ "jdkPath": "/usr/lib/jvm/java-17-openjdk-amd64", "androidSdkPath": "/opt/android-sdk" }
```

Then, in the TWA project directory (contains `twa-manifest.json`, the keystore and
`keystore-password.txt`):

```bash
export BUBBLEWRAP_KEYSTORE_PASSWORD=$(cat keystore-password.txt)
export BUBBLEWRAP_KEY_PASSWORD=$(cat keystore-password.txt)
bubblewrap update --skipVersionUpgrade   # regenerate the Android project from twa-manifest.json
bubblewrap build --skipPwaValidation
cp app-release-signed.apk <site>/public/runplan.apk   # then restart the app server
```

(To ship a new version, bump `appVersionCode`/`appVersionName` in `twa-manifest.json`
instead of `--skipVersionUpgrade`.)

## Signing key — do not lose it

The keystore lives **outside the repo** in the TWA project directory. All future APKs
must be signed with the same key or Android treats them as a different app (and
`assetlinks.json` verification breaks). Back up `android.keystore` +
`keystore-password.txt`. If the key ever changes, update the fingerprint in
`public/.well-known/assetlinks.json`:

```bash
keytool -list -v -keystore android.keystore -alias runplan | grep SHA256
```
