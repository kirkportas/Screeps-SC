"use strict";

const js = require("@eslint/js");
const globals = require("globals");

// Page / injected globals used across the extension's plain browser scripts.
const injectedGlobals = {
  $: "readonly",
  _: "readonly",
  angular: "readonly",
  chrome: "readonly",
  Mousetrap: "readonly",
  // Page-world module runtime (module.js); each modules/*.js gets its instance from it.
  ScreepsSC: "readonly",
  module: "writable",
  window: "readonly",
  document: "readonly"
};

module.exports = [
  {
    ignores: ["node_modules/**", "vendor/**"]
  },
  js.configs.recommended,
  {
    // The extension source files are plain browser scripts (not ES modules).
    files: ["**/*.js"],
    ignores: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...injectedGlobals
      }
    },
    rules: {
      // Keep the config runnable on legacy source without a mass refactor.
      // These flag pervasive existing style (function-scoped var redeclares,
      // hand-escaped strings, etc.) that a lint-config PR shouldn't rewrite.
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-useless-escape": "off",
      "no-unsafe-finally": "off"
    }
  },
  {
    // The flat config itself is a CommonJS module run under Node.
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    }
  }
];
