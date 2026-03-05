import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../store/*', '!../store/index', '!../store/index.js'],
              message: 'Import from store/index.ts barrel only',
            },
            {
              group: ['../utils/*', '!../utils/index', '!../utils/index.js'],
              message: 'Import from utils/index.ts barrel only',
            },
            {
              group: ['../types/*', '!../types/index', '!../types/index.js'],
              message: 'Import from types/index.ts barrel only',
            },
          ],
        },
      ],
    },
  },
);
