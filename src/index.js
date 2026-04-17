const { readFile } = require('node:fs/promises');
const { updatePackageJsonVersion } = require('./version-bump');

function parseTargetRepository(targetRepository) {
  const [owner, repo] = (targetRepository || '').split('/');
  if (!owner || !repo) {
    throw new Error('TARGET_REPOSITORY must be in the format owner/repo');
  }

  return { owner, repo };
}

async function githubRequest(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${body}`);
  }

  return body ? JSON.parse(body) : {};
}

async function handlePushEvent({ eventPayload, env = process.env, fetchImpl = fetch, logger = console }) {
  if (!eventPayload?.repository?.full_name) {
    throw new Error('Push payload is missing repository.full_name');
  }

  if (env.SOURCE_REPO && env.SOURCE_REPO !== eventPayload.repository.full_name) {
    logger.log(`Skipping push from ${eventPayload.repository.full_name}; expected ${env.SOURCE_REPO}`);
    return { skipped: true };
  }

  if (!env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required');
  }

  const { owner, repo } = parseTargetRepository(env.TARGET_REPOSITORY);
  const targetPath = env.TARGET_PACKAGE_PATH || 'package.json';
  const branch = env.TARGET_BRANCH || 'main';
  const bumpType = env.VERSION_BUMP || 'patch';

  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'semver-iteration-app'
  };

  const encodedPath = targetPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const existingFile = await githubRequest(fetchImpl, contentsUrl, { headers });
  const decodedContent = Buffer.from(existingFile.content, 'base64').toString('utf8');
  const { previousVersion, nextVersion, updatedContent } = updatePackageJsonVersion(decodedContent, bumpType);

  logger.log(`Bumping ${owner}/${repo}:${targetPath} from ${previousVersion} to ${nextVersion}`);

  if (env.DRY_RUN === 'true') {
    return {
      previousVersion,
      nextVersion,
      skipped: true,
      reason: 'dry-run'
    };
  }

  const commitBody = {
    message: env.COMMIT_MESSAGE || `chore: bump version to ${nextVersion}`,
    content: Buffer.from(updatedContent, 'utf8').toString('base64'),
    sha: existingFile.sha,
    branch
  };

  if (env.COMMITTER_NAME && env.COMMITTER_EMAIL) {
    commitBody.committer = {
      name: env.COMMITTER_NAME,
      email: env.COMMITTER_EMAIL
    };
  }

  await githubRequest(fetchImpl, `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commitBody)
  });

  return {
    previousVersion,
    nextVersion,
    skipped: false
  };
}

async function main() {
  if (process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== 'push') {
    console.log(`Ignoring ${process.env.GITHUB_EVENT_NAME}; this app only handles push events.`);
    return;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is required');
  }

  const rawEvent = await readFile(eventPath, 'utf8');
  const eventPayload = JSON.parse(rawEvent);

  const result = await handlePushEvent({ eventPayload });
  if (!result.skipped) {
    console.log(`Version bumped successfully: ${result.previousVersion} -> ${result.nextVersion}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  handlePushEvent,
  parseTargetRepository,
  main
};
