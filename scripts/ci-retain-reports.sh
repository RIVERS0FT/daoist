#!/usr/bin/env bash
set -euo pipefail

[[ "$GITHUB_REPOSITORY" =~ ^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$ ]]
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]]
daoist_report_dir="$HOME/.local/state/daoist-actions/$GITHUB_REPOSITORY/$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
mkdir -p "$daoist_report_dir"
if [ -d artifacts ]; then
  cp -a artifacts "$daoist_report_dir/"
fi
if [ -f dist/asset-manifest.json ]; then
  cp dist/asset-manifest.json "$daoist_report_dir/asset-manifest.json"
fi
git archive --format=tar.gz HEAD > "$daoist_report_dir/source.tar.gz"
git rev-parse HEAD > "$daoist_report_dir/commit.txt"
printf 'Validation reports retained on runner `%s`: `%s`\n' "$RUNNER_NAME" "$daoist_report_dir" >> "$GITHUB_STEP_SUMMARY"
