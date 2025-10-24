# 📋 Files to Copy to Your Codespaces

Since Claude Code and regular Codespaces are isolated, copy these files manually to `/workspaces/moyd-crm`:

---

## File 1: `lib/services/crm/supabase_service.dart`

Create this NEW file with 630 lines of code.

**I'll provide this in a separate message** - it's too long for one file.

---

## File 2: `lib/app/layouts/conversation_view/widgets/crm/member_sidebar.dart`

Create this NEW file with 600 lines of code.

**I'll provide this in a separate message** - it's too long for one file.

---

## File 3: `.env.example`

```
# BlueBubbles Server Configuration
# Your BlueBubbles server URL and password
BLUEBUBBLES_URL=https://your-server.ngrok.io
BLUEBUBBLES_PASSWORD=your-password-here

# Supabase Configuration (CRM Data)
# Get these from your Supabase project settings
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key-here

# Optional: Google People API for profile photos
GOOGLE_API_KEY=your-google-api-key

# Build these into the app using --dart-define
# flutter run --dart-define=SUPABASE_URL=https://...
# flutter build web --dart-define=SUPABASE_URL=https://...
```

---

## File 4: Modify `pubspec.yaml`

Find line 50 (`dlibphonenumber: ^1.1.12`) and add AFTER it:

```yaml
  # CRM Integration - Supabase for member data
  supabase_flutter: ^2.5.0
```

---

## File 5: Modify `lib/services/services.dart`

Add at the END of the file:

```dart
// CRM Integration Services
export 'crm/supabase_service.dart';
```

---

## File 6: Modify `lib/helpers/backend/startup_tasks.dart`

Find the line with `await intents.init();` (around line 65) and add AFTER it:

```dart

    // Initialize CRM services (Supabase for member data)
    try {
      await supabaseCrm.onInit();
      Logger.info("CRM services initialized successfully");
    } catch (e, s) {
      Logger.warn("Failed to initialize CRM services - CRM features will be unavailable", error: e, trace: s);
    }
```

---

## File 7: Modify `.gitignore`

Add at the END:

```
# Node modules (from Next.js backup)
node_modules/
package-lock.json
```

---

## After Copying All Files:

```bash
cd /workspaces/moyd-crm
git add .
git commit -m "🚀 Integrate BlueBubbles Flutter app with Supabase CRM"
git push -u origin claude/bluebubbles-crm-integration-011CURdWjXuWRoZqsxt6TtQA
```

---

## Next Steps:

1. I'll paste the two large files (supabase_service.dart and member_sidebar.dart) in separate messages
2. You copy them to your Codespaces
3. Make the small modifications to the 4 existing files
4. Commit and push
5. Done! 🎉
