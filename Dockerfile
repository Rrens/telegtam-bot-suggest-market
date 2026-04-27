FROM node:20-bookworm-slim

# Install system dependencies required for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && npx playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install Playwright Chromium browser
RUN npx playwright install chromium

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
