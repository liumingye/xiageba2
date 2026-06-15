-- Create Music table
CREATE TABLE IF NOT EXISTS Music (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  lyrics TEXT DEFAULT '',
  flacUrl TEXT DEFAULT '',
  mp3Url TEXT DEFAULT '',
  playUrl TEXT DEFAULT '',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create Admin table
CREATE TABLE IF NOT EXISTS Admin (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin
INSERT OR IGNORE INTO Admin (id, username, password) VALUES ('admin', 'admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918');
