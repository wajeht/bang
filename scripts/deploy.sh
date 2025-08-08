#!/bin/bash

source .env

GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

npx caprover deploy \
  --caproverUrl "$CAPROVER_DOMAIN" \
  --appToken "$CAPROVER_APP_TOKEN" \
  --appName "$CAPROVER_APP_NAME" \
  -b "$GIT_BRANCH"
