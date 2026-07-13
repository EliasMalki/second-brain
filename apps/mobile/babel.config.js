// NativeWind requires a babel config: the jsxImportSource makes className work
// on every RN component, and nativewind/babel compiles the Tailwind classes.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
