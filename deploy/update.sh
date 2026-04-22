#!/bin/bash
set -euo pipefail

# BingoEx アップデートスクリプト
# 使い方: bash /opt/bingoex/deploy/update.sh

APP_DIR="/opt/bingoex"
BRANCH="${BRANCH:-main}"

cd "${APP_DIR}"
echo "git pull..."
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "依存関係更新..."
cd "${APP_DIR}/client" && npm ci
cd "${APP_DIR}/server" && npm ci --omit=dev

echo "クライアントビルド..."
cd "${APP_DIR}/client" && npm run build

echo "サーバー再起動..."
cd "${APP_DIR}"
pm2 restart bingoex

echo "✅ アップデート完了"
