# Quick Start Guide - Frontend Setup

## 🚀 5-Minute Setup

### Step 1: Install Dependencies
```bash
cd frontend
npm install
```

### Step 2: Configure Environment
The project ships with a real `.env` file in the frontend directory. Edit it only if your backend endpoint changes:
```env
VITE_BACKEND_URL=http://localhost:8000/api
VITE_BACKEND_CHATBOT_KEY=your_backend_chatbot_key
VITE_BACKEND_WORKFLOW_KEY=your_backend_workflow_key
```

### Step 3: Start Development Server
```bash
npm run dev
```

Open your browser to `http://localhost:5173`

## 📱 Available Routes

| Route | Feature | Purpose |
|-------|---------|---------|
| `/` | Home | Landing page with feature overview |
| `/tender-template` | Template Builder | Create tender documents with AI |
| `/tender-validation` | Validator | Validate proposal compliance |
| `/about` | About | Application information |

## 🎯 Feature Quick Tour

### Create a Tender Template
1. Go to **📝 Prepare Template**
2. Describe your project in the chat
3. Answer AI questions about scope, deliverables, timeline
4. Click **Generate Template** and download your .docx file

### Validate a Proposal
1. Go to **✓ Validate Proposal**
2. Define required sections (or use defaults)
3. Upload your proposal files (PDF/DOCX)
4. Click **Validate Documents**
5. Review the compliance checklist
6. Download the report (optional)

## 🔧 Common Commands

```bash
# Development
npm run dev          # Start development server
npm run type-check   # Check TypeScript types
npm run lint        # Run linters and fix issues
npm run format      # Format code with Prettier

# Build & Production
npm run build       # Create production build
npm run preview     # Preview production build
npm run build:only  # Build without type checking

# Testing
npm run test:unit   # Run unit tests
npm run test:e2e    # Run end-to-end tests
```

## 📋 File Structure Overview

```
frontend/
├── src/
│   ├── components/          # Reusable Vue components
│   │  ├── BackendChat.vue     # Chat interface
│   │  ├── FileUploadZone.vue # File upload
│   │  └── ValidationChecklist.vue # Results
│   ├── views/              # Page components
│   │  ├── HomeView.vue
│   │  ├── TenderTemplateView.vue
│   │  └── TenderValidationView.vue
│   ├── services/           # API integration
│   │  └── backendService.ts
│   ├── router/             # Route configuration
│   ├── App.vue             # Root component
│   └── main.ts             # Entry point
├── package.json            # Dependencies
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # TailwindCSS config
└── tsconfig.json          # TypeScript config
```

## 🔗 Component Hierarchy

```
App.vue (Navigation + Layout)
├── HomeView
├── TenderTemplateView
│   └── BackendChat
├── TenderValidationView
│   ├── FileUploadZone
│   └── ValidationChecklist
└── AboutView
```

## 🎨 UI Features

- **Responsive Design**: Mobile, tablet, desktop
- **Light/Airy Aesthetic**: Sky blue and slate colors
- **Real-time Feedback**: Loading states and progress indicators
- **Accessibility**: Semantic HTML and ARIA labels
- **Smooth Animations**: Hover effects and transitions

## 🔌 API Integration Points

### Backend Chatbot (Feature 1)
- Endpoint: `POST /api/chat-messages`
- Used for: Conversational template generation

### Backend Workflow (Feature 2)
- Endpoint: `POST /api/workflows/run`
- Used for: Document validation and compliance checking

Your frontend sends `Authorization: Bearer YOUR_KEY` headers to both endpoints.

## 🐛 Troubleshooting

### Port 5173 Already in Use
```bash
npm run dev -- --port 3000  # Use different port
```

### API Connection Error
- Verify `.env` file exists with correct keys
- Check backend is running and accessible
- Inspect browser dev tools (F12) → Network tab

### Build Errors
```bash
npm run type-check  # Check TypeScript errors
npm run lint        # Check linting issues
```

## 📚 Additional Resources

- **Vue.js 3 Docs**: https://vuejs.org/
- **TailwindCSS Docs**: https://tailwindcss.com/
- **Vite Docs**: https://vitejs.dev/
- **Backend API**: See Backend documentation for endpoints

## ✅ Verification Checklist

Before deploying:
- [ ] All dependencies installed (`npm install`)
- [ ] Environment variables set (`.env`)
- [ ] Development server runs (`npm run dev`)
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No lint errors (`npm run lint`)
- [ ] API connection working
- [ ] All pages loading correctly

## 📞 Need Help?

1. Check the terminal for error messages
2. Review browser console (F12 → Console)
3. Check `.env` file for correct API keys
4. See FRONTEND_README.md for detailed documentation
