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

// Migrate items table to add new columns if they don't exist
// SQLite requires separate ALTER TABLE statements for each column
const addColumnIfNotExists = (columnName, columnDef) => {
  try {
    db.exec(`ALTER TABLE items ADD COLUMN ${columnName} ${columnDef}`);
  } catch (error) {
    // Column may already exist, which is fine
    if (!error.message.includes('duplicate column name')) {
      console.error(`Error adding column ${columnName}:`, error.message);
    }
  }
};

addColumnIfNotExists('type', "TEXT DEFAULT 'check'");
addColumnIfNotExists('description', 'TEXT');
addColumnIfNotExists('parent_item_id', 'INTEGER');
addColumnIfNotExists('counter_value', 'INTEGER DEFAULT 0');
addColumnIfNotExists('counter_target', 'INTEGER');

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
    // Ensure integers for proper comparison
    return stmt.run(parseInt(userId), parseInt(bucketListId));
  },

  isMember: (bucketListId, userId) => {
    const stmt = db.prepare('SELECT * FROM bucket_list_members WHERE bucket_list_id = ? AND user_id = ?');
    // Ensure integers for proper comparison - SQLite is strict about type matching
    const result = stmt.get(parseInt(bucketListId), parseInt(userId));
    // better-sqlite3 returns undefined when no row found, but check both for safety
    return result !== undefined && result !== null;
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
  createItem: (bucketListId, text, options = {}) => {
    const {
      type = 'check',
      description = null,
      parentItemId = null,
      counterValue = 0,
      counterTarget = null
    } = options;

    const stmt = db.prepare(`
      INSERT INTO items (
        bucket_list_id, text, type, description, parent_item_id,
        counter_value, counter_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      parseInt(bucketListId),
      text,
      type,
      description || null,
      parentItemId ? parseInt(parentItemId) : null,
      parseInt(counterValue) || 0,
      counterTarget ? parseInt(counterTarget) : null
    );
  },

  getItems: (bucketListId) => {
    const stmt = db.prepare(`
      SELECT i.*, u.username as checked_by_username
      FROM items i
      LEFT JOIN users u ON i.checked_by = u.id
      WHERE i.bucket_list_id = ?
      ORDER BY 
        CASE WHEN i.parent_item_id IS NULL THEN 0 ELSE 1 END,
        i.parent_item_id,
        i.created_at ASC
    `);
    return stmt.all(parseInt(bucketListId));
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
    return stmt.get(parseInt(itemId));
  },

  updateCounter: (itemId, delta) => {
    const item = dbHelpers.getItem(itemId);
    if (!item || item.type !== 'counter') {
      throw new Error('Item not found or not a counter type');
    }

    const newValue = Math.max(0, (parseInt(item.counter_value) || 0) + parseInt(delta));
    const target = item.counter_target ? parseInt(item.counter_target) : null;
    const clampedValue = target ? Math.min(newValue, target) : newValue;

    const stmt = db.prepare('UPDATE items SET counter_value = ? WHERE id = ?');
    return stmt.run(clampedValue, parseInt(itemId));
  }
};

module.exports = { db, ...dbHelpers };

