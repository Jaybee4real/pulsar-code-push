# @novacraft-engineering/pulsar-code-push

The React Native client for [Pulsar OTA](https://usepulsar.dev): **over-the-air JavaScript updates** for your app, with no app-store review. A maintained **CodePush-compatible** client for React Native, free to start, with self-hosting on paid plans.

This is a full CodePush client (native iOS + Android modules), not a wrapper. It is a fork of
[`@revopush/react-native-code-push`](https://github.com/revopush/react-native-code-push) — itself the
New-Architecture-maintained continuation of Microsoft's original
[`react-native-code-push`](https://github.com/microsoft/react-native-code-push) (archived March 2025).
It speaks the CodePush protocol, so it works against any CodePush-compatible server; without a server URL it uses Pulsar (`https://api.usepulsar.dev`).

## Why

Microsoft App Center CodePush shut down in March 2025 and Expo's EAS Update only covers Expo-managed
projects. Pulsar keeps the CodePush protocol every bare React Native app already knows, adds staged
rollouts, instant rollback, differential updates and per-release health metrics, and can be self-hosted.
Read the full comparison at [usepulsar.dev/codepush-alternative](https://usepulsar.dev/codepush-alternative).

## Install

```bash
yarn add @novacraft-engineering/pulsar-code-push
cd ios && pod install
```

Autolinking registers the native module on both platforms (RN 0.70+, New Architecture supported).

## Point it at Pulsar

**iOS** — `ios/<App>/Info.plist`:

```xml
<key>CodePushDeploymentKey</key>
<string>YOUR_DEPLOYMENT_KEY</string>
<key>CodePushServerURL</key>
<string>https://api.usepulsar.dev</string>
```

**Android** — `android/app/src/main/res/values/strings.xml`:

```xml
<resources>
  <string moduleConfig="true" name="CodePushDeploymentKey">YOUR_DEPLOYMENT_KEY</string>
  <string moduleConfig="true" name="CodePushServerUrl">https://api.usepulsar.dev</string>
</resources>
```

Android reads `CodePushServerUrl` and iOS reads `CodePushServerURL`. Clients from 1.6.2 accept either spelling on both platforms; older ones silently ignore the wrong one.

Deployment keys are shown per app in the Pulsar dashboard.

## Wrap your root component

```jsx
import codePush from '@novacraft-engineering/pulsar-code-push';

function App() { /* … */ }

export default codePush({
  checkFrequency: codePush.CheckFrequency.MANUAL,
  installMode: codePush.InstallMode.ON_NEXT_RESTART,
})(App);
```

The full CodePush API is available — `codePush.sync()`, `codePush.checkForUpdate()`, `SyncStatus`,
`InstallMode`, `CheckFrequency`, `notifyAppReady()`, rollout %, mandatory updates, binary-version
targeting, differential updates, automatic rollback, and download/install telemetry (reported to Pulsar).

Development builds (`__DEV__`, running from Metro) never check for or download updates: `checkForUpdate()`, `sync()`
and the root wrapper all report no update. To test an OTA in a development build, call
`codePush.allowUpdatesInDev(true)` at runtime (for example from a testing screen), set
`codePush({allowUpdatesInDev: true, …})` on the root wrapper, or pass `checkInDev` to the ready-made update sheet.

## Ready-made update sheet

Instead of building your own prompt on top of `checkForUpdate` + `sync`, render the built-in sheet as the
last child of your root component. It checks on launch and whenever the app returns to the foreground,
skips updates the device already rolled back, and never fails a download on a timer.

```jsx
import codePush from '@novacraft-engineering/pulsar-code-push';
import {PulsarUpdateSheet} from '@novacraft-engineering/pulsar-code-push/update';

function App() {
  return (
    <View style={{flex: 1}}>
      <Navigation />
      <PulsarUpdateSheet
        deploymentKey={DEPLOYMENT_KEY}
        serverUrl="https://api.usepulsar.dev"
        theme={{primary: '#4F46E5'}}
        labels={{updateNow: 'Update'}}
      />
    </View>
  );
}

export default codePush({checkFrequency: codePush.CheckFrequency.MANUAL})(App);
```

Props: `deploymentKey`, `serverUrl`, `installMode` (default `ON_NEXT_RESTART`), `mandatoryInstallMode`
(default `IMMEDIATE`), `minimumBackgroundDuration`, `checkInDev`, `theme` (`primary`, `background`, `text`,
`mutedText`, `danger`), `labels` (every string the sheet shows) and `renderContent(update)` to draw your own
panel inside the sheet.

For a fully custom UI, use the hook the sheet is built on:

```jsx
import {usePulsarUpdate} from '@novacraft-engineering/pulsar-code-push/update';

const {status, update, progress, slow, error, install, dismiss, retry, restart} = usePulsarUpdate({deploymentKey});
```

`status` is one of `idle | checking | available | downloading | installing | installed | failed | upToDate`.
`progress.hasRealProgress` stays `false` until the first byte arrives (older iOS binaries report nothing until
the download finishes), so show an indeterminate bar rather than an error. `slow` turns on after 30 seconds
without bytes, or 20 seconds since the last one; it is a hint, not a failure. A failure only comes from the SDK.

Release descriptions can carry config tokens, stripped from the notes the user sees — before a leading `|`
(`silent, next-restart | What's new`), on a trailing `tags:` / `config:` line, or as the whole description:

| Token | Effect |
| --- | --- |
| `silent` | download and install with no UI |
| `mandatory` / `forced` | required update, no Later button |
| `immediate`, `next-restart`, `next-resume`, `next-suspend` | install mode for this release |
| `no-pill` / `nopill` | exposed as `update.noPill` for apps that show a progress pill |

`parseUpdateConfig(description)` is exported if you need the same parsing elsewhere.

## Migrating from CodePush or RevoPush

Swap the import and point `CodePushServerURL` at Pulsar — the native modules, the JS API and the
package-hash algorithm are unchanged, so devices already running your current bundle correctly
report "up to date" instead of re-downloading it.

```diff
-import codePush from 'react-native-code-push';
+import codePush from '@novacraft-engineering/pulsar-code-push';
```

## Releasing

Use the Pulsar CLI ([`@novacraft-engineering/pulsar-cli`](https://github.com/Novacraft-Africa/pulsar-cli)):

```bash
npx @novacraft-engineering/pulsar-cli release MyApp Staging --platform ios --target 1.0.0
```

## Private bundles

With **Private bundles** on, the CLI encrypts each release with your app's bundle key before upload. Pulsar stores and serves only ciphertext, and the phone decrypts the download before installing it. This needs SDK **1.8.0 or later** in the store build; older builds are never offered an encrypted release.

Create a key with `pulsar bundle-key create --app <name>`, back up the file it writes, and put the key string (`kid:base64key`, comma-separate several during rotation) in the store build:

**iOS** — `Info.plist`:

```xml
<key>CodePushBundleKeys</key>
<string>YOUR_KID:YOUR_BASE64_KEY</string>
```

**Android** — `strings.xml`:

```xml
<string moduleConfig="true" name="CodePushBundleKeys">YOUR_KID:YOUR_BASE64_KEY</string>
```

The SDK sends only the key ids (`X-Pulsar-Bundle-Keys`) on update checks, never the key. A download it can't decrypt fails with `decrypt_failed:<cause>` and is never installed.

What it promises: a leaked bucket, download link or backup, anyone intercepting downloads, and anyone browsing Pulsar's storage, Pulsar staff included, see ciphertext. With the local signing that private bundles require, a compromised Pulsar can't push code to your users. What it doesn't: the key ships inside your app, as your base JS bundle does, so anyone who unpacks the app can extract it and decrypt that app's releases. It is not protection against reverse engineering; obfuscation and server-side secrets help with that. Hermes bytecode doesn't, because every bytecode release also ships a readable JavaScript copy. Delivering the key only to verified installs of your app (attested key delivery) is not built yet.

**Export compliance:** if your app declares `ITSAppUsesNonExemptEncryption`, re-check your answer before the first store build with SDK 1.8. Decrypting your own app's content is generally treated as exempt, but confirm it for your app. Keep release behaviour within what store review approved.

## Hermes bytecode

From SDK **1.9.0** the update check tells Pulsar which Hermes bytecode version the app runs (`X-Pulsar-Hermes-Bytecode`, read from `HermesInternal`; nothing is sent on JSC). Pulsar CLI 1.6 compiles each release to Hermes bytecode and uploads a JavaScript copy of the same release with it:

- A build that reports the same bytecode version gets the bytecode, so it no longer parses the JavaScript on every cold start.
- Every other build gets the JavaScript copy: older SDKs, another React Native version's bytecode, JSC. Bytecode doesn't reach a build that hasn't reported its version. Pulsar labels bytecode uploaded without its version from the file itself; for encrypted uploads it relies on the CLI's check.

Any client that doesn't report a bytecode version gets the JavaScript copy, so bytecode speeds up cold starts but doesn't hide your code.

The header is sent from JavaScript and 1.9 has no native changes over 1.8, so a store build on SDK 1.8 starts reporting once it installs an OTA built with SDK 1.9. Until then it gets the JavaScript copy. Guide: [usepulsar.dev/docs/hermes-bytecode](https://usepulsar.dev/docs/hermes-bytecode).

## Related

- [Pulsar vs CodePush vs RevoPush](https://usepulsar.dev/blog/codepush-vs-revopush-vs-pulsar)
- [Microsoft CodePush shutdown: what to move to](https://usepulsar.dev/blog/microsoft-codepush-shutdown-alternatives)
- [How React Native OTA updates actually work](https://usepulsar.dev/blog/how-react-native-ota-updates-work)

## License

MIT. Original CodePush © Microsoft; RevoPush fork © Revopush; this Pulsar distribution © Novacraft Engineering.
See LICENSE.
