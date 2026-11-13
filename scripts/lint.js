#!/usr/bin/env node
/**
 * Lint pass for the repo: syntax-checks every script and source file, and
 * verifies that the built extensions under javascript/ are in sync with src/.
 *
 * This deliberately does not bundle a style rule engine — the value here is
 * catching what actually breaks Mangayomi: unparsable JS, unsupported syntax,
 * tabs in source, and stale generated output.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, walk } = require("./lib/sources");

const problems = [];

function syntaxCheck(file) {
  // `node --check` parses without executing, which is exactly what we want for
  // files that reference Mangayomi globals.
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    const stderr = String(error.stderr || error.message);
    problems.push(`${path.relative(ROOT, file)}: ${stderr.trim()}`);
  }
}

function checkStyle(file) {
  const rel = path.relative(ROOT, file);
  const code = fs.readFileSync(file, "utf8");
  const lines = code.split("\n");
  lines.forEach((line, index) => {
    if (line.indexOf("\t") !== -1) {
      problems.push(`${rel}:${index + 1}: tab character (use spaces)`);
    }
    if (/[ \t]+$/.test(line)) {
      problems.push(`${rel}:${index + 1}: trailing whitespace`);
    }
  });
}

function checkGeneratedInSync() {
  const srcDir = path.join(ROOT, "src", "id");
  const outDir = path.join(ROOT, "javascript", "anime", "src", "id");
  if (!fs.existsSync(srcDir)) return;
  for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".js"))) {
    const out = path.join(outDir, file);
    if (!fs.existsSync(out)) {
      problems.push(`javascript/anime/src/id/${file}: missing build output (run npm run build)`);
    }
  }
  for (const file of fs.existsSync(outDir) ? fs.readdirSync(outDir) : []) {
    if (!file.endsWith(".js")) continue;
    if (!fs.existsSync(path.join(srcDir, file))) {
      problems.push(`javascript/anime/src/id/${file}: built file has no source in src/id/`);
    }
  }
}

function main() {
  const targets = [
    ...walk(path.join(ROOT, "scripts")),
    ...walk(path.join(ROOT, "src-shared")),
    ...walk(path.join(ROOT, "src")),
    ...walk(path.join(ROOT, "javascript")),
  ];

  for (const file of targets) {
    syntaxCheck(file);
    checkStyle(file);
  }

  checkGeneratedInSync();

  if (problems.length) {
    for (const problem of problems) console.error(`✖ ${problem}`);
    console.error(`\n${problems.length} lint problem(s).`);
    process.exit(1);
  }
  console.log(`✔ lint clean (${targets.length} file(s) checked).`);
}

main();
