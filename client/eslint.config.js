// Accessibility lint only (jsx-a11y): catches unlabeled controls, missing alt text, invalid ARIA,
// click handlers without keyboard support, etc. on every CI run. Style rules are deliberately off.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  // This config checks accessibility only, so disable comments for other rule sets are expected.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // react-hooks is registered only so existing disable comments resolve; its rules stay off here.
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Field wires labels to its child control at runtime (htmlFor/id), which static analysis can't see.
      'jsx-a11y/label-has-associated-control': 'off',
      // Scrollable panels are labelled role="region" with tabIndex 0 so keyboard users can scroll them (WCAG 2.1.1).
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'] }],
    },
  },
];
