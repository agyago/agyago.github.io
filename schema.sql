-- Photo Comments Database Schema for Cloudflare D1

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_name TEXT NOT NULL,
  author_name TEXT,
  comment_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT,
  user_agent TEXT
);

-- Index for fast photo lookups
CREATE INDEX IF NOT EXISTS idx_photo_name ON comments(photo_name);

-- Index for chronological sorting
CREATE INDEX IF NOT EXISTS idx_created_at ON comments(created_at DESC);

-- Sample query examples:
-- Get all comments for a photo:
-- SELECT * FROM comments WHERE photo_name = 'IMG_0162.jpg' ORDER BY created_at DESC;

-- Add a comment:
-- INSERT INTO comments (photo_name, author_name, comment_text, created_at, ip_hash)
-- VALUES ('IMG_0162.jpg', 'John', 'Great photo!', 1700000000000, 'hash123');

-- Delete a comment (admin only):
-- DELETE FROM comments WHERE id = 1;

-- Get comment count per photo:
-- SELECT photo_name, COUNT(*) as count FROM comments GROUP BY photo_name;
