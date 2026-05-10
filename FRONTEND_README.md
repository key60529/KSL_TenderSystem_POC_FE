# Frontend - Tender Verification POC

A modern Vue.js 3 application for creating and validating tender documents using AI-powered workflows.

## ✨ Features

### 1. 📝 Tender Template Builder
- **Conversational AI Interface**: Chat with AI to describe your project needs
- **Automatic Data Extraction**: AI asks clarifying questions to extract SOW, deliverables, and timeline
- **Template Generation**: Generate professional .docx tender templates
- **Smart Context Management**: Maintains conversation history for coherent document generation

### 2. ✓ Tender Validator
- **Custom Section Definition**: Define required sections for compliance checking
- **Multi-File Upload**: Drag-and-drop interface supporting PDF and DOCX files
- **AI-Powered Analysis**: Backend Workflow scans all files for required sections
- **Detailed Compliance Reports**: See which sections are found/missing with location references
- **Export Results**: Download validation reports as CSV

## 🛠️ Tech Stack

- **Frontend Framework**: Vue.js 3 (Composition API)
- **Styling**: TailwindCSS 4
- **Routing**: Vue Router 5
- **State Management**: Pinia 3
- **Build Tool**: Vite 8
- **Language**: TypeScript
- **Testing**: Vitest + Playwright

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup Steps

1. **Clone and navigate to frontend directory**
```bash
cd frontend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
The project ships with a real `.env` file in the frontend root. Edit it only if your backend credentials change:
```env
VITE_BACKEND_URL=http://localhost:8000/api
VITE_BACKEND_CHATBOT_KEY=your_key
VITE_BACKEND_WORKFLOW_KEY=your_key
```

4. **Start development server**
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## 📁 Project Structure

```
src/
├── components/
│   ├── BackendChat.vue              # Chat interface for Feature 1
│   ├── FileUploadZone.vue        # Drag-drop file upload
│   └── ValidationChecklist.vue   # Results display
├── views/
│   ├── HomeView.vue              # Landing page
│   ├── TenderTemplateView.vue    # Feature 1 page
│   ├── TenderValidationView.vue  # Feature 2 page
│   └── AboutView.vue             # About page
├── services/
│   └── backendService.ts            # Backend API integration
├── router/
│   └── index.ts                  # Route definitions
├── stores/                       # Pinia stores (optional)
├── App.vue                       # Root component
└── main.ts                       # Entry point
```

## 🚀 Usage

### Feature 1: Create Tender Template

1. Navigate to **"📝 Prepare Template"**
2. Describe your project in the chat interface
   - Example: "I need to hire a security company for a 3-story mall"
3. Answer AI clarifying questions about:
   - Scope of Work (SOW)
   - Deliverables
   - Timeline
   - Budget considerations
4. Click **"Generate Template"** button
5. Download the professional .docx tender document

### Feature 2: Validate Proposals

1. Navigate to **"✓ Validate Proposal"**
2. **Define Requirements**:
   - List required sections (default: Company Profile, Technical Proposal, Price Schedule)
   - Add/remove custom sections as needed
3. **Upload Documents**:
   - Drag & drop or click to upload PDF/DOCX files
   - Maximum 10 files supported
4. Click **"Validate Documents"**
5. Review the compliance checklist:
   - ✓ Green checkmarks = Section found with location reference
   - ✗ Red X marks = Section missing with gap warning
6. **Download Report**: Export results as CSV for record-keeping

## 🔌 API Integration

### Backend Chatbot API (Feature 1)
- **Endpoint**: `POST /api/chat-messages`
- **Purpose**: Maintain conversational context for template generation
- **Response**: Structured JSON with conversation history and generated template data

### Backend Workflow API (Feature 2)
- **Endpoint**: `POST /api/workflows/run`
- **Purpose**: Validate proposals against required sections
- **Response**: Validation results with status and location information

### Service File: `src/services/backendService.ts`
Provides type-safe wrappers for:
- `sendChatMessage()` - Send messages to chatbot
- `runValidationWorkflow()` - Run validation workflow
- `downloadTenderTemplate()` - Generate and download template
- Type definitions for API responses

## 🎨 UI/UX Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark-Aware Gradients**: Light/airy aesthetic with slate and blue colors
- **Accessibility**: Semantic HTML, proper ARIA labels
- **Loading States**: Animated feedback during API calls
- **Error Handling**: User-friendly error messages
- **Progress Indicators**: Visual feedback for long-running operations

## 📋 Component Documentation

### BackendChat.vue
- Real-time message streaming
- Automatic scroll to latest message
- Message timestamp display
- Ready-state indicator for template generation
- Keyboard shortcuts (Shift+Enter for new line)

### FileUploadZone.vue
- Drag-and-drop support
- Click-to-browse fallback
- File size display
- Format validation
- File removal capability

### ValidationChecklist.vue
- Progress ring visualization
- Status icons (✓/✗/⚠)
- Location references for found sections
- Gap warnings for missing sections
- Loading animation during validation

## ⚙️ Build & Deployment

### Development
```bash
npm run dev         # Start dev server
npm run type-check  # TypeScript type checking
npm run lint        # Run linters
npm run format      # Format code
```

### Production Build
```bash
npm run build       # Create optimized build
npm run preview     # Preview production build locally
```

### Testing
```bash
npm run test:unit   # Run unit tests
npm run test:e2e    # Run end-to-end tests
```

## 🔐 Environment Variables

Required variables (set in `.env`):
- `VITE_BACKEND_URL` - Backend API base URL
- `VITE_BACKEND_CHATBOT_KEY` - Chatbot API key
- `VITE_BACKEND_WORKFLOW_KEY` - Workflow API key

Optional:
- `VITE_BACKEND_URL` - Backend server URL

## 🐛 Troubleshooting

### API Connection Issues
- Verify Backend API keys in `.env`
- Check CORS configuration on backend
- Ensure backend server is running

### File Upload Problems
- Check file format (PDF/DOCX only)
- Verify file size under 100MB (per file)
- Ensure JavaScript is enabled

### Chat Not Responding
- Check browser console for errors
- Verify API connection and authentication
- Try reconnecting by refreshing page

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser developer console for error details
3. Contact the development team

## 📄 License

This project is part of the Tender Verification POC.

## 🔗 Related Documentation

- **Backend**: See `/backend/README.md` for API documentation
- **Backend Integration**: Refer to Backend documentation for API details
- **Vue.js**: https://vuejs.org/
- **TailwindCSS**: https://tailwindcss.com/
