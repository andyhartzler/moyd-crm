-- ===================================================================
-- CLEANUP SCRIPT: Remove duplicate conversation records
-- ===================================================================
-- This script consolidates duplicate conversation records by:
-- 1. Identifying the most recent conversation per member_id
-- 2. Reassigning all messages to the primary conversation
-- 3. Deleting the duplicate conversation records
--
-- IMPORTANT: Run this in your Supabase SQL Editor
-- ===================================================================

-- Step 1: View current duplicates (optional - to see what will be cleaned)
WITH ranked_conversations AS (
  SELECT
    id,
    member_id,
    created_at,
    updated_at,
    ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC NULLS LAST, created_at DESC) as rn
  FROM conversations
)
SELECT
  member_id,
  COUNT(*) as conversation_count
FROM ranked_conversations
GROUP BY member_id
HAVING COUNT(*) > 1
ORDER BY conversation_count DESC;

-- Step 2: Consolidate messages to primary conversation
-- This updates all messages from duplicate conversations to point to the primary one
WITH ranked_conversations AS (
  SELECT
    id,
    member_id,
    updated_at,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC NULLS LAST, created_at DESC) as rn
  FROM conversations
),
primary_conversations AS (
  SELECT id as primary_id, member_id
  FROM ranked_conversations
  WHERE rn = 1
),
duplicate_conversations AS (
  SELECT rc.id as duplicate_id, rc.member_id, pc.primary_id
  FROM ranked_conversations rc
  JOIN primary_conversations pc ON rc.member_id = pc.member_id
  WHERE rc.rn > 1
)
UPDATE messages
SET conversation_id = dc.primary_id
FROM duplicate_conversations dc
WHERE messages.conversation_id = dc.duplicate_id;

-- Step 3: Delete duplicate conversation records
-- This removes all duplicate conversations, keeping only the most recent one per member
WITH ranked_conversations AS (
  SELECT
    id,
    member_id,
    ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC NULLS LAST, created_at DESC) as rn
  FROM conversations
)
DELETE FROM conversations
WHERE id IN (
  SELECT id FROM ranked_conversations WHERE rn > 1
);

-- Step 4: Verify cleanup (should return no rows if successful)
WITH ranked_conversations AS (
  SELECT
    id,
    member_id,
    created_at,
    updated_at,
    ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC NULLS LAST, created_at DESC) as rn
  FROM conversations
)
SELECT
  member_id,
  COUNT(*) as conversation_count
FROM ranked_conversations
GROUP BY member_id
HAVING COUNT(*) > 1
ORDER BY conversation_count DESC;
