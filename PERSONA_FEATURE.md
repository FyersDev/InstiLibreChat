# Persona Feature Implementation

## Overview
A new **Persona** tool has been added to the LibreChat chat input bar that allows users to set a persona/context that will be included with all their chat messages in a conversation.

## Features
- **Badge in Chat Bar**: A green "Persona" badge appears alongside other tools (WebSearch, CodeInterpreter, etc.)
- **Dialog Interface**: Click the badge to open a dialog where users can input their persona description
- **Persistent Storage**: Persona data is saved per conversation in localStorage
- **Automatic Inclusion**: Persona data is automatically included in the payload when sending messages
- **Toggle Support**: Can be toggled on/off like other tools

## Files Created

### 1. `/client/src/components/Chat/Input/Persona.tsx`
- Badge component that appears in the chat input area
- Uses green color scheme (border-green-600/40 bg-green-500/10)
- User icon from lucide-react
- Clickable to open persona dialog

### 2. `/client/src/components/Chat/Input/PersonaDialog.tsx`
- Modal dialog for setting persona information
- Textarea input for persona description
- Save, Clear, and Cancel buttons
- Loads existing persona from localStorage
- Stores persona data per conversation

### 3. `/client/src/store/persona.ts`
- Recoil state management for persona
- `personaByConvoId`: Stores persona data per conversation
- `personaDialogOpen`: Controls dialog visibility

## Files Modified

### 1. `/client/src/store/index.ts`
- Added `export * from './persona';` to export persona state atoms

### 2. `/client/src/components/Chat/Input/BadgeRow.tsx`
- Imported `Persona` component
- Added `<Persona />` to ephemeral badges section

### 3. `/client/src/Providers/BadgeRowContext.tsx`
- Added `persona: ReturnType<typeof useToolToggle>` to `BadgeRowContextType`
- Created persona hook using `useToolToggle`
- Added persona to context value object

### 4. `/client/src/components/Chat/Input/ToolDialogs.tsx`
- Imported `PersonaDialog` component
- Added logic to open dialog when persona is first enabled
- Rendered `PersonaDialog` component

### 5. `/packages/data-provider/src/types.ts`
- Added `personaData?: string;` field to `TSubmission` type

### 6. `/packages/data-provider/src/createPayload.ts`
- Destructured `personaData` from submission
- Added `personaData` to payload object

### 7. `/client/src/hooks/Chat/useChatFunctions.ts`
- Retrieves persona data from localStorage before creating submission
- Adds `personaData` field to submission object

## How It Works

### User Flow
1. User clicks the Persona badge in the chat input area
2. Badge toggles to active (green)
3. Dialog opens automatically if no persona is set
4. User enters their persona description (e.g., "I am a senior software engineer...")
5. User clicks "Save Persona"
6. Persona is stored in localStorage with key `persona_{conversationId}`
7. All subsequent messages in that conversation include the persona data

### Technical Flow
1. **Badge Rendering**: `BadgeRow` renders `Persona` component when `showEphemeralBadges` is true
2. **State Management**: `BadgeRowContext` provides persona toggle state via `useToolToggle`
3. **Dialog Control**: Clicking badge sets `personaDialogOpen` to true
4. **Data Storage**: Dialog saves to both Recoil state and localStorage
5. **Payload Creation**: `useChatFunctions` retrieves persona from localStorage
6. **API Submission**: `createPayload` includes `personaData` in the request payload

## Backend Integration (Optional)

To use the persona data on the backend, you can access it from `req.body.personaData`:

```javascript
// In your chat controller or BaseClient
const { personaData } = req.body;

if (personaData && personaData.trim()) {
  // Prepend to system message or conversation context
  const personaContext = `User Persona: ${personaData}\n\n`;
  // Add to your conversation context
}
```

## LocalStorage Keys
- `persona_{conversationId}`: Stores the actual persona text
- `last_persona_toggle_{conversationId}`: Stores the toggle state

## UI/UX Details
- **Color**: Green theme (matches success/positive actions)
- **Icon**: User icon from lucide-react
- **Position**: After MCPSelect in the badges row
- **Behavior**: Click to toggle, click when active to edit persona

## Future Enhancements
- Add persona templates/presets
- Support multiple personas per user
- Persona sharing between conversations
- Rich text formatting for persona descriptions
- AI-suggested persona improvements
- Role-based personas (developer, designer, manager, etc.) 