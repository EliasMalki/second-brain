// Flat ESLint config for the Expo app (ESLint 9).
//
// Why this is hand-rolled instead of `eslint-config-expo`:
// In this npm-workspaces monorepo, web pins eslint@8 (eslint-config-next@14) and
// mobile needs eslint@9. npm keeps eslint@8 at the repo root and nests eslint@9
// under apps/mobile. But `eslint-config-expo` declares eslint as a loose peer
// (>=8.10), so npm HOISTS it to the root next to eslint@8 — and its `/flat`
// entry calls `require('eslint/config')`, an eslint@9-only subpath, which then
// resolves the root's eslint@8 and throws ERR_PACKAGE_PATH_NOT_EXPORTED.
// npm has no `nohoist`, so we can't reliably co-locate it with mobile's eslint@9.
//
// Instead we lint with mobile's own nested eslint@9 plus the same core plugins
// Expo's config is built on (typescript-eslint + react-hooks). Web keeps its
// eslint@8 + eslint-config-next setup completely untouched. See apps/mobile/CLAUDE.md.
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    // eslint@9 already ignores node_modules by default; add build/generated paths.
    ignores: [
      '.expo/**',
      'dist/**',
      'ios/**',
      'android/**',
      'expo-env.d.ts',
      'nativewind-env.d.ts',
    ],
  },
  {
    // App source only. Scoping the TS parser/rules here (not globally) keeps the
    // plain-CJS config files at the app root — babel/metro/tailwind — out of the
    // TypeScript ruleset.
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The react-hooks "recommended" ruleset, pinned by name so we don't depend
      // on the plugin's flat-config export shape (which changed across 5.x→7.x).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Geist is applied by the base components (RN has no style inheritance,
      // React 19 has no defaultProps) — raw Text/TextInput would silently ship
      // the system font. The two ui/ wrappers carry a local eslint-disable.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput'],
              message:
                'Import Text from "@/components/ui/text" and TextInput from "@/components/ui/text-input" — they apply the Geist default (and the placeholder tint).',
            },
          ],
        },
      ],
    },
  },
);
