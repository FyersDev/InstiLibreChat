# Fix Asset Paths - Remaining Files

## Files Already Fixed ✅
- client/src/components/Templates/TemplatesView.tsx
- client/src/components/Chat/Header.tsx  
- client/src/components/Endpoints/FIAIcon.tsx
- client/src/components/Auth/Login.tsx
- client/src/components/Nav/TopNavBar.tsx
- client/index.html

## Files Still Need Fixing

Run this script to fix all remaining files:

```bash
cd /Users/em1064/code/InstiLibreChat/client/src

# Files to update (add import and fix src attributes)
cat > /tmp/fix_assets.sh << 'EOF'
#!/bin/bash

# List of files that need fixing
files=(
  "components/Resources/Modals/UploadFileModal.tsx"
  "components/Chat/Input/Files/UploadButton.tsx"
  "components/Auth/OTP.tsx"
  "components/Documents/DocumentUpload.tsx"
  "components/Chat/Messages/Feedback.tsx"
  "components/Chat/Messages/MessageIcon.tsx"
  "components/Nav/NavToggle.tsx"
  "components/Input/Generations/Regenerate.tsx"
  "components/Templates/SelectedTemplate.tsx"
  "components/Web/Sources.tsx"
  "components/SidePanel/Agents/FileSearch.tsx"
  "components/Conversations/ConvoOptions/SharedLinkButton.tsx"
  "components/Chat/Input/TemplateSelector.tsx"
  "components/SidePanel/Agents/FileContext.tsx"
  "routes/ResourcesRoute.tsx"
  "components/Documents/DocumentSelector.tsx"
  "components/Chat/Menus/OpenSidebar.tsx"
  "components/Chat/Input/ToolsDropdown.tsx"
  "components/Artifacts/DownloadArtifact.tsx"
  "components/Nav/SettingsTabs/Data/SharedLinks.tsx"
  "components/Chat/GeneratePDFButton.tsx"
  "components/Chat/Messages/HoverButtons.tsx"
  "components/Chat/Input/TemplatePersonaSelector.tsx"
  "components/Conversations/ConvoOptions/ConvoOptions.tsx"
)

for file in "${files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "⚠️  Skipping $file (not found)"
    continue
  fi
  
  echo "Fixing $file..."
  
  # Check if import already exists
  if ! grep -q "import { asset } from '~/utils/assetPath'" "$file"; then
    # Add import after the last import line
    sed -i.bak '/^import /h; ${x;s/^import .*/&\nimport { asset } from '\''~\/utils\/assetPath'\'';/;x}; /^import /{x;p;x;}' "$file"
  fi
  
  # Replace all /assets/ references
  sed -i.bak 's|src="/assets/\([^"]*\)"|src={asset('\''\1'\'')}|g' "$file"
  
  echo "✓ Fixed $file"
done

echo "✅ All files fixed!"
EOF

chmod +x /tmp/fix_assets.sh
/tmp/fix_assets.sh
```

## Or Manual Quick Fix

For a quicker solution that doesn't require perfect imports, you can use a global replace:

```bash
cd /Users/em1064/code/InstiLibreChat/client/src

# Replace all /assets/ with /research/assets/
find . -name "*.tsx" -o -name "*.ts" | while read file; do
  if grep -q 'src="/assets/' "$file"; then
    sed -i.bak 's|src="/assets/|src="/research/assets/|g' "$file"
    echo "Fixed: $file"
  fi
done
```

This will change all `/assets/` to `/research/assets/` directly without needing the asset utility function.

## Recommended: Use the Quick Fix

The second approach is simpler and faster. Just replace `/assets/` → `/research/assets/` in all files.
