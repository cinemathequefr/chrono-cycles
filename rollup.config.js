import buble from "rollup-plugin-buble";
import nodeResolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import {
  uglify
} from "rollup-plugin-uglify";
import postcss from "rollup-plugin-postcss";
import postcssPresetEnv from "postcss-preset-env";
import postcssClean from "postcss-clean";
import postcssImport from "postcss-import";
// import lost from "lost";


export default {
  input: "./src/js/main.js",
  output: {
    file: "./dist/bundle.js",
    format: "iife"
  },
  plugins: [
    postcss({
      extract: true,
      plugins: [
        // lost(),
        postcssImport(),
        postcssPresetEnv({
          stage: 0
        })
        // ,
        // postcssClean()
      ]
    }),
    nodeResolve({
      jsnext: true
    }),
    commonjs(),
    buble()
    // ,
    // uglify()
  ]
};