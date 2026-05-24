#!/bin/bash
set -e

echo "=== Starting direct deployment automation on VM (Port 80) ==="

# 1. Stop and disable Nginx if running to free up Port 80
echo "Stopping and disabling Nginx to free up Port 80..."
sudo systemctl stop nginx || true
sudo systemctl disable nginx || true

# 2. Update package list and install build essentials
echo "Updating package list..."
sudo apt-get update -y
sudo apt-get install -y curl gnupg build-essential

# 3. Install Node.js v20 from NodeSource
echo "Installing Node.js v20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify node & npm installation
node -v
npm -v

# 4. Extract backend tarball
echo "Extracting application archive..."
mkdir -p "$HOME/ojol-router"
tar -xzf "$HOME/backend.tar.gz" -C "$HOME/ojol-router"

# 5. Install NPM dependencies
echo "Installing project dependencies..."
cd "$HOME/ojol-router/backend"
npm install --omit=dev

# 6. Create .env file with production environment variables (Port 80 & Location global)
echo "Configuring environment variables..."
cat << 'EOF' > .env
PORT=80
PROJECT_ID=ojol-cuanbot-router
LOCATION=global
GOOGLE_CLOUD_PROJECT=ojol-cuanbot-router
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_MAPS_API_KEY=AIzaSyD6bOBazehJC4-FCwJIzrkIq8SHyXPMLFY
EOF

# 7. Install PM2 globally (with sudo)
echo "Installing PM2 globally..."
sudo npm install -g pm2

# 8. Start the App directly on Port 80 with sudo PM2
echo "Starting application with sudo PM2 directly on Port 80..."
sudo pm2 delete ojol-router || true
sudo pm2 start index.js --name "ojol-router"

# Configure PM2 to start on system boot as root
echo "Saving PM2 process list as root..."
sudo pm2 save

echo "=== Deployment completed successfully! ==="
echo "Application is now running DIRECTLY on port 80 without Nginx!"
