import assert from 'node:assert';
import {afterEach, test} from 'node:test';
import Module, {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') return {Platform: {OS: 'android', Version: 34}};
  return originalLoad.call(this, request, parent, isMain);
};

const adapter = require('../request-fetch-adapter.js');
const targeting = require('../targeting.js');
const packageJson = require('../package.json');

const updateCheckUrl = 'https://api.usepulsar.dev/v0.1/public/codepush/update_check?deployment_key=abc';
const reportUrl = 'https://api.usepulsar.dev/v0.1/public/codepush/report_status/deploy';
const downloadUrl = 'https://api.usepulsar.dev/download/app/abc.zip';
const HEADER = 'X-Pulsar-Hermes-Bytecode';

function runtimeWith(properties) {
  globalThis.HermesInternal = {getRuntimeProperties: () => properties};
}

async function send(verb, url, body = null) {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (requestUrl, options) => {
    captured = {url: requestUrl, ...options};
    return {status: 200, text: async () => '{}'};
  };
  try {
    const response = await new Promise((resolve, reject) => adapter.request(verb, url, body, (err, result) => (err ? reject(err) : resolve(result))));
    assert.strictEqual(response.statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return captured;
}

afterEach(() => {
  delete globalThis.HermesInternal;
  targeting.setBundleKeyIds([]);
});

test('update_check reports the bytecode version Hermes runs', async () => {
  runtimeWith({'Bytecode Version': 96, 'OSS Release Version': '0.14.1'});
  assert.strictEqual((await send(0, updateCheckUrl)).headers[HEADER], '96');
  runtimeWith({'Bytecode Version': 98});
  assert.strictEqual((await send(0, updateCheckUrl)).headers[HEADER], '98');
});

test('only update_check carries the header', async () => {
  runtimeWith({'Bytecode Version': 96});
  const report = await send(2, reportUrl, JSON.stringify({status: 'DeploymentSucceeded', label: 'v3'}));
  assert.ok(!(HEADER in report.headers));
  assert.ok(!(HEADER in (await send(0, downloadUrl)).headers));
  assert.ok(!(HEADER in (await send(2, updateCheckUrl)).headers), 'a POST to an update_check url is not an update check');
});

test('no header without Hermes', async () => {
  const sent = await send(0, updateCheckUrl);
  assert.ok(!(HEADER in sent.headers));
  assert.strictEqual(sent.headers['X-CodePush-Plugin-Name'], '@novacraft-engineering/pulsar-code-push');
  globalThis.HermesInternal = {};
  assert.ok(!(HEADER in (await send(0, updateCheckUrl)).headers), 'a Hermes without getRuntimeProperties sends nothing');
  globalThis.HermesInternal = {getRuntimeProperties: () => undefined};
  assert.ok(!(HEADER in (await send(0, updateCheckUrl)).headers));
});

test('a runtime that throws never breaks the update check', async () => {
  globalThis.HermesInternal = {
    getRuntimeProperties() {
      throw new Error('not available');
    },
  };
  const sent = await send(0, updateCheckUrl);
  assert.ok(!(HEADER in sent.headers));
  assert.strictEqual(sent.method, 'GET');
  assert.strictEqual(sent.url, updateCheckUrl);
  Object.defineProperty(globalThis, 'HermesInternal', {
    configurable: true,
    get() {
      throw new Error('getter fails');
    },
  });
  assert.ok(!(HEADER in (await send(0, updateCheckUrl)).headers));
});

test('only a positive whole number is sent', async () => {
  for (const value of [0, -96, 96.5, '96', NaN, Infinity, null, {}, [96]]) {
    runtimeWith({'Bytecode Version': value});
    assert.ok(!(HEADER in (await send(0, updateCheckUrl)).headers), `${String(value)} is not sent`);
  }
});

test('the bytecode header sits alongside the bundle key ids', async () => {
  runtimeWith({'Bytecode Version': 96});
  targeting.setBundleKeyIds(['8c731c199b130cb0']);
  const {headers} = await send(0, updateCheckUrl);
  assert.strictEqual(headers[HEADER], '96');
  assert.strictEqual(headers['X-Pulsar-Bundle-Keys'], '8c731c199b130cb0');
  assert.strictEqual(headers['User-Agent'], `Pulsar/${packageJson.version} (Android 34)`);
});
