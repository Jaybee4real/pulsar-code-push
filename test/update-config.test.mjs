import assert from 'node:assert';
import {test} from 'node:test';
import updateConfig from '../update-config.js';

const {parseUpdateConfig} = updateConfig;

test('leading tokens before a pipe are config and are stripped from the notes', () => {
  assert.deepStrictEqual(parseUpdateConfig("silent, next-restart | What's new"), {
    silent: true,
    mandatory: false,
    noPill: false,
    installMode: 'ON_NEXT_RESTART',
    notes: "What's new",
  });
});

test('a pipe inside ordinary notes is left alone', () => {
  const config = parseUpdateConfig('Faster search | better filters');
  assert.strictEqual(config.notes, 'Faster search | better filters');
  assert.strictEqual(config.silent, false);
  assert.strictEqual(config.installMode, null);
});

test('a trailing tags: or config: line is config', () => {
  const tagged = parseUpdateConfig('Fixed the login crash\n\ntags: mandatory, no-pill\n');
  assert.strictEqual(tagged.notes, 'Fixed the login crash');
  assert.strictEqual(tagged.mandatory, true);
  assert.strictEqual(tagged.noPill, true);

  const configured = parseUpdateConfig('Bug fixes\nCONFIG: immediate');
  assert.strictEqual(configured.notes, 'Bug fixes');
  assert.strictEqual(configured.installMode, 'IMMEDIATE');
});

test('a description made only of tokens has no notes', () => {
  assert.deepStrictEqual(parseUpdateConfig('silent'), {
    silent: true,
    mandatory: false,
    noPill: false,
    installMode: null,
    notes: '',
  });
  const forced = parseUpdateConfig('forced nopill next-suspend');
  assert.strictEqual(forced.mandatory, true);
  assert.strictEqual(forced.noPill, true);
  assert.strictEqual(forced.installMode, 'ON_NEXT_SUSPEND');
  assert.strictEqual(forced.notes, '');
});

test('all three forms compose', () => {
  const config = parseUpdateConfig('silent | New dashboard\ntags: next-resume');
  assert.strictEqual(config.silent, true);
  assert.strictEqual(config.installMode, 'ON_NEXT_RESUME');
  assert.strictEqual(config.notes, 'New dashboard');
});

test('empty and missing descriptions', () => {
  for (const description of [undefined, null, '', '   ']) {
    const config = parseUpdateConfig(description);
    assert.strictEqual(config.notes, '');
    assert.strictEqual(config.silent, false);
    assert.strictEqual(config.mandatory, false);
  }
});

test('words that merely contain a token are not config', () => {
  const config = parseUpdateConfig('Silent mode for notifications');
  assert.strictEqual(config.silent, false);
  assert.strictEqual(config.notes, 'Silent mode for notifications');
});
