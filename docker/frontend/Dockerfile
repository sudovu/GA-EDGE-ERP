# Stage 1: Build static assets
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY index.html ./

RUN npm install

COPY src ./src
RUN npm run build

# Stage 2: Production Nginx asset server
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
