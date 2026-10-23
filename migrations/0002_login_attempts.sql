-- Failed sign-in attempts, tracked per client (IP address, or IPv6 /64 network)
-- so a stranger guessing passwords locks out only themselves.
CREATE TABLE login_attempts (
  client TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
