# Tender Verification Frontend

A Vue 3 + TypeScript frontend for the tender verification proof of concept.

## What this app does

The app has two main flows:

1. **Login / entry screen**  
   The login button first tries to connect to the backend. If the backend is unavailable, the app falls back to mock mode and still enters the workspace.

2. **Tender chat and validation**  
   The chatroom can generate a mock tender hand-off file, and the validation page can parse uploaded section definitions and run a backend-backed or mock validation workflow.

## Tech stack

- Vue 3
- TypeScript
- Vue Router
- Vite
- Tailwind CSS

## Project structure

```text
src/
├── components/
│   ├── Chat.vue
│   ├── FileUploadZone.vue
│   └── ValidationChecklist.vue
├── services/
│   ├── backendConfig.ts
│   ├── backendTypes.ts
│   ├── chatService.ts
│   ├── loginService.ts
│   └── validationService.ts
├── views/
│   ├── LoginView.vue
│   ├── TenderTemplateView.vue
│   └── TenderValidationView.vue
└── router/
    └── index.ts
```

## Environment variables

The project ships with a real `.env` file in the frontend root. Edit it only if your backend settings change.

Available variables:

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_BACKEND_CHATBOT_KEY=
VITE_BACKEND_WORKFLOW_KEY=
```

The app works in mock mode even when these values are empty.

## Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Docker deployment

The frontend includes a multi-stage Dockerfile optimized for production deployment with nginx.

### Build the Docker image

```bash
docker build -t tender-verification-frontend .
```

Or with a custom backend URL:

```bash
docker build -t tender-verification-frontend --build-arg VITE_BACKEND_URL=https://api.example.com .
```

### Run the container

```bash
docker run -p 5173:80 tender-verification-frontend
```

The app will be available at `http://localhost:5173`.

To set a different backend URL at runtime via environment variables, use:

```bash
docker run -p 5173:80 -e VITE_BACKEND_URL=https://api.example.com tender-verification-frontend
```

Note: Backend URLs are baked into the static build at build time (Vite limitation), so rebuild the image to change the backend.

### Docker Compose

A `docker-compose.yml` is provided for local development with the backend:

```bash
docker-compose up
```

Or with environment override:

```bash
VITE_BACKEND_URL=http://backend:8000 docker-compose up
```

The frontend will be available at `http://localhost:5173` and the compose file defaults to `http://localhost:8000` for the backend.

### Nginx configuration

The container uses a custom nginx configuration (`docker/nginx.conf`) that:

- Handles SPA routing by redirecting all requests to `index.html`
- Caches static assets (JS, CSS, images) for 1 year with immutable headers (safe because Vite fingerprints all output)
- Serves the frontend on port 80 inside the container

## Flow notes

### Login
- `src/services/loginService.ts` handles the backend connection probe.
- On failure, the app still routes into the mock workspace.

### Chat
- `src/services/chatService.ts` contains the chat message flow, attachment download helper, and validation draft hand-off.
- Typing `test` in the chat generates a mock JSON attachment for the validation page.

### Validation
- `src/services/validationService.ts` handles JSON parsing and validation workflow execution.
- Uploaded sections can be imported from JSON and merged with custom sections.

## Documentation

This README replaces the earlier fragmented markdown files and keeps the setup, workflow, and implementation notes in one place.
