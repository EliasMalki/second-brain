// Metro config for the monorepo. Two jobs:
//  1. Watch the workspace root so Metro can resolve `@second-brain/shared`
//     (raw TS source, consumed via its `./*` subpath exports).
//  2. Pin module resolution to this app's node_modules first, then the root —
//     with hierarchical lookup disabled — so the app's React 19 / react-native
//     always win over web's React 18 higher up the tree (no duplicate-React).
//     react-native is hoisted to the workspace root next to web's React 18, so
//     without this a hierarchical walk from RN internals would grab React 18.
// NativeWind's withNativeWind wrapper is layered on in a later step.
//
// `expo-doctor` will flag both the disableHierarchicalLookup override and the
// react@18/react@19 duplication — both are EXPECTED here: they are the shape of
// a monorepo where web is on React 18 and mobile on React 19, and this config is
// exactly the fix. `expo export` bundling cleanly is the proof it resolves.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
