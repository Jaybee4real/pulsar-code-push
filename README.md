# @novacraft-engineering/pulsar-code-push

The React Native client for [Pulsar](https://pulsar.novacraft.africa) — over-the-air JavaScript updates for your app, no app-store review.

This is a full CodePush client (native iOS + Android modules), not a wrapper. It is a fork of
[`@revopush/react-native-code-push`](https://github.com/revopush/react-native-code-push) — itself the
New-Architecture-maintained continuation of Microsoft's original
[`react-native-code-push`](https://github.com/microsoft/react-native-code-push) (archived March 2025).
It speaks the CodePush protocol, so it works against any CodePush-compatible server; it defaults to Pulsar.

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
<string>https://api.pulsar.novacraft.africa</string>
```

**Android** — `android/app/src/main/res/values/strings.xml`:

```xml
<resources>
  <string moduleConfig="true" name="CodePushDeploymentKey">YOUR_DEPLOYMENT_KEY</string>
  <string moduleConfig="true" name="CodePushServerURL">https://api.pulsar.novacraft.africa</string>
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

## Releasing

Use the Pulsar CLI ([`@novacraft-engineering/pulsar-cli`](https://github.com/Novacraft-Africa/pulsar-cli)):

```bash
npx pulsar release MyApp Staging --platform ios --target 1.0.0
```

## License

MIT. Original CodePush © Microsoft; RevoPush fork © Revopush; this Pulsar distribution © Novacraft Engineering.
See LICENSE.
