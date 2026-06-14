FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY src ./src
COPY public ./public
COPY data/.gitignore ./data/.gitignore

EXPOSE 3000
CMD ["node", "src/server.js"]
