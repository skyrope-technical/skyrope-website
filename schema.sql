-- Sky Rope contact form — Cloudflare D1 schema
-- Run this once in the Cloudflare Dashboard → D1 → your database → Console tab.

CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  company    TEXT,
  service    TEXT,
  message    TEXT,
  source     TEXT DEFAULT 'website',
  status     TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Optional: index for sorting by submission time.
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- Optional: index for filtering by status (e.g. 'new', 'contacted', 'closed').
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
