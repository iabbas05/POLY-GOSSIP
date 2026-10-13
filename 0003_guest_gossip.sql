INSERT OR IGNORE INTO students (
  email,
  password_hash,
  password_salt,
  verified_at,
  created_at,
  role,
  status
) VALUES (
  'guest@gossipbh.com',
  'guest-login-disabled',
  'guest-login-disabled',
  0,
  unixepoch(),
  'student',
  'active'
);
