// SPDX-License-Identifier: Apache-2.0
// Starter dependency-cruiser config for AgentLintel frontend boundary checks.
// Tune path globs to your repo before making this blocking in CI.
'use strict';

module.exports = {
  forbidden: [
    {
      name: 'agentlintel/no-feature-internal-imports-from-app',
      severity: 'error',
      comment: 'Import feature public surfaces, e.g. src/features/auth, not internals like src/features/auth/hooks.',
      from: {
        path: '^src/(app|routes|pages|components|shared|lib)/',
      },
      to: {
        path: '^src/features/[^/]+/(api|hooks|schemas|components|utils|table-column-definitions)\\b',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    },
  },
};
