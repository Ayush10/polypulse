FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production 2>/dev/null || true

COPY . .

ENV UI_PORT=8787
EXPOSE 8787

CMD ["node", "src/ui/server.js"]
