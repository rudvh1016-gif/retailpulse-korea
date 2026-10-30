import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const scanner = readFileSync(new URL('../scripts/secret-scan.mjs', import.meta.url), 'utf8');
// Generated recognisable test strings only, never real credentials. Fragments
// keep these fixtures from themselves matching the repository's source scan.
const fixtures = [
  ['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' '),
  'AI' + 'za' + 'a'.repeat(32),
  's' + 'k-' + 'b'.repeat(24),
  'gh' + 'p_' + 'c'.repeat(35),
  'API' + '_KEY' + '=' + 'd'.repeat(20),
];
function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), 'koretail-scan-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: dir, stdio: 'pipe', encoding: 'utf8'});
  git('init', '-q'); git('config', 'user.name', 'Scanner fixture'); git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(dir, 'scripts')); writeFileSync(join(dir, 'scripts/secret-scan.mjs'), scanner);
  writeFileSync(join(dir, 'clean.txt'), 'plain fixture\n');
  git('add', '.'); git('commit', '-qm', 'clean base');
  return {dir, git, scan: () => spawnSync(process.execPath, ['scripts/secret-scan.mjs'], {cwd: dir, encoding: 'utf8'})};
}
test('batched scan blocks each of the five original patterns in untracked files without printing values', t => {
  const repo = repository(t);
  for (const fixture of fixtures) {
    writeFileSync(join(repo.dir, 'untracked.txt'), fixture);
    const result = repo.scan();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /working tree/);
    assert.ok(!result.stderr.includes(fixture));
    rmSync(join(repo.dir, 'untracked.txt'));
  }
  assert.equal(repo.scan().status, 0);
});
test('a deleted and renamed historical credential still blocks release', t => {
  const repo = repository(t);
  writeFileSync(join(repo.dir, 'old.txt'), fixtures[3]); repo.git('add', '.'); repo.git('commit', '-qm', 'historical fixture');
  const revision = repo.git('rev-parse', 'HEAD').trim();
  repo.git('mv', 'old.txt', 'renamed.txt'); repo.git('commit', '-qm', 'rename fixture');
  repo.git('rm', 'renamed.txt'); repo.git('commit', '-qm', 'remove fixture');
  const result = repo.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /history commit/);
  assert.ok(!result.stderr.includes(fixtures[3]));
  assert.equal(repo.git('grep', '-l', '-F', fixtures[3], revision).trim(), `${revision}:old.txt`);
});
test('clean full history preserves the exact lockfile/scanner and binary exclusions', t => {
  const repo = repository(t);
  writeFileSync(join(repo.dir, 'package-lock.json'), fixtures[0]);
  writeFileSync(join(repo.dir, 'scripts/secret-scan.mjs'), scanner + '\n// ' + fixtures[1] + '\n');
  writeFileSync(join(repo.dir, 'binary.dat'), Buffer.concat([Buffer.from([0]), Buffer.from(fixtures[2])]));
  repo.git('add', '.'); repo.git('commit', '-qm', 'existing exclusions');
  writeFileSync(join(repo.dir, 'package-lock.json'), '{}'); repo.git('add', '.'); repo.git('commit', '-qm', 'clean latest');
  const result = repo.scan();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Secret scan passed/);
});
