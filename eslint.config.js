// eslint.config.js — a light lint for the engine. No dependencies to run the game;
// this is for contributors.  npx eslint .
export default [
  // build artefacts and vendored code are not linted
  { ignores: ['_min/**', '_build/**', 'three.module.js', 'BufferGeometryUtils.js', 'node_modules/**'] },
  {
    files: ['*.js'],
    ignores: ['three.module.js', 'BufferGeometryUtils.js', 'example/**', 'docs/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        performance: 'readonly', localStorage: 'readonly', fetch: 'readonly',
        innerWidth: 'readonly', innerHeight: 'readonly', devicePixelRatio: 'readonly',
        addEventListener: 'readonly', removeEventListener: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', requestAnimationFrame: 'readonly',
        AudioContext: 'readonly', location: 'readonly', console: 'readonly',
        KeyboardEvent: 'readonly', URL: 'readonly', caches: 'readonly', self: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'eqeqeq': ['warn', 'smart'],
      'no-multi-spaces': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
