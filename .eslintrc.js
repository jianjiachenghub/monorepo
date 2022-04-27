module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  extends: [
    'airbnb-base',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime', // If you are using the new JSX transform from React 17, extend react/jsx-runtime in your eslint config (add "plugin:react/jsx-runtime" to "extends") to disable the relevant rules.
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true
    },
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['react', '@typescript-eslint'],
  rules: {
    'import/extensions': 'off', // ts tsx 等不好控制扩展名 打包出来是js eslint不好识别
    'import/no-unresolved': 'off', // eslite 路径识别问题
    'import/no-extraneous-dependencies': 'off'
  }
};
