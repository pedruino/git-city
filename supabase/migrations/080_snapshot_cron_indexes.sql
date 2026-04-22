-- Performance indexes for the /api/cron/city-snapshot endpoint. That cron
-- runs every 10 min (Vercel) or ~every login (Railway via after()). Each run
-- fires 8 parallel queries over the tables below. Without these indexes,
-- every regeneration does seq scans.

-- Non-gifted completed purchases — drives `owned_items` map.
-- Complements idx_purchases_gifted_to (which only covers gifted_to IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_purchases_owned
  ON purchases (developer_id, item_id)
  WHERE gifted_to IS NULL AND status = 'completed';

-- developer_customizations lookup by item_id (cron filters item_id IN (...)).
CREATE INDEX IF NOT EXISTS idx_dev_customizations_item
  ON developer_customizations (item_id, developer_id);

-- raid_tags active-only lookup. Existing idx_raid_tags_expires covers
-- expiration, but cron reads WHERE active=true which was seq-scanning.
CREATE INDEX IF NOT EXISTS idx_raid_tags_active
  ON raid_tags (building_id)
  WHERE active = true;
