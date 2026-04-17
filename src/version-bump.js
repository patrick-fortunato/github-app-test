function bumpVersion(version, bumpType = 'patch') {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  switch (bumpType) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
    default:
      throw new Error(`Unsupported bump type: ${bumpType}`);
  }

  return `${major}.${minor}.${patch}`;
}

function updatePackageJsonVersion(packageJsonContent, bumpType = 'patch') {
  let parsed;
  try {
    parsed = JSON.parse(packageJsonContent);
  } catch (error) {
    throw new Error('package.json content is not valid JSON');
  }

  if (!parsed.version) {
    throw new Error('package.json is missing a version field');
  }

  const previousVersion = parsed.version;
  const nextVersion = bumpVersion(previousVersion, bumpType);
  parsed.version = nextVersion;

  return {
    previousVersion,
    nextVersion,
    updatedContent: `${JSON.stringify(parsed, null, 2)}\n`
  };
}

module.exports = {
  bumpVersion,
  updatePackageJsonVersion
};
