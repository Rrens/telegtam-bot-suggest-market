#!/bin/bash

# Script Update & Restart Bot Telegram
# Jalankan dengan: bash deploy.sh

echo "--------------------------------------"
echo "🚀 Memulai proses update..."
echo "--------------------------------------"

# 1. Ambil kode terbaru dari GitHub
echo "📥 Menarik kode terbaru dari Git..."
git pull

# 2. Install dependencies (jika ada library baru)
echo "📦 Menginstall dependencies..."
npm install

# 3. Compile TypeScript ke JavaScript
echo "🏗️ Membangun project (Build)..."
npm run build

# 4. Jalankan migrasi database (jika ada perubahan tabel)
echo "🗄️ Menjalankan migrasi database..."
npm run migrate

# 5. Restart proses di PM2
echo "♻️ Me-restart bot di PM2..."
pm2 delete trading-bot 2>/dev/null || true
pm2 start ecosystem.config.js

echo "--------------------------------------"
echo "✅ Update selesai! Bot sudah berjalan."
echo "--------------------------------------"
echo "Menampilkan 15 baris log terakhir..."
pm2 logs trading-bot --lines 15 --no-daemon
