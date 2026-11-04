// Regras de estilo e de erros comuns do código (rode com: npm run lint).
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    { ignores: ['node_modules/', 'dados/', 'auth_info_baileys/'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            'prefer-const': 'error',
            'no-var': 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
        },
    },
];
