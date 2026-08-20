# ---- Stage 1: build the React/Vite client ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# ---- Stage 2: install api (root) production deps ----
FROM node:20-alpine AS api-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 3: final runtime image ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=api-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY api/ ./api/
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 4000
CMD ["node", "api/index.js"]
