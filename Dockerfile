# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Copy only dependency manifests first so Docker can cache the install layer.
COPY package.json package-lock.json ./

# Install dependencies from the lockfile for a reproducible build.
RUN npm ci

# Copy the rest of the project source.
COPY . .

# Build args — all three Vite env vars must be declared here so Vite can bake
# them into the static output at build time (Vite reads VITE_* at compile time,
# not at runtime).
ARG VITE_BACKEND_URL=http://localhost:55555
ARG VITE_BACKEND_CHATBOT_KEY=
ARG VITE_BACKEND_WORKFLOW_KEY=

ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_BACKEND_CHATBOT_KEY=${VITE_BACKEND_CHATBOT_KEY}
ENV VITE_BACKEND_WORKFLOW_KEY=${VITE_BACKEND_WORKFLOW_KEY}
# Ensure devtools plugin is skipped in production builds.
ENV NODE_ENV=production

# Build the static SPA.
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# nginx listens on port 80 inside the container.
EXPOSE 80

# Replace the default nginx config with our SPA-friendly config.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled assets from the build stage.
COPY --from=build /app/dist /usr/share/nginx/html

# Start nginx in the foreground so Docker can manage the process.
CMD ["nginx", "-g", "daemon off;"]
