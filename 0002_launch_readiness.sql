PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS partner_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  partner_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_sessions_expiry_idx ON partner_sessions(expires_at);

CREATE TABLE IF NOT EXISTS moderation_terms (
  id TEXT PRIMARY KEY NOT NULL,
  term TEXT NOT NULL COLLATE NOCASE UNIQUE,
  action TEXT NOT NULL DEFAULT 'review',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campus_resources (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Student life',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  actor_hash TEXT,
  entity_type TEXT,
  entity_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_events_type_date_idx ON analytics_events(event_type,created_at);

CREATE TABLE IF NOT EXISTS account_deletion_audit (
  email_hash TEXT PRIMARY KEY NOT NULL,
  requested_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
 ('auto_hide_report_count','3',unixepoch()),
 ('media_video_max_seconds','10',unixepoch()),
 ('community_support_email','iabbas05@icloud.com',unixepoch());

INSERT OR IGNORE INTO campus_resources(id,title,description,url,category,sort_order,active,created_by,created_at,updated_at) VALUES
 ('campus-map','Campus map','Buildings, classrooms and offices','https://www.polytechnic.bh/about-us/bahrain-polytechnic-life/campus-map/','Campus',10,1,'system',unixepoch(),unixepoch()),
 ('student-services','Student services','Official resources for current students','https://www.polytechnic.bh/current-students/','Services',20,1,'system',unixepoch(),unixepoch()),
 ('academic-calendar','Academic calendar','Important dates and semesters','https://www.polytechnic.bh/academic-calendar/','Academic',30,1,'system',unixepoch(),unixepoch()),
 ('poly-website','Polytechnic website','Open the official Bahrain Polytechnic website','https://www.polytechnic.bh/','Official',40,1,'system',unixepoch(),unixepoch());
