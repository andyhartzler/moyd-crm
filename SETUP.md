# BlueBubbles CRM Setup Guide

Complete guide to get your BlueBubbles + Supabase CRM app running!

## Prerequisites

1. **BlueBubbles Server** - Running on a Mac with iMessage
2. **Supabase Project** - Free tier works perfectly
3. **Flutter** - Version 3.x or higher
4. **macOS, iOS, Android, Windows, Linux, or Web** - Choose your platform!

---

## Step 1: Set Up Supabase CRM Database

### 1.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create a new organization (or use existing)
4. Create a new project (note: takes ~2 minutes to provision)
5. Choose a secure database password

### 1.2 Create CRM Tables

Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New Query):

```sql
-- Members table
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  birthday DATE,
  notes TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  member_status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Member tags junction table
CREATE TABLE member_tags (
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (member_id, tag_id)
);

-- Message templates table
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message history (for analytics)
CREATE TABLE message_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  message_text TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  message_type TEXT
);

-- Indexes for better performance
CREATE INDEX idx_members_phone ON members(phone);
CREATE INDEX idx_members_status ON members(member_status);
CREATE INDEX idx_message_history_member ON message_history(member_id);
CREATE INDEX idx_message_history_sent ON message_history(sent_at);

-- Enable Row Level Security (RLS)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_history ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (adjust based on your needs)
CREATE POLICY "Enable all access for authenticated users" ON members
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all access for authenticated users" ON tags
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all access for authenticated users" ON member_tags
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all access for authenticated users" ON message_templates
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all access for authenticated users" ON message_history
  FOR ALL USING (auth.role() = 'authenticated');
```

### 1.3 Get Your Supabase Credentials

1. Go to Project Settings → API
2. Copy your **Project URL** (looks like: `https://xxxxx.supabase.co`)
3. Copy your **anon/public key** (starts with `eyJ...`)

---

## Step 2: Set Up BlueBubbles Server

### 2.1 Install BlueBubbles Server

1. Download from [https://bluebubbles.app](https://bluebubbles.app)
2. Install on your Mac
3. Enable Private API for advanced features (typing indicators, reactions, etc.)
4. Note your server URL and password

---

## Step 3: Configure Environment Variables

### 3.1 Create .env File (Local Development)

Create a `.env` file in the project root:

```bash
# BlueBubbles Server
BLUEBUBBLES_URL=https://your-server.ngrok.io
BLUEBUBBLES_PASSWORD=your-password

# Supabase CRM
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important:** Never commit `.env` to git! It's already in `.gitignore`.

---

## Step 4: Install Dependencies

```bash
cd /workspaces/moyd-crm
flutter pub get
```

This installs:
- BlueBubbles app dependencies
- `supabase_flutter` for CRM
- All platform-specific packages

---

## Step 5: Run the App

### For Web (Easiest to Test)

```bash
flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://xxxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci...
```

### For Desktop (macOS, Windows, Linux)

```bash
flutter run -d macos \
  --dart-define=SUPABASE_URL=https://xxxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci...
```

Replace `macos` with `windows` or `linux` for other platforms.

### For Mobile (iOS, Android)

```bash
flutter run -d ios \
  --dart-define=SUPABASE_URL=https://xxxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci...
```

Replace `ios` with your connected device name.

---

## Step 6: Test CRM Features

### 6.1 Add Test Members

In Supabase Dashboard → Table Editor → members:

1. Click "Insert" → "Insert row"
2. Add test member:
   - **phone**: `+15551234567` (use E.164 format)
   - **first_name**: `John`
   - **last_name**: `Doe`
   - **email**: `john@example.com`

### 6.2 Add Test Tags

In tags table:

1. Insert tag:
   - **name**: `VIP`
   - **color**: `#FF5733`

### 6.3 Link Tag to Member

In member_tags table:

1. Insert row:
   - **member_id**: (UUID of John Doe)
   - **tag_id**: (UUID of VIP tag)

### 6.4 Test in App

1. Open a conversation with `+15551234567`
2. Click the person icon (floating button on right)
3. See member info, tags, demographics in sidebar!

---

## Step 7: Building for Production

### Web

```bash
flutter build web \
  --dart-define=SUPABASE_URL=https://xxxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci... \
  --release

# Output in: build/web/
```

### Desktop

```bash
flutter build macos \
  --dart-define=SUPABASE_URL=https://xxxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci... \
  --release

# Output in: build/macos/Build/Products/Release/
```

### Mobile

```bash
flutter build ios \
  --dart-define=SUPABASE_URL=https://xxxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci... \
  --release

# Output: build/ios/iphoneos/Runner.app
```

---

## Troubleshooting

### Error: "Failed to initialize CRM services"

**Cause:** Supabase credentials are incorrect or not provided.

**Fix:**
1. Check that you're passing `--dart-define` flags when running
2. Verify credentials in Supabase dashboard
3. Check network connectivity

### Error: "No member found in CRM"

**Cause:** Phone number format mismatch.

**Fix:**
1. Ensure phone numbers in Supabase use E.164 format: `+1234567890`
2. BlueBubbles stores phone numbers in E.164 format automatically
3. Check the `members` table for exact phone format

### CRM Sidebar Not Showing

**Cause:** Only shows on desktop by default.

**Fix:**
1. Run on desktop (macOS, Windows, Linux) or web
2. Look for person icon on right side of conversation
3. Click to open sidebar

### Supabase Connection Timeout

**Cause:** Network issues or wrong URL.

**Fix:**
1. Check Supabase project status (dashboard)
2. Verify SUPABASE_URL is correct (no trailing slash)
3. Check firewall settings

---

## Next Steps

Now that your app is running, you can:

1. **Add More Members** - Import from CSV or add manually
2. **Create Tags** - Organize members by demographics, interests
3. **Build Member Directory** - Browse/search all members (TODO)
4. **Add Analytics Dashboard** - See engagement metrics (TODO)
5. **Implement Bulk Messaging** - Send to filtered groups (TODO)
6. **Create Templates** - Quick message templates (TODO)

---

## Architecture Overview

### Hybrid Database Approach

- **ObjectBox (Local)** - Messages, chats, attachments
  - Fast offline access
  - BlueBubbles default
  - Encrypted on device

- **Supabase (Cloud)** - CRM data, members, tags
  - Shared across team
  - Real-time sync
  - PostgreSQL with REST API

### Phone Number Linking

- BlueBubbles chats have participant phone numbers
- Supabase members have phone numbers (E.164 format)
- `SupabaseService.getMemberByPhone()` links them
- Member sidebar shows CRM data for current chat

---

## Support

- **BlueBubbles Docs**: [https://docs.bluebubbles.app](https://docs.bluebubbles.app)
- **Supabase Docs**: [https://supabase.com/docs](https://supabase.com/docs)
- **Flutter Docs**: [https://docs.flutter.dev](https://docs.flutter.dev)
- **This Project**: See `CRM_INTEGRATION_README.md` for code details

---

**That's it! You're all set up!** 🎉

Your BlueBubbles app now has full CRM capabilities with member management, tagging, and analytics foundation.
