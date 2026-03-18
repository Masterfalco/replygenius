FROM node:18-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build
RUN npm prune --production
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
