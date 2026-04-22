#!/bin/bash
set -euo pipefail

# ============================================================
#  BingoEx ConoHa VPS ワンショットセットアップスクリプト
#
#  対象: Ubuntu 22.04 / 24.04 (ConoHa VPS 1GB 推奨)
#
#  使い方:
#    1) VPS に SSH 接続
#    2) このスクリプトを転送 or git clone
#    3) 下記の変数を設定してから実行:
#
#       export DOMAIN="bingo.example.com"
#       export HOST_PASSWORD="好きなパスワード"
#       bash deploy/setup-conoha.sh
#
#  DNS: 実行前に DOMAIN の A レコードを VPS の IP に向けてください
# ============================================================

DOMAIN="${DOMAIN:?❌ DOMAIN 環境変数が未設定です (例: export DOMAIN=bingo.example.com)}"
HOST_PASSWORD="${HOST_PASSWORD:?❌ HOST_PASSWORD 環境変数が未設定です}"
APP_DIR="/opt/bingoex"
REPO_URL="${REPO_URL:-https://github.com/masaspc/BingoEx.git}"
BRANCH="${BRANCH:-main}"
PORT=3001

echo "================================================"
echo "  BingoEx セットアップ"
echo "  ドメイン: ${DOMAIN}"
echo "  ブランチ: ${BRANCH}"
echo "================================================"

# --- 1. システム更新 + 基本パッケージ ---
echo "[1/7] パッケージ更新..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx ufw

# --- 2. Node.js 22 ---
echo "[2/7] Node.js 22 インストール..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node.js $(node -v) / npm $(npm -v)"

# --- 3. PM2 ---
echo "[3/7] PM2 インストール..."
npm install -g pm2 2>/dev/null || true

# --- 4. アプリケーションデプロイ ---
echo "[4/7] アプリケーション配置..."
if [ -d "${APP_DIR}" ]; then
  cd "${APP_DIR}"
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
else
  git clone -b "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

echo "  依存関係インストール..."
cd "${APP_DIR}/client" && npm ci
cd "${APP_DIR}/server" && npm ci --omit=dev

echo "  クライアントビルド..."
cd "${APP_DIR}/client" && npm run build

# --- 5. PM2 セットアップ ---
echo "[5/7] PM2 起動..."
cd "${APP_DIR}"
HOST_PASSWORD="${HOST_PASSWORD}" PORT="${PORT}" pm2 delete bingoex 2>/dev/null || true
HOST_PASSWORD="${HOST_PASSWORD}" PORT="${PORT}" pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# --- 6. Nginx (HTTP のみで起動 → certbot が SSL を追加) ---
echo "[6/7] Nginx 設定..."
sed "s/YOUR_DOMAIN/${DOMAIN}/g" "${APP_DIR}/deploy/nginx-bingoex.conf" \
  > /etc/nginx/sites-available/bingoex
ln -sf /etc/nginx/sites-available/bingoex /etc/nginx/sites-enabled/bingoex
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl restart nginx

# --- 7. Let's Encrypt (certbot が Nginx 設定に SSL を自動追加) ---
echo "[7/7] SSL 証明書取得..."
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
  --register-unsafely-without-email --redirect || {
  echo "⚠️  certbot 失敗 — DNS が VPS に向いているか確認してください"
  echo "   手動で実行: certbot --nginx -d ${DOMAIN}"
}

# --- ファイアウォール ---
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "================================================"
echo "  ✅ セットアップ完了!"
echo ""
echo "  プレイヤー: https://${DOMAIN}/"
echo "  ホスト画面: https://${DOMAIN}/host"
echo ""
echo "  管理コマンド:"
echo "    pm2 status          - 状態確認"
echo "    pm2 logs bingoex    - ログ確認"
echo "    pm2 restart bingoex - 再起動"
echo "================================================"
