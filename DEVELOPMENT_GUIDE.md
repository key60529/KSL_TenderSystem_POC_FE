# Frontend Development Guide

## Architecture Overview

### Design Philosophy
- **Component-Driven**: Each component is self-contained and reusable
- **Service Layer**: All API calls go through `backendService.ts`
- **Type Safety**: Full TypeScript support with interfaces for API responses
- **State Management**: Local component state with Pinia for complex shared state (when needed)

### Data Flow
```
User Input (Component)
    ↓
Event Handler
    ↓
Service Call (backendService.ts)
    ↓
Backend API
    ↓
Response Processing
    ↓
Update Reactive State (ref/computed)
    ↓
Template Re-render
```

## Component Architecture

### BackendChat Component
**Purpose**: Conversational interface for template generation

**State**:
- `messages`: Array of chat messages with timestamps
- `conversationId`: Unique ID for maintaining context
- `inputMessage`: Current input field value
- `isLoading`: Loading state during API call
- `error`: Error message display

**Key Features**:
- Auto-scroll to latest message
- Keyboard shortcut (Shift+Enter for new line)
- Ready-state detection for template generation
- Error recovery with user feedback

**Emits**:
- `generateTemplate`: Fired when user clicks generate button

### FileUploadZone Component
**Purpose**: Drag-and-drop file upload interface

**Validation**:
- File count limit (max 10)
- File format validation (PDF/DOCX)
- File size checking

**Features**:
- Drag-and-drop support
- Click-to-browse fallback
- File preview with size display
- Individual file removal

**Emits**:
- `filesSelected`: Fired when files are selected/added

### ValidationChecklist Component
**Purpose**: Display validation results

**Computed Properties**:
- `foundCount`: Number of sections found
- `missingCount`: Number of sections missing
- `completionPercentage`: Calculate progress percentage
- `statusIcon`: Show ✓, ✗, or ⚠ based on results
- `statusColor`: Determine color scheme based on status

**UI States**:
- Loading: Animated dots
- Empty: No results yet
- Success: All sections found
- Partial: Some sections found
- Failed: All sections missing

## Service Layer (backendService.ts)

### Type Definitions
```typescript
// Chat Messages
ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

// Validation Results
ValidationResult {
  section: string
  status: 'found' | 'missing'
  location?: string
  message: string
}
```

### API Functions

#### sendChatMessage(message, conversationId)
- **Purpose**: Send message to Backend Chatbot
- **Auth**: Bearer token from `VITE_BACKEND_CHATBOT_KEY`
- **Response**: `BackendConversation` with message_id and conversation_id
- **Error Handling**: Throws error if API call fails

#### runValidationWorkflow(files, requiredSections)
- **Purpose**: Validate documents against required sections
- **Auth**: Bearer token from `VITE_BACKEND_WORKFLOW_KEY`
- **Request**: FormData with files and JSON inputs
- **Response**: Array of `ValidationResult`
- **Error Handling**: Transforms validation data or throws

#### downloadTenderTemplate(chatHistory)
- **Purpose**: Generate and download tender template
- **Return**: Blob object for download
- **Processing**: Creates download link and triggers download

## Styling Guidelines

### TailwindCSS Classes Used
- **Colors**: slate (primary), blue (feature 1), amber (feature 2), red/green (status)
- **Spacing**: Consistent use of `px-6`, `py-4` for padding
- **Responsive**: `md:` breakpoint for tablet/desktop views
- **Effects**: `shadow-lg`, `rounded-lg`, `transition`
- **Gradients**: `bg-gradient-to-br` for visual appeal

### Color Scheme
```
Primary: Blue (#3b82f6)
Secondary: Amber (#d97706)
Success: Green (#16a34a)
Error: Red (#dc2626)
Background: Slate (#f1f5f9)
Text: Dark slate (#0f172a)
```

## Error Handling Strategy

### API Errors
- **Try-Catch Blocks**: Wrap all async operations
- **User Feedback**: Show error messages in UI
- **Console Logging**: Log full error details for debugging
- **Recovery**: Allow users to retry after error

### Validation Errors
- **File Format**: Check extension matches allowed formats
- **File Size**: Validate before upload attempt
- **File Count**: Ensure doesn't exceed maximum
- **Section Requirements**: Validate at submission time

