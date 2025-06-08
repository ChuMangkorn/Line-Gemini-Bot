// eslint.config.js
const { configs } = require('@eslint/js');
const globals = require('globals');

module.exports = [
    configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                exports: 'writable',
                module: 'writable',
                require: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single']
        },
        ignores: [
            'node_modules/',
            'dist/',
            'build/',
            '*.min.js'
        ]
    }
];
