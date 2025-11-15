-- Photo Likes Database Schema for Cloudflare D1

-- Likes table (simple!)
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_name TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(photo_name, ip_hash)  -- One like per IP per photo
);

-- Index for fast photo lookups
CREATE INDEX IF NOT EXISTS idx_photo_name ON likes(photo_name);

-- Index for IP checking (prevent duplicates)
CREATE INDEX IF NOT EXISTS idx_ip_hash ON likes(ip_hash);

-- Sample queries:
-- Get like count for a photo:
-- SELECT COUNT(*) as count FROM likes WHERE photo_name = 'IMG_0162.jpg';

-- Add a like:
-- INSERT OR IGNORE INTO likes (photo_name, ip_hash, created_at) VALUES ('IMG_0162.jpg', 'hash123', 1700000000000);

-- Remove a like (unlike):
-- DELETE FROM likes WHERE photo_name = 'IMG_0162.jpg' AND ip_hash = 'hash123';

-- Get all like counts:
-- SELECT photo_name, COUNT(*) as count FROM likes GROUP BY photo_name;

-- Check if IP already liked a photo:
-- SELECT COUNT(*) as liked FROM likes WHERE photo_name = 'IMG_0162.jpg' AND ip_hash = 'hash123';
