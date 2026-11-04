import assert from 'node:assert';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const clientDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sources = fs.readdirSync(clientDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({name, text: fs.readFileSync(path.join(clientDir, name), 'utf8')}));

test('the SDK never uses StyleSheet.absoluteFillObject, which React Native 0.85 removed', () => {
  const offenders = sources.filter(({text}) => text.includes('absoluteFillObject')).map(({name}) => name);
  assert.deepStrictEqual(offenders, []);
});

test('the update sheet overlay fills the screen on every React Native version', () => {
  const sheet = sources.find(({name}) => name === 'UpdateSheet.js').text;
  const overlay = sheet.match(/overlayRoot:\s*\{([^}]*)\}/)?.[1] || '';
  for (const rule of [/position:\s*"absolute"/, /top:\s*0\b/, /right:\s*0\b/, /bottom:\s*0\b/, /left:\s*0\b/]) {
    assert.match(overlay, rule);
  }
});
