# @novacraft-engineering/pulsar-code-push

The React Native client for [Pulsar](https://usepulsar.dev) — **over-the-air JavaScript updates** for your app, no app-store review. A free, self-hostable **CodePush alternative** for React Native.

This is a full CodePush client (native iOS + Android modules), not a wrapper. It is a fork of
[`@revopush/react-native-code-push`](https://github.com/revopush/react-native-code-push) — itself the
New-Architecture-maintained continuation of Microsoft's original
[`react-native-code-push`](https://github.com/microsoft/react-native-code-push) (archived March 2025).
It speaks the CodePush protocol, so it works against any CodePush-compatible server; it defaults to Pulsar.

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
  <string moduleConfig="true" name="CodePushServerURL">https://api.usepulsar.dev</string>
</resources>
```

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

## Related

- [Pulsar vs CodePush vs RevoPush](https://usepulsar.dev/blog/codepush-vs-revopush-vs-pulsar)
- [Microsoft CodePush shutdown: what to move to](https://usepulsar.dev/blog/microsoft-codepush-shutdown-alternatives)
- [How React Native OTA updates actually work](https://usepulsar.dev/blog/how-react-native-ota-updates-work)

## License

MIT. Original CodePush © Microsoft; RevoPush fork © Revopush; this Pulsar distribution © Novacraft Engineering.
See LICENSE.
