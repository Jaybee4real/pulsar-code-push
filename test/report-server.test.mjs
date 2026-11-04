import assert from 'node:assert';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../CodePush.js', import.meta.url), 'utf8');
const body = /function pulsarServerFor\(localPackage\) \{[\s\S]*?\n\}/.exec(source)?.[0];
assert.ok(body, 'pulsarServerFor exists');
const pulsarServerFor = new Function(`${body}; return pulsarServerFor;`)();

assert.strictEqual(pulsarServerFor({downloadUrl: 'https://api.pulsar.novacraft.africa/download/a7c5/abc.zip'}), 'https://api.pulsar.novacraft.africa');
assert.strictEqual(pulsarServerFor({downloadUrl: 'https://api.usepulsar.dev/download/app/diff/a__b.zip'}), 'https://api.usepulsar.dev', 'diff bundles too');
assert.strictEqual(pulsarServerFor({downloadUrl: 'http://192.168.1.214:9080/download/app/x.zip'}), 'http://192.168.1.214:9080', 'a local server keeps its port');
assert.strictEqual(pulsarServerFor({downloadUrl: 'https://cdn.revopush.org/bundles/x.zip'}), null, 'an update from another provider keeps the native server');
assert.strictEqual(pulsarServerFor({downloadUrl: 'https://evil.example/x?next=/download/'}), null, 'only a /download/ path counts');
assert.strictEqual(pulsarServerFor({}), null);
assert.strictEqual(pulsarServerFor(null), null);

const report = /const deliveredBy = pulsarServerFor\(statusReport\.package\);[\s\S]*?reportStatusDeploy\(statusReport\.package/.exec(source)?.[0] || '';
assert.ok(/serverUrl: deliveredBy/.test(report) && /getPromisifiedSdk\(requestFetchAdapter, reportConfig\)/.test(report), 'install and rollback reports go to the delivering server');

const android = readFileSync(new URL('../android/src/main/java/com/microsoft/codepush/react/CodePush.java', import.meta.url), 'utf8');
assert.ok(android.includes('getCustomPropertyFromStringsIfExist("ServerUrl")') && android.includes('getCustomPropertyFromStringsIfExist("ServerURL")'), 'Android reads either spelling');
const ios = readFileSync(new URL('../ios/CodePush/CodePushConfig.m', import.meta.url), 'utf8');
assert.ok(ios.includes('@"CodePushServerURL"') && ios.includes('@"CodePushServerUrl"'), 'iOS reads either spelling');

console.log('report-server.test.mjs: all assertions passed');