## Performance Considerations

### Component Optimization
- **nextTick()**: Used for DOM updates after state changes
- **Computed Properties**: Cache calculated values
- **Lazy Routes**: Route components loaded only when accessed
- **Watchers**: Used sparingly for auto-scroll functionality

### State Management
- **Local Component State**: Preferred for single-component state
- **Pinia Store**: Use when state needs sharing across components
- **Props/Emits**: Preferred over centralized state for simple data flow

## Testing Strategy

### Unit Tests (Vitest)
- Component rendering
- Prop validation
- Event emission
- Computed property calculations

### E2E Tests (Playwright)
- User workflows
- Feature interactions
- API integration (mocked)
- Error scenarios

### Manual Testing Checklist
- [ ] All routes accessible
- [ ] Chat sends and receives messages
- [ ] File upload with various formats
- [ ] Validation displays correctly
- [ ] Download functions work
- [ ] Error messages appear appropriately
- [ ] Responsive on mobile/tablet
- [ ] Keyboard navigation works

## Security Considerations

### API Keys
- Stored in `.env` (never committed)
- Used only for server-to-client communication
- Regenerate if compromised
- Different keys for chatbot vs workflow

### User Input
- File upload validated by extension and size
- Chat messages sent as-is (API handles validation)
- No HTML/JS injection risk in templates

### Data Handling
- Chat history kept in memory
- No persistent storage in browser
- File uploads handled securely by backend

## Browser Compatibility

### Target Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Modern Features Used
- ES2020+ syntax (var arrow functions, optional chaining)
- CSS Grid and Flexbox
- Fetch API
- FormData API

## Deployment Checklist

### Pre-Production
- [ ] Remove console.log statements
- [ ] Test with production API keys
- [ ] Build without errors: `npm run build`
- [ ] Check bundle size: `npm run build`
- [ ] Test production build locally
- [ ] Environment variables set correctly

### Production Build
```bash
npm run build              # Creates dist/ folder
# Deploy dist/ folder to web server
```

### Environment Variables
```env
# Must be set before build for static values
# Or use var substitution in backend
VITE_BACKEND_URL=...
VITE_BACKEND_CHATBOT_KEY=...
VITE_BACKEND_WORKFLOW_KEY=...
```

## Future Enhancements

### Potential Features
- [ ] User authentication/login
- [ ] Tender template history/saving
- [ ] Batch file processing
- [ ] Real-time collaboration
- [ ] Custom branding for templates
- [ ] Advanced analytics
- [ ] Dark mode support
- [ ] Multi-language support

### Performance Improvements
- [ ] Virtual scrolling for large chat histories
- [ ] Message pagination
- [ ] File upload resumability
- [ ] Progressive Web App (PWA) features
- [ ] Service workers for offline support

### Code Quality
- [ ] Increase test coverage to 80%+
- [ ] Add Storybook for component documentation
- [ ] Implement E2E testing for all flows
- [ ] Add monitoring/error tracking (Sentry)
- [ ] Add performance monitoring (Lighthouse CI)

## Debugging Tips

### Browser DevTools
1. **Vue DevTools**: Install Vue DevTools extension
   - Inspect component state
   - Watch reactive properties
   - Track component hierarchy

2. **Network Tab**
   - Check API request/response
   - Verify headers and authorization
   - Monitor file uploads

3. **Console Tab**
   - Watch for errors/warnings
   - Use console.log for debugging
   - Test TypeScript types

### Common Issues

**Chat not responding**:
- Check API key in `.env`
- Verify backend is running
- Check Network tab for 401/403 errors

**Files not uploading**:
- Check file format is PDF/DOCX
- Verify file size < 100MB
- Check browser console for validation errors

**Page not loading**:
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)
- Check console for TypeScript errors

## Resources

- **Vue 3 Composition API**: https://vuejs.org/guide/extras/composition-api-faq.html
- **TailwindCSS Utilities**: https://tailwindcss.com/docs/utility-first
- **Vite Guide**: https://vitejs.dev/guide/
- **TypeScript Deep Dive**: https://basarat.gitbook.io/typescript/
- **Backend Documentation**: [Your Backend docs URL]
