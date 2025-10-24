# Netlify Deployment Guide for BlueBubbles CRM

This guide explains how to deploy your BlueBubbles CRM web app to Netlify with automatic builds and deployments.

## Why Netlify?

- ✅ Builds Flutter in the cloud (no local setup needed)
- ✅ Auto-deploys on every push to GitHub
- ✅ Simple one-time setup
- ✅ Free tier for personal projects
- ✅ Custom domain support

## Deployment Steps

### 1. Sign Up for Netlify

Go to https://www.netlify.com and sign up (you can use your GitHub account).

### 2. Connect Your Repository

1. Click **"Add new site"** → **"Import an existing project"**
2. Choose **"Deploy with GitHub"**
3. Authorize Netlify to access your GitHub
4. Select your repository: `andyhartzler/moyd-crm`
5. Select the branch: `claude/bluebubbles-crm-integration-011CURdWjXuWRoZqsxt6TtQA`

### 3. Configure Build Settings

Netlify should auto-detect the `netlify.toml` file, but verify these settings:

- **Build command**: `flutter/bin/flutter build web --release`
- **Publish directory**: `build/web`
- **Branch to deploy**: `claude/bluebubbles-crm-integration-011CURdWjXuWRoZqsxt6TtQA`

### 4. Add Environment Variables (for Supabase)

In Netlify dashboard, go to:
**Site settings** → **Environment variables** → **Add a variable**

Add these:
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_ANON_KEY` = your Supabase anon key

Note: For Flutter web, you'll need to configure these in your Flutter app code. See "Configure Supabase" section below.

### 5. Deploy!

Click **"Deploy site"**

Your site will be live at: `https://random-name-12345.netlify.app`

You can change this to a custom subdomain in Site settings → Domain management.

## Configure Supabase in Flutter

Since Flutter web doesn't use environment variables the same way, you need to add your Supabase credentials directly in the code.

### Option 1: Create a config file

Create `lib/config/supabase_config.dart`:

```dart
class SupabaseConfig {
  static const String url = 'https://your-project.supabase.co';
  static const String anonKey = 'your-anon-key';
}
```

Then update `lib/services/crm/supabase_service.dart` to import and use these values:

```dart
import 'package:bluebubbles_app/config/supabase_config.dart';

// In the init() method or constructor:
final client = SupabaseClient(
  SupabaseConfig.url,
  SupabaseConfig.anonKey,
);
```

### Option 2: Use dart-define (more secure)

Update `netlify.toml` build command:

```toml
[build]
  command = "flutter/bin/flutter build web --release --dart-define=SUPABASE_URL=$SUPABASE_URL --dart-define=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"
```

Then access in code:
```dart
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
```

## Automatic Deployments

Every time you push to your branch, Netlify will:
1. Pull the latest code
2. Build the Flutter web app
3. Deploy the new version
4. Your site is updated! 🎉

## Custom Domain (Optional)

To use your own domain:
1. Go to **Site settings** → **Domain management**
2. Click **"Add custom domain"**
3. Follow the instructions to update your DNS records

## Troubleshooting

### Build fails with Flutter not found
- Netlify should auto-install Flutter based on `FLUTTER_VERSION` in `netlify.toml`
- Check the build logs for specific errors

### CORS errors with Supabase
- Add your Netlify URL to Supabase allowed origins
- Go to Supabase Dashboard → Settings → API → CORS
- Add: `https://your-site-name.netlify.app`

### App loads but shows blank page
- Check browser console for JavaScript errors
- Verify Supabase credentials are correct
- Check that `base href` is correct in `build/web/index.html`

## Monitoring

- **Build logs**: Site overview → Deploys → Click on a deploy to see logs
- **Analytics**: Netlify provides basic analytics in the dashboard
- **Error tracking**: Consider adding Sentry or LogRocket for production

## Next Steps

1. Test your deployed site thoroughly
2. Set up a custom domain if desired
3. Configure CORS in Supabase for your Netlify URL
4. Share the URL with your team!

## Clean Up Firebase (Optional)

Since you're using Netlify now, you can:
- Delete the Firebase project (or keep it for future use)
- Remove `firebase.json` and `.firebaserc` from the repo (optional)
