const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, '..', 'bucketlist.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bucket_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    share_code TEXT UNIQUE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bucket_list_members (
    user_id INTEGER,
    bucket_list_id INTEGER,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, bucket_list_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (bucket_list_id) REFERENCES bucket_lists(id)
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_list_id INTEGER,
    text TEXT NOT NULL,
    is_checked BOOLEAN DEFAULT 0,
    checked_by INTEGER,
    checked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bucket_list_id) REFERENCES bucket_lists(id),
    FOREIGN KEY (checked_by) REFERENCES users(id)
  );
`);

// Helper functions
const dbHelpers = {
  // User operations
  createUser: (username, passwordHash) => {
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    return stmt.run(username, passwordHash);
  },

  getUserByUsername: (username) => {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
  },

  getUserById: (id) => {
    const stmt = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  },

  // Bucket list operations
  createBucketList: (name, shareCode, createdBy) => {
    const stmt = db.prepare('INSERT INTO bucket_lists (name, share_code, created_by) VALUES (?, ?, ?)');
    const result = stmt.run(name, shareCode, createdBy);
    // Add creator as member
    dbHelpers.addMember(result.lastInsertRowid, createdBy);
    return result;
  },

  getBucketListByCode: (shareCode) => {
    const stmt = db.prepare('SELECT * FROM bucket_lists WHERE share_code = ?');
    return stmt.get(shareCode);
  },

  getBucketListById: (id) => {
    const stmt = db.prepare('SELECT * FROM bucket_lists WHERE id = ?');
    return stmt.get(id);
  },

  getUserBucketLists: (userId) => {
    const stmt = db.prepare(`
      SELECT DISTINCT bl.* FROM bucket_lists bl
      INNER JOIN bucket_list_members blm ON bl.id = blm.bucket_list_id
      WHERE blm.user_id = ?
      ORDER BY bl.created_at DESC
    `);
    return stmt.all(userId);
  },

  // Membership operations
  addMember: (bucketListId, userId) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO bucket_list_members (user_id, bucket_list_id) VALUES (?, ?)');
    return stmt.run(userId, bucketListId);
  },

  isMember: (bucketListId, userId) => {
    const stmt = db.prepare('SELECT * FROM bucket_list_members WHERE bucket_list_id = ? AND user_id = ?');
    return stmt.get(bucketListId, userId) !== undefined;
  },

  getMembers: (bucketListId) => {
    const stmt = db.prepare(`
      SELECT u.id, u.username, blm.joined_at
      FROM users u
      INNER JOIN bucket_list_members blm ON u.id = blm.user_id
      WHERE blm.bucket_list_id = ?
      ORDER BY blm.joined_at ASC
    `);
    return stmt.all(bucketListId);
  },

  // Item operations
  createItem: (bucketListId, text) => {
    const stmt = db.prepare('INSERT INTO items (bucket_list_id, text) VALUES (?, ?)');
    return stmt.run(bucketListId, text);
  },

  getItems: (bucketListId) => {
    const stmt = db.prepare(`
      SELECT i.*, u.username as checked_by_username
      FROM items i
      LEFT JOIN users u ON i.checked_by = u.id
      WHERE i.bucket_list_id = ?
      ORDER BY i.created_at ASC
    `);
    return stmt.all(bucketListId);
  },

  toggleItem: (itemId, userId, isChecked) => {
    if (isChecked) {
      const stmt = db.prepare('UPDATE items SET is_checked = 1, checked_by = ?, checked_at = CURRENT_TIMESTAMP WHERE id = ?');
      return stmt.run(userId, itemId);
    } else {
      const stmt = db.prepare('UPDATE items SET is_checked = 0, checked_by = NULL, checked_at = NULL WHERE id = ?');
      return stmt.run(itemId);
    }
  },

  getItem: (itemId) => {
    const stmt = db.prepare(`
      SELECT i.*, u.username as checked_by_username
      FROM items i
      LEFT JOIN users u ON i.checked_by = u.id
      WHERE i.id = ?
    `);
    return stmt.get(itemId);
  }
};

module.exports = { db, ...dbHelpers };

