CREATE TABLE IF NOT EXISTS gossip_replies (
  id TEXT PRIMARY KEY NOT NULL,
  gossip_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sticker TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (gossip_id) REFERENCES gossip_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS gossip_replies_gossip_idx
ON gossip_replies(gossip_id, status, created_at);
