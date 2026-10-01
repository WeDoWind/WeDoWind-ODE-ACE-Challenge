import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('accepts a listing without code and checks shared source when supplied', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'ace-validator-'));
  try {
    for (const folder of ['scripts', 'templates', 'site/data', 'site/images/creations']) mkdirSync(resolve(root, folder), { recursive: true });
    copyFileSync(resolve(import.meta.dirname, 'validate.mjs'), resolve(root, 'scripts/validate.mjs'));
    copyFileSync(resolve(import.meta.dirname, '../templates/creation.json'), resolve(root, 'templates/creation.json'));
    writeFileSync(resolve(root, 'site/images/creations/issue-12.png'), 'fixture');
    const item = { id: 'issue-12', title: 'Wind display', creator: 'Team', summary: 'A turbine display.', viewUrl: 'https://example.org/', image: 'images/creations/issue-12.png', imageAlt: 'Turbine display with live readings.' };
    const run = () => {
      writeFileSync(resolve(root, 'site/data/creations.json'), JSON.stringify({ creations: [item] }));
      return spawnSync(process.execPath, [resolve(root, 'scripts/validate.mjs')], { encoding: 'utf8' });
    };
    assert.equal(run().status, 0);
    item.sourceUrl = 'https://github.com/WeDoWind/WeDoWind-ODE-ACE-Challenge/tree/main/creations/issue-12';
    assert.match(run().stderr, /source folder needs README.md/);
    mkdirSync(resolve(root, 'creations/issue-12'), { recursive: true });
    writeFileSync(resolve(root, 'creations/issue-12/README.md'), 'Setup');
    writeFileSync(resolve(root, 'creations/issue-12/LICENSE'), 'MIT');
    assert.equal(run().status, 0);
    item.license = '';
    assert.match(run().stderr, /license must be a non-empty string/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
