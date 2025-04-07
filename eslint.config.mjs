import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs" }
  },
  {
    languageOptions:
    {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        jest: 'readonly',
        expect: 'readonly',
        exports: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        ...globals.node
      }
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-case-declarations': 'off',
      'no-param-reassign': ["error", { "props": true }]
    }
  }
];