#!/bash/bin

# Script Setup Server Baru untuk Telegram Bot (Ubuntu)
# Jalankan dengan: bash setup-server.sh

echo "Updating system..."
sudo apt update && sudo apt upgrade -y

echo "Installing Git and Build Tools..."
sudo apt install -y git build-essential curl

echo "Installing NVM and Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20

echo "Installing PM2..."
npm install pm2 -g

echo "Installing PostgreSQL and Redis..."
sudo apt install -y postgresql postgresql-contrib redis-server

echo "Setting up PostgreSQL..."
# Membuat user dan database (Ganti password di bawah!)
sudo -u postgres psql -c "CREATE DATABASE tradingbot_db;"
sudo -u postgres psql -c "CREATE USER tradingbot WITH ENCRYPTED PASSWORD 'tradingbot_secret';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE tradingbot_db TO tradingbot;"

echo "------------------------------------------------"
echo "SETUP SELESAI!"
echo "------------------------------------------------"
echo "Langkah selanjutnya:"
echo "1. Clone repo: git clone <URL_REPO>"
echo "2. Masuk ke folder: cd telegram-bot-suggest-market"
echo "3. Copy .env: cp .env.example .env && nano .env"
echo "4. Install & Build:"
echo "   npm install"
echo "   npm run build"
echo "   npm run migrate"
echo "5. Start Bot:"
echo "   pm2 start ecosystem.config.js --env production"
echo "------------------------------------------------"
