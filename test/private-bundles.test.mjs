import assert from 'node:assert';
import {test} from 'node:test';
import Module, {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') return {Platform: {OS: 'ios', Version: '17.4'}};
  return originalLoad.call(this, request, parent, isMain);
};

const adapter = require('../request-fetch-adapter.js');
const targeting = require('../targeting.js');
const {AcquisitionManager} = require('../acquisition-sdk.js');
const packageJson = require('../package.json');

const kids = ['8c731c199b130cb0', '301273b80ef1a35f'];
const keyString = '8c731c199b130cb0:AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsXM09o=';

async function captureHeaders(verb, url) {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (requestUrl, options) => {
    captured = options.headers;
    return {status: 200, text: async () => '{}'};
  };
  try {
    await new Promise((resolve, reject) => adapter.request(verb, url, null, (err) => (err ? reject(err) : resolve())));
  } finally {
    globalThis.fetch = originalFetch;
  }
  return captured;
}

const updateCheckUrl = 'https://api.usepulsar.dev/v0.1/public/codepush/update_check?deployment_key=abc';

test('update_check sends the bundle key ids when the build carries keys', async () => {
  targeting.setBundleKeyIds(kids);
  const headers = await captureHeaders(0, updateCheckUrl);
  assert.strictEqual(headers['X-Pulsar-Bundle-Keys'], kids.join(','));
  assert.strictEqual(headers['User-Agent'], `Pulsar/${packageJson.version} (iOS 17.4)`);
});

test('no header when the build has no bundle keys', async () => {
  targeting.setBundleKeyIds([]);
  assert.ok(!('X-Pulsar-Bundle-Keys' in (await captureHeaders(0, updateCheckUrl))));
  targeting.setBundleKeyIds(undefined);
  assert.ok(!('X-Pulsar-Bundle-Keys' in (await captureHeaders(0, updateCheckUrl))));
});

test('only update_check carries the header', async () => {
  targeting.setBundleKeyIds(kids);
  const headers = await captureHeaders(2, 'https://api.usepulsar.dev/v0.1/public/codepush/report_status/deploy');
  assert.ok(!('X-Pulsar-Bundle-Keys' in headers));
});

test('key material never reaches the header, only well-formed ids', async () => {
  targeting.setBundleKeyIds([keyString, 'AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsXM09o=', kids[1], 42, 'ABCDEF0123456789']);
  const headers = await captureHeaders(0, updateCheckUrl);
  assert.strictEqual(headers['X-Pulsar-Bundle-Keys'], kids[1]);
  assert.ok(!Object.values(headers).some((value) => String(value).includes('AQgPFh0k')));
  targeting.setBundleKeyIds([]);
});

test('acquisition sdk keeps is_encrypted from the update_check response', () => {
  const respond = (updateInfo) => ({
    request(verb, url, callback) {
      callback(null, {statusCode: 200, body: JSON.stringify({update_info: updateInfo})});
    },
  });
  const updateInfo = {
    is_available: true,
    label: 'v7',
    target_binary_range: '1.0.0',
    package_hash: 'a'.repeat(64),
    package_size: 10,
    download_url: 'https://api.usepulsar.dev/download/app/sealed/x.plsb',
    description: '',
    is_mandatory: false,
  };
  const configuration = {serverUrl: 'https://api.usepulsar.dev', appVersion: '1.0.0', clientUniqueId: 'device', deploymentKey: 'abc'};
  const query = (info) => {
    let result;
    new AcquisitionManager(respond(info), configuration).queryUpdateWithCurrentPackage({appVersion: '1.0.0'}, (err, remotePackage) => {
      assert.ifError(err);
      result = remotePackage;
    });
    return result;
  };
  assert.strictEqual(query({...updateInfo, is_encrypted: true}).isEncrypted, true);
  assert.strictEqual(query(updateInfo).isEncrypted, false);
});
