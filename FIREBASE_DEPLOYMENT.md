# Firebase Deployment Guide for BlueBubbles CRM

This guide explains how to build and deploy your BlueBubbles CRM web app to Firebase Hosting.

## Prerequisites

1. **Flutter installed** on your Mac
2. **Firebase CLI installed**: `npm install -g firebase-tools`
3. **Firebase project created** at https://console.firebase.google.com

## Setup Steps

### 1. Configure Firebase Project

Edit `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with your actual Firebase project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### 2. Login to Firebase

```bash
firebase login
```

### 3. Build Flutter Web App

```bash
# Make sure you're in the project root
flutter clean
flutter pub get
flutter build web --release
```

This creates optimized web files in `build/web/`

### 4. Test Locally (Optional)

```bash
firebase serve
```

Then visit http://localhost:5000 to test your app before deploying.

### 5. Deploy to Firebase

```bash
firebase deploy
```

Your app will be live at: `https://your-project-id.web.app`

## Environment Variables for Supabase

Since Flutter web apps can't use environment variables the same way as Node.js apps, you need to configure Supabase in your Flutter code.

### Option 1: Create a config file (Recommended)

Create `lib/config/app_config.dart`:

```dart
class AppConfig {
  static const String supabaseUrl = 'YOUR_SUPABASE_URL';
  static const String supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
}
```

Then update `lib/services/crm/supabase_service.dart` to use these values.

### Option 2: Use --dart-define

Build with environment variables:

```bash
flutter build web --release \
  --dart-define=SUPABASE_URL=your_url \
  --dart-define=SUPABASE_ANON_KEY=your_key
```

Then access them in code:
```dart
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
```

## Continuous Deployment (Optional)

You can set up GitHub Actions to auto-deploy on push:

1. Create `.github/workflows/firebase-deploy.yml`
2. Add Firebase token as GitHub secret
3. Every push to main will auto-deploy

## Troubleshooting

### Build fails
- Run `flutter doctor` to check your Flutter installation
- Make sure you're using a compatible Flutter version
- Try `flutter clean` and rebuild

### App doesn't load
- Check browser console for errors
- Verify Supabase credentials are correct
- Check Firebase Hosting configuration in `firebase.json`

### CORS errors with Supabase
- Add your Firebase hosting URL to Supabase allowed origins
- Go to Supabase Dashboard → Settings → API → CORS

## Next Steps

After deploying:
1. Update Vercel settings to point to Firebase (or delete Vercel project)
2. Share your Firebase URL with your team
3. Monitor usage in Firebase Console
