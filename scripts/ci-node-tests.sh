#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/ci
set +e
npm test 2>&1 | tee artifacts/ci/node-tests.log
daoist_test_status=${PIPESTATUS[0]}
set -e

if [ "$daoist_test_status" -ne 0 ]; then
  node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
const lines = readFileSync('artifacts/ci/node-tests.log', 'utf8').split('\n');
const starts = lines.flatMap((line, index) => /^\s*not ok\b/.test(line) ? [index] : []);
if (!starts.length) starts.push(Math.max(0, lines.length - 35));
for (const start of starts.slice(0, 12)) {
  const text = lines.slice(start, start + 35).join('\n');
  const escaped = text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.log(`::error title=Node test failure::${escaped}`);
}
JS
fi

exit "$daoist_test_status"
