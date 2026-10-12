PRAGMA foreign_keys = ON;

ALTER TABLE students ADD COLUMN role TEXT NOT NULL DEFAULT 'student';
ALTER TABLE students ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE students ADD COLUMN suspended_until INTEGER;
ALTER TABLE students ADD COLUMN suspension_reason TEXT;
ALTER TABLE students ADD COLUMN terms_version TEXT;
ALTER TABLE students ADD COLUMN terms_accepted_at INTEGER;

CREATE TABLE IF NOT EXISTS profiles (
  email TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  bio TEXT NOT NULL DEFAULT '',
  avatar_key TEXT,
  major TEXT,
  study_year TEXT,
  hidden_from_search INTEGER NOT NULL DEFAULT 0,
  hide_follow_lists INTEGER NOT NULL DEFAULT 0,
  username_changed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS username_redirects (
  old_username TEXT PRIMARY KEY COLLATE NOCASE,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocked_registrations (
  email_hash TEXT PRIMARY KEY NOT NULL,
  reason TEXT NOT NULL,
  blocked_at INTEGER NOT NULL,
  blocked_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_invites (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'admin',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  invited_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  follower_email TEXT NOT NULL,
  followed_email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_email, followed_email),
  CHECK (follower_email <> followed_email),
  FOREIGN KEY (follower_email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (followed_email) REFERENCES students(email) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS follows_followed_idx ON follows(followed_email, created_at DESC);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY NOT NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  pinned_at INTEGER,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (author_email) REFERENCES students(email) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS social_posts_feed_idx ON social_posts(status, published_at DESC);

CREATE TABLE IF NOT EXISTS post_media (
  post_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (post_id, media_id),
  UNIQUE (post_id, position),
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, email),
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_bookmarks (
  post_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, email),
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL,
  author_email TEXT NOT NULL,
  parent_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, email),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY NOT NULL,
  recipient_email TEXT NOT NULL,
  actor_email TEXT,
  type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (recipient_email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (actor_email) REFERENCES students(email) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_email, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  email TEXT PRIMARY KEY NOT NULL,
  likes INTEGER NOT NULL DEFAULT 1,
  comments INTEGER NOT NULL DEFAULT 1,
  follows INTEGER NOT NULL DEFAULT 1,
  mentions INTEGER NOT NULL DEFAULT 1,
  gossip_replies INTEGER NOT NULL DEFAULT 1,
  announcements INTEGER NOT NULL DEFAULT 1,
  web_push INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gossip_messages (
  id TEXT PRIMARY KEY NOT NULL,
  sender_email TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reply_body TEXT,
  replied_by TEXT,
  replied_at INTEGER,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (sender_email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (replied_by) REFERENCES students(email) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gossip_messages_status_idx ON gossip_messages(status, created_at DESC);

CREATE TABLE IF NOT EXISTS gossip_media (
  gossip_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (gossip_id, media_id),
  FOREIGN KEY (gossip_id) REFERENCES gossip_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_email TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  resolution TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (reporter_email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES students(email) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS not_interested (
  email TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, post_id),
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_views (
  post_id TEXT NOT NULL,
  viewer_hash TEXT NOT NULL,
  viewed_on TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, viewer_hash, viewed_on),
  FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  image_key TEXT,
  action_label TEXT,
  action_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcement_dismissals (
  announcement_id TEXT NOT NULL,
  email TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY (announcement_id, email),
  FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  FOREIGN KEY (email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
 ('registration_enabled','true',unixepoch()),
 ('posting_enabled','true',unixepoch()),
 ('comments_enabled','true',unixepoch()),
 ('require_post_approval','false',unixepoch()),
 ('mail_sender_name','Gossip BH',unixepoch()),
 ('verification_subject','Verify your Gossip BH student account',unixepoch()),
 ('reset_subject','Reset your Gossip BH password',unixepoch());

CREATE TABLE IF NOT EXISTS suspension_appeals (
  id TEXT PRIMARY KEY NOT NULL,
  student_email TEXT NOT NULL,
  appeal_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (student_email) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id TEXT PRIMARY KEY NOT NULL,
  student_email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at INTEGER NOT NULL,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  FOREIGN KEY (student_email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES students(email) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL DEFAULT 'invited',
  api_key_hash TEXT,
  password_hash TEXT,
  password_salt TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES students(email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partner_branches (
  id TEXT PRIMARY KEY NOT NULL,
  partner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY NOT NULL,
  partner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_key TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  one_time_only INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS offer_claims (
  id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL,
  student_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  branch_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (offer_id, student_email),
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  FOREIGN KEY (student_email) REFERENCES students(email) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES partner_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
