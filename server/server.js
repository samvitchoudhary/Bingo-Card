const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const {
  db,
  createUser,
  getUserByUsername,
  getUserById,
  createBucketList,
  getBucketListByCode,
  getBucketListById,
  getUserBucketLists,
  addMember,
  isMember,
  getMembers,
  createItem,
  getItems,
  toggleItem,
  getItem
} = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: 'bucket-list-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Helper function to generate share code
function generateShareCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// API Routes

// Registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = createUser(username, passwordHash);
    
    // Set session
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;

    res.json({ 
      success: true, 
      user: { 
        id: result.lastInsertRowid, 
        username 
      } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get user
    const user = getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Check authentication status
app.get('/api/me', requireAuth, (req, res) => {
  const user = getUserById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// Create bucket list
app.post('/api/bucket-lists', requireAuth, (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Bucket list name is required' });
    }

    // Generate unique share code
    let shareCode = generateShareCode();
    let attempts = 0;
    while (getBucketListByCode(shareCode) && attempts < 10) {
      shareCode = generateShareCode();
      attempts++;
    }

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique share code' });
    }

    // Create bucket list
    const result = createBucketList(name.trim(), shareCode, req.session.userId);
    const bucketList = getBucketListById(result.lastInsertRowid);

    res.json({ success: true, bucketList });
  } catch (error) {
    console.error('Create bucket list error:', error);
    res.status(500).json({ error: 'Failed to create bucket list' });
  }
});

// Join bucket list
app.post('/api/bucket-lists/join', requireAuth, (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.trim().length === 0) {
      return res.status(400).json({ error: 'Share code is required' });
    }

    const bucketList = getBucketListByCode(code.trim().toUpperCase());
    if (!bucketList) {
      return res.status(404).json({ error: 'Bucket list not found' });
    }

    // Check if already a member
    if (isMember(bucketList.id, req.session.userId)) {
      return res.status(400).json({ error: 'Already a member of this bucket list' });
    }

    // Add member
    addMember(bucketList.id, req.session.userId);

    res.json({ success: true, bucketList });
  } catch (error) {
    console.error('Join bucket list error:', error);
    res.status(500).json({ error: 'Failed to join bucket list' });
  }
});

// Get user's bucket lists
app.get('/api/bucket-lists', requireAuth, (req, res) => {
  try {
    const bucketLists = getUserBucketLists(req.session.userId);
    res.json({ bucketLists });
  } catch (error) {
    console.error('Get bucket lists error:', error);
    res.status(500).json({ error: 'Failed to get bucket lists' });
  }
});

// Get specific bucket list with items
app.get('/api/bucket-lists/:id', requireAuth, (req, res) => {
  try {
    const bucketListId = parseInt(req.params.id);
    const bucketList = getBucketListById(bucketListId);

    if (!bucketList) {
      return res.status(404).json({ error: 'Bucket list not found' });
    }

    // Check if user is a member
    if (!isMember(bucketListId, req.session.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get items and members
    const items = getItems(bucketListId);
    const members = getMembers(bucketListId);

    res.json({ 
      bucketList, 
      items, 
      members 
    });
  } catch (error) {
    console.error('Get bucket list error:', error);
    res.status(500).json({ error: 'Failed to get bucket list' });
  }
});

// Add item to bucket list
app.post('/api/items', requireAuth, (req, res) => {
  try {
    const { bucket_list_id, text } = req.body;

    if (!bucket_list_id || !text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Bucket list ID and item text are required' });
    }

    // Verify bucket list exists
    const bucketList = getBucketListById(bucket_list_id);
    if (!bucketList) {
      return res.status(404).json({ error: 'Bucket list not found' });
    }

    // Check if user is a member
    if (!isMember(bucket_list_id, req.session.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create item
    const result = createItem(bucket_list_id, text.trim());
    const item = getItem(result.lastInsertRowid);

    res.json({ success: true, item });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Toggle item checkbox
app.patch('/api/items/:id/toggle', requireAuth, (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = getItem(itemId);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if user is a member of the bucket list
    if (!isMember(item.bucket_list_id, req.session.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Toggle item
    const newCheckedState = !item.is_checked;
    toggleItem(itemId, req.session.userId, newCheckedState);

    // Get updated item
    const updatedItem = getItem(itemId);

    res.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error('Toggle item error:', error);
    res.status(500).json({ error: 'Failed to toggle item' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

