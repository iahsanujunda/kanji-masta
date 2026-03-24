module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'type-enum': [2, 'always', [
      'feat',     // New feature
      'fix',      // Bug fix
      'docs',     // Documentation
      'style',    // Formatting, no code change
      'refactor', // Code restructuring
      'perf',     // Performance improvement
      'test',     // Tests
      'chore',    // Build, CI, deps
      'deploy',   // Deployment state updates
    ]],
  },
};
