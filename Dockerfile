FROM node:20-slim

WORKDIR /app

ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm install --include=dev --legacy-peer-deps

COPY . .
RUN npm run build

# Set production environment for runtime
ENV NODE_ENV=production

# Ensure app directory permissions belong to non-root node user
RUN chown -R node:node /app

USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
