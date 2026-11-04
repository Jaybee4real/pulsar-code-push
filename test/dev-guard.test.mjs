import assert from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const freshGuard = () => {
  delete require.cache[require.resolve('../dev-guard.js')];
  return require('../dev-guard.js');
};

test('development builds skip update checks unless the app opts in', () => {
  globalThis.__DEV__ = true;
  const guard = freshGuard();
  assert.strictEqual(guard.devUpdatesBlocked(), true);
  guard.allowUpdatesInDev(true);
  assert.strictEqual(guard.devUpdatesBlocked(), false);
  guard.allowUpdatesInDev(false);
  assert.strictEqual(guard.devUpdatesBlocked(), true);
});

test('release builds always check', () => {
  globalThis.__DEV__ = false;
  assert.strictEqual(freshGuard().devUpdatesBlocked(), false);
  delete globalThis.__DEV__;
  assert.strictEqual(freshGuard().devUpdatesBlocked(), false);
});

test('checkForUpdate consults the guard before touching the network, and the SDK exposes the opt-in', () => {
  const source = readFileSync(new URL('../CodePush.js', import.meta.url), 'utf8');
  const body = /async function checkForUpdate\([^)]*\) \{\n([\s\S]*?)\n\}/.exec(source)?.[1] || '';
  const guardAt = body.indexOf('devUpdatesBlocked()');
  assert.ok(guardAt >= 0, 'checkForUpdate checks the guard');
  assert.ok(guardAt < body.indexOf('getConfiguration()'), 'before reading the native config');
  assert.match(body.slice(guardAt, guardAt + 300), /return null;/);
  assert.match(source, /Object\.assign\(CodePush, \{[\s\S]*?allowUpdatesInDev,/);
  assert.ok(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).files.includes('dev-guard.js'), 'the module is published');
});

test('the root wrapper takes allowUpdatesInDev as a setting', () => {
  const source = readFileSync(new URL('../CodePush.js', import.meta.url), 'utf8');
  const head = /function codePushify\(options = \{\}\) \{\n([^\n]*)/.exec(source)?.[1] || '';
  assert.match(head, /typeof options\.allowUpdatesInDev === "boolean"/);
  assert.match(head, /allowUpdatesInDev\(options\.allowUpdatesInDev\)/);
  const typings = readFileSync(new URL('../typings/react-native-code-push.d.ts', import.meta.url), 'utf8');
  assert.match(typings, /allowUpdatesInDev\?: boolean;/);
  assert.match(typings, /function allowUpdatesInDev\(allowed\?: boolean\): void;/);
});
