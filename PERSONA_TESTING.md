# Persona Feature - Testing Guide

## Setup

1. **Build the project**:
   ```bash
   npm run frontend
   npm run backend
   ```
   Or with Docker:
   ```bash
   docker-compose up --build
   ```

2. **Access LibreChat**: Navigate to `http://localhost:3080`

## Testing Steps

### 1. Enable Persona Badge
- Start a new conversation
- Look for the **Persona** badge in the chat input area (green badge with User icon)
- Click the badge to enable it
- The badge should turn active (green background)

### 2. Set Persona Information
- When enabled for the first time, a dialog should automatically open
- Enter persona information, for example:
  ```
  I am a senior software engineer with 10 years of experience in React and TypeScript. 
  I prefer concise, technical explanations with code examples.
  ```
- Click **Save Persona**
- Dialog should close

### 3. Verify Persona Storage
- Open browser DevTools (F12)
- Go to Application → Local Storage → `http://localhost:3080`
- Look for key: `persona_new` (or `persona_{conversationId}`)
- Verify your persona text is stored

### 4. Edit Persona
- Click the active Persona badge again
- Dialog should reopen with existing persona text
- Modify the text
- Click **Save Persona**
- Verify changes are saved in localStorage

### 5. Clear Persona
- Click the Persona badge to open dialog
- Click **Clear** button
- Persona text should be removed
- localStorage entry should be deleted

### 6. Test Persona in Message
- Enable the Persona badge
- Set a persona: "I am a Python developer who likes detailed explanations"
- Send a message: "How do I sort a list?"
- **Check Network Tab**:
  - Open DevTools → Network
  - Filter by "agents" or "chat"
  - Find the POST request
  - Check the Request Payload
  - Verify `personaData` field contains your persona text

### 7. Test Persistence Across Page Reload
- Set a persona
- Refresh the page
- Persona badge should still be active
- Open dialog - persona text should still be there

### 8. Test Multiple Conversations
- Set persona in Conversation A: "I am a designer"
- Start new conversation (Conversation B)
- Set different persona: "I am a developer"
- Switch back to Conversation A
- Verify Conversation A still has "I am a designer"

### 9. Test Toggle Functionality
- Click Persona badge to enable
- Click again to disable
- Badge should turn inactive
- Messages sent while disabled should NOT include persona data

## Expected Network Payload

When sending a message with persona enabled, the payload should look like:

```json
{
  "text": "Your message here",
  "conversationId": "abc123",
  "endpoint": "openAI",
  "personaData": "I am a senior software engineer with expertise in React...",
  ...other fields
}
```

## Console Logs to Check

In browser console, you should see:
```javascript
// When submission is created
{
  conversation: {...},
  userMessage: {...},
  personaData: "Your persona text here",
  ...
}
```

## Backend Verification (Optional)

If you want to verify the backend receives the persona data:

1. Add a console.log in `/api/server/routes/agents/chat.js`:
   ```javascript
   console.log('Received personaData:', req.body.personaData);
   ```

2. Send a message with persona enabled
3. Check server console for the log

## Common Issues

### Issue: Badge doesn't appear
- **Solution**: Check if `showEphemeralBadges` is true in BadgeRow
- Verify you're not in an Assistants conversation (feature may be limited)

### Issue: Dialog doesn't open
- **Solution**: Check browser console for errors
- Verify Recoil state is initialized correctly
- Check if `personaDialogOpen` state exists

### Issue: Persona data not in payload
- **Solution**: Verify localStorage has the persona
- Check that `useChatFunctions` is retrieving it correctly
- Ensure `createPayload` is including it in the payload

### Issue: TypeScript errors
- **Solution**: Run `npm install` to ensure all dependencies are installed
- The linter errors about module resolution are expected in development

## Visual Indicators

✅ **Persona Disabled**: Gray/inactive badge
✅ **Persona Enabled**: Green badge with `border-green-600/40 bg-green-500/10`
✅ **Dialog Open**: Modal overlay with persona input form
✅ **Persona Saved**: Dialog closes, badge remains active

## Testing Checklist

- [ ] Badge appears in chat input
- [ ] Clicking badge toggles it on/off
- [ ] Dialog opens when badge is clicked (when active)
- [ ] Can input persona text
- [ ] Save button stores persona
- [ ] Clear button removes persona
- [ ] Cancel button closes dialog without saving
- [ ] Persona persists across page reload
- [ ] Persona is conversation-specific
- [ ] Persona data is included in API payload
- [ ] Badge can be toggled off
- [ ] No persona data sent when badge is off

## Next Steps

After testing, you may want to:
1. Implement backend handling of `personaData`
2. Prepend persona to system messages
3. Add persona validation/sanitization
4. Create persona presets/templates
5. Add persona to conversation settings 