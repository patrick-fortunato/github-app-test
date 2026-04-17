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

test('bumpVersion rejects unsupported bump types', () => {
  assert.throws(() => bumpVersion('1.2.3', 'build'), /Unsupported bump type/);
});

test('updatePackageJsonVersion updates package json version', () => {
  const result = updatePackageJsonVersion('{"name":"demo","version":"0.0.9"}', 'patch');

  assert.equal(result.previousVersion, '0.0.9');
  assert.equal(result.nextVersion, '0.0.10');
  assert.match(result.updatedContent, /"version": "0.0.10"/);
});

test('updatePackageJsonVersion rejects invalid json', () => {
  assert.throws(() => updatePackageJsonVersion('{invalid}', 'patch'), /not valid JSON/);
});

test('updatePackageJsonVersion requires version field', () => {
  assert.throws(() => updatePackageJsonVersion('{"name":"demo"}', 'patch'), /missing a version field/);
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

test('handlePushEvent commits bumped version when dry-run is disabled', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            sha: 'abc123',
            content: Buffer.from('{"name":"target","version":"2.3.4"}', 'utf8').toString('base64')
          });
        }
      };
    }

    return {
      ok: true,
      status: 200,
      async text() {
        return '{}';
      }
    };
  };

  const result = await handlePushEvent({
    eventPayload: { repository: { full_name: 'owner/source' } },
    env: {
      TARGET_REPOSITORY: 'owner/target',
      TARGET_BRANCH: 'main',
      TARGET_PACKAGE_PATH: 'package.json',
      VERSION_BUMP: 'minor',
      GITHUB_TOKEN: 'token'
    },
    fetchImpl: fakeFetch,
    logger: { log() {} }
  });

  const commitPayload = JSON.parse(calls[1].options.body);
  const decodedPackage = Buffer.from(commitPayload.content, 'base64').toString('utf8');

  assert.equal(result.previousVersion, '2.3.4');
  assert.equal(result.nextVersion, '2.4.0');
  assert.equal(result.skipped, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'PUT');
  assert.match(decodedPackage, /"version": "2.4.0"/);
});
