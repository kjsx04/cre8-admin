#!/usr/bin/env bash
# Vercel Ignored Build Step.
#
# Exit 0 cancels the deployment. Exit 1 continues the build.
# vercel.json's ignoreCommand overrides the project setting. That setting
# is "only build production" (preview deployments come back as
# "Canceled by Ignored Build Step"). Production still builds. Pull-request
# and other preview deployments build too, so a branch can be opened
# in the browser before it is merged.
#
# https://vercel.com/docs/project-configuration/vercel-json#ignorecommand

set -u

env_name="${VERCEL_ENV:-}"
ref_name="${VERCEL_GIT_COMMIT_REF:-unknown}"

if [ "$env_name" = "production" ] || [ "$env_name" = "preview" ]; then
  echo "Building ${env_name} deployment for ${ref_name}."
  exit 1
fi

echo "Skipping deployment for ${ref_name} (VERCEL_ENV=${env_name:-unset})."
exit 0
