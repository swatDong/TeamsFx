/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { normalize } from "path";
import nodeResolve from "@rollup/plugin-node-resolve";
import cjs from "@rollup/plugin-commonjs";
import sourcemaps from "rollup-plugin-sourcemaps";
import replace from "@rollup/plugin-replace";
import multiEntry from "@rollup/plugin-multi-entry";
import json from "@rollup/plugin-json";
import { terser } from "rollup-plugin-terser";

const pkg = require("./package.json");
const input = pkg.module;
const depNames = Object.keys(pkg.dependencies);
const devDepNames = Object.keys(pkg.devDependencies);
const production = process.env.NODE_ENV === "production";

export function nodeConfig(test = false) {
  const externalNodeBuiltins = ["util", "os"];
  const baseConfig = {
    input: input,
    external: depNames.concat(externalNodeBuiltins),
    output: {
      file: "dist/index.js",
      format: "cjs",
      sourcemap: true,
    },
    preserveSymlinks: false,
    plugins: [
      sourcemaps(),
      replace({
        delimiters: ["", ""],
        // replace dynamic checks with if (true) since this is for node only.
        // Allows rollup's dead code elimination to be more aggressive.
        "if (isNode)": "if (true)",
        preventAssignment: true,
      }),
      nodeResolve({ preferBuiltins: true }),
      json(),
      cjs(),
    ],
  };

  if (test) {
    // Entry points - test files under the `test` folder(common for both browser and node), node specific test files
    baseConfig.input = ["dist-esm/test/unit/*.spec.js", "dist-esm/test/unit/node/**/*.spec.js"];
    baseConfig.plugins.unshift(multiEntry({ exports: false }));

    // different output file
    baseConfig.output.file = "dist-test/index.node.js";

    // mark devdeps as external
    baseConfig.external.push(...devDepNames);

    // Disable tree-shaking of test code.  In rollup-plugin-node-resolve@5.0.0, rollup started respecting
    // the "sideEffects" field in package.json.  Since our package.json sets "sideEffects=false", this also
    // applies to test code, which causes all tests to be removed by tree-shaking.
    baseConfig.treeshake = false;
  } else if (production) {
    baseConfig.plugins.push(terser());
  }

  return baseConfig;
}

export function browserConfig(testType) {
  let baseConfig = {
    input: input,
    output: {
      file: "dist-browser/teamsfx.js",
      format: "umd",
      sourcemap: true,
      name: "TeamsFx",
    },
    preserveSymlinks: false,
    plugins: [
      sourcemaps(),
      replace({
        delimiters: ["", ""],
        // replace dynamic checks with if (false) since this is for
        // browser only. Rollup's dead code elimination will remove
        // any code guarded by if (isNode) { ... }
        "if (isNode)": "if (false)",
        preventAssignment: true,
      }),
      nodeResolve({
        mainFields: ["module", "browser"],
        preferBuiltins: false,
        browser: true,
      }),
      cjs(),
    ],
  };

  if (testType === "unit") {
    baseConfig.input = ["dist-esm/test/unit/*.spec.js", "dist-esm/test/unit/browser/*.spec.js"];
    baseConfig.output.file = "dist-test/index.unit.browser.js";
  } else if (testType === "integration") {
    baseConfig.input = [
      "dist-esm/test/integration/*.spec.js",
      "dist-esm/test/integration/browser/*.spec.js",
    ];
    baseConfig.output.file = "dist-test/index.integration.browser.js";
  } else {
    return baseConfig;
  }

  baseConfig.plugins.unshift(multiEntry({ exports: false }));
  baseConfig.onwarn = (warning) => {
    if (
      warning.code === "CIRCULAR_DEPENDENCY" &&
      warning.importer.indexOf(normalize("node_modules/chai/lib") === 0)
    ) {
      // Chai contains circular references, but they are not fatal and can be ignored.
      return;
    }

    console.error(`(!) ${warning.message}`);
  };

  // Disable tree-shaking of test code.  In rollup-plugin-node-resolve@5.0.0, rollup started respecting
  // the "sideEffects" field in package.json.  Since our package.json sets "sideEffects=false", this also
  // applies to test code, which causes all tests to be removed by tree-shaking.
  baseConfig.treeshake = false;

  return baseConfig;
}
