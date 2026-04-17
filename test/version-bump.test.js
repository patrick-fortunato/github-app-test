const test = require('node:test');
const assert = require('node:assert/strict');

const { bumpVersion, updatePackageJsonVersion } = require('../src/version-bump');
const { handlePushEvent } = require('../src/index');

test('bumpVersion handles patch, minor, and major increments', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
});

test('bumpVersion rejects invalid semantic versions', () => {
  assert.throws(() => bumpVersion('1.2', 'patch'), /Invalid semantic version/);
});

test('updatePackageJsonVersion updates package json version', () => {
  const result = updatePackageJsonVersion('{"name":"demo","version":"0.0.9"}', 'patch');

  assert.equal(result.previousVersion, '0.0.9');
  assert.equal(result.nextVersion, '0.0.10');
  assert.match(result.updatedContent, /"version": "0.0.10"/);
});

test('handlePushEvent performs dry-run update logic for matching source repo', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          sha: 'abc123',
          content: Buffer.from('{"name":"target","version":"1.0.0"}', 'utf8').toString('base64')
        });
      }
    };
  };

  const result = await handlePushEvent({
    eventPayload: { repository: { full_name: 'owner/source' } },
    env: {
      SOURCE_REPO: 'owner/source',
      TARGET_REPOSITORY: 'owner/target',
      TARGET_BRANCH: 'main',
      TARGET_PACKAGE_PATH: 'package.json',
      VERSION_BUMP: 'patch',
      GITHUB_TOKEN: 'token',
      DRY_RUN: 'true'
    },
    fetchImpl: fakeFetch,
    logger: { log() {} }
  });

  assert.equal(result.previousVersion, '1.0.0');
  assert.equal(result.nextVersion, '1.0.1');
  assert.equal(result.skipped, true);
  assert.equal(calls.length, 1);
});
