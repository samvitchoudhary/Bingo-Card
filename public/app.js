// API helper functions
const api = {
  async request(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  },

  // Auth endpoints
  async register(username, password) {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async login(username, password) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async logout() {
    return this.request('/logout', {
      method: 'POST',
    });
  },

  async getMe() {
    return this.request('/me');
  },

  // Bucket list endpoints
  async createBucketList(name) {
    return this.request('/bucket-lists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async joinBucketList(code) {
    return this.request('/bucket-lists/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async getBucketLists() {
    return this.request('/bucket-lists');
  },

  async getBucketList(id) {
    return this.request(`/bucket-lists/${id}`);
  },

  // Item endpoints
  async addItem(bucketListId, payload) {
    return this.request('/items', {
      method: 'POST',
      body: JSON.stringify({ bucket_list_id: bucketListId, ...payload }),
    });
  },

  async toggleItem(itemId) {
    return this.request(`/items/${itemId}/toggle`, {
      method: 'PATCH',
    });
  },

  async updateCounter(itemId, delta) {
    return this.request(`/items/${itemId}/counter`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    });
  },
};

// Check which page user is on
const isDashboard = window.location.pathname.includes('dashboard.html');
const isListPage = window.location.pathname.includes('list.html');

// Authentication check
async function checkAuth() {
  try {
    const data = await api.getMe();
    if (data.user) {
      if (!isDashboard && !isListPage) {
        // Redirect to dashboard if logged in (on login page)
        window.location.href = 'dashboard.html';
      }
      return data.user;
    }
  } catch (error) {
    if (isDashboard || isListPage) {
      // Redirect to login if not authenticated (on protected pages)
      window.location.href = 'index.html';
    }
  }
  return null;
}

// Initialize based on page
if (isDashboard) {
  initDashboard();
} else if (isListPage) {
  initListPage();
} else {
  initAuth();
}

// Auth Page Functions
function initAuth() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const showRegister = document.getElementById('showRegister');
  const showLogin = document.getElementById('showLogin');
  const loginFormElement = document.getElementById('loginFormElement');
  const registerFormElement = document.getElementById('registerFormElement');

  // Toggle between login and register
  showRegister?.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  });

  showLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  });

  // Handle login
  loginFormElement?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = '';

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
      await api.login(username, password);
      window.location.href = 'dashboard.html';
    } catch (error) {
      errorDiv.textContent = error.message;
    }
  });

  // Handle registration
  registerFormElement?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('registerError');
    errorDiv.textContent = '';

    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;

    try {
      await api.register(username, password);
      window.location.href = 'dashboard.html';
    } catch (error) {
      errorDiv.textContent = error.message;
    }
  });

  // Check if already logged in
  checkAuth();
}

// Dashboard Functions
let currentUser = null;

async function initDashboard() {
  // Check authentication
  currentUser = await checkAuth();
  if (!currentUser) return;

  // Set username display
  const usernameDisplay = document.getElementById('usernameDisplay');
  if (usernameDisplay) {
    usernameDisplay.textContent = `Welcome, ${currentUser.username}`;
  }

  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn?.addEventListener('click', async () => {
    try {
      await api.logout();
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Logout error:', error);
    }
  });

  // Create list form
  const createListForm = document.getElementById('createListForm');
  createListForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('createListError');
    errorDiv.textContent = '';

    const listName = document.getElementById('listName').value;

    try {
      await api.createBucketList(listName);
      document.getElementById('listName').value = '';
      loadBucketLists();
    } catch (error) {
      errorDiv.textContent = error.message;
    }
  });

  // Join list form
  const joinListForm = document.getElementById('joinListForm');
  joinListForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('joinListError');
    errorDiv.textContent = '';

    const code = document.getElementById('joinCode').value.toUpperCase();

    try {
      await api.joinBucketList(code);
      document.getElementById('joinCode').value = '';
      loadBucketLists();
    } catch (error) {
      errorDiv.textContent = error.message;
    }
  });

  // Load bucket lists
  loadBucketLists();
}

async function loadBucketLists() {
  try {
    const data = await api.getBucketLists();
    const container = document.getElementById('bucketListsContainer');

    if (!data.bucketLists || data.bucketLists.length === 0) {
      container.innerHTML = '<p class="empty-message">No bucket lists yet. Create one above!</p>';
      return;
    }

    container.innerHTML = data.bucketLists.map(list => `
      <div class="bucket-list-card" data-id="${list.id}">
        <h3>${escapeHtml(list.name)}</h3>
        <p class="share-code">Share Code: <strong>${list.share_code}</strong></p>
      </div>
    `).join('');

    // Add click handlers - navigate to list page instead of opening modal
    container.querySelectorAll('.bucket-list-card').forEach(card => {
      card.addEventListener('click', () => {
        const listId = parseInt(card.dataset.id);
        window.location.href = `list.html?id=${listId}`;
      });
    });
  } catch (error) {
    console.error('Error loading bucket lists:', error);
  }
}

// List Page Functions
let currentListId = null;
let allItems = [];

async function initListPage() {
  // Check authentication
  const currentUser = await checkAuth();
  if (!currentUser) return;

  // Set username display
  const usernameDisplay = document.getElementById('usernameDisplay');
  if (usernameDisplay) {
    usernameDisplay.textContent = `Welcome, ${currentUser.username}`;
  }

  // Get list ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const listId = parseInt(urlParams.get('id'));

  if (!listId || isNaN(listId)) {
    alert('Invalid list ID');
    window.location.href = 'dashboard.html';
    return;
  }

  currentListId = listId;

  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn?.addEventListener('click', async () => {
    try {
      await api.logout();
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Logout error:', error);
    }
  });

  // Load bucket list data
  await loadListPage(listId);

  // Add item form handler
  const addItemForm = document.getElementById('addItemForm');
  const itemTypeSelect = document.getElementById('itemType');
  const parentItemGroup = document.getElementById('parentItemGroup');
  const counterTargetGroup = document.getElementById('counterTargetGroup');

  // Show/hide fields based on item type
  itemTypeSelect?.addEventListener('change', (e) => {
    if (e.target.value === 'counter') {
      counterTargetGroup.style.display = 'block';
    } else {
      counterTargetGroup.style.display = 'none';
      document.getElementById('counterTarget').value = '';
    }
  });

  addItemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('addItemError');
    errorDiv.textContent = '';

    const text = document.getElementById('itemText').value.trim();
    const type = document.getElementById('itemType').value;
    const description = document.getElementById('itemDescription').value.trim();
    const parentItemId = document.getElementById('parentItemId').value || null;
    const counterTarget = document.getElementById('counterTarget').value || null;

    if (!text) {
      errorDiv.textContent = 'Title is required';
      return;
    }

    try {
      const payload = {
        text,
        type,
        description: description || null,
        parent_item_id: parentItemId ? parseInt(parentItemId) : null,
        counter_target: counterTarget ? parseInt(counterTarget) : null
      };

      await api.addItem(currentListId, payload);
      
      // Reset form
      document.getElementById('itemText').value = '';
      document.getElementById('itemDescription').value = '';
      document.getElementById('parentItemId').value = '';
      document.getElementById('counterTarget').value = '';
      itemTypeSelect.value = 'check';
      counterTargetGroup.style.display = 'none';
      parentItemGroup.style.display = 'none';

      // Reload list
      await loadListPage(currentListId);
    } catch (error) {
      errorDiv.textContent = error.message;
    }
  });
}

async function loadListPage(listId) {
  try {
    const data = await api.getBucketList(listId);

    // Set title
    document.getElementById('listTitle').textContent = escapeHtml(data.bucketList.name);

    // Set share code
    document.getElementById('shareCodeDisplay').textContent = data.bucketList.share_code;

    // Set members
    const membersText = data.members.map(m => escapeHtml(m.username)).join(', ');
    document.getElementById('membersDisplay').textContent = membersText || 'None';

    // Store items for parent selection
    allItems = data.items;

    // Update parent item dropdown
    updateParentItemDropdown(data.items);

    // Load items with hierarchical rendering
    loadItemsHierarchical(data.items);
  } catch (error) {
    console.error('Error loading bucket list:', error);
    alert('Failed to load bucket list: ' + error.message);
    window.location.href = 'dashboard.html';
  }
}

function updateParentItemDropdown(items) {
  const parentSelect = document.getElementById('parentItemId');
  if (!parentSelect) return;

  // Clear existing options except "None"
  parentSelect.innerHTML = '<option value="">None (top level)</option>';

  // Add top-level items as potential parents
  items.filter(item => !item.parent_item_id).forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = escapeHtml(item.text || item.title || 'Untitled');
    parentSelect.appendChild(option);
  });

  // Show/hide parent item group based on whether there are items
  const parentItemGroup = document.getElementById('parentItemGroup');
  if (parentItemGroup && items.length > 0) {
    parentItemGroup.style.display = 'block';
  }
}

function loadItemsHierarchical(items) {
  const container = document.getElementById('itemsContainer');

  if (!items || items.length === 0) {
    container.innerHTML = '<p class="empty-message">No items yet. Add one above!</p>';
    return;
  }

  // Build a tree structure
  const itemMap = new Map();
  const rootItems = [];

  // First pass: create map of all items
  items.forEach(item => {
    itemMap.set(item.id, { ...item, children: [] });
  });

  // Second pass: build tree
  items.forEach(item => {
    const itemNode = itemMap.get(item.id);
    if (item.parent_item_id && itemMap.has(item.parent_item_id)) {
      const parent = itemMap.get(item.parent_item_id);
      parent.children.push(itemNode);
    } else {
      rootItems.push(itemNode);
    }
  });

  // Render tree
  container.innerHTML = '';
  rootItems.forEach(item => {
    container.appendChild(renderItemNode(item));
  });
}

function renderItemNode(item, depth = 0) {
  const itemDiv = document.createElement('div');
  itemDiv.className = `item item-${item.type || 'check'}`;
  if (depth > 0) {
    itemDiv.classList.add('sub-item');
    itemDiv.style.marginLeft = `${depth * 30}px`;
  }

  const checkedClass = item.is_checked ? 'checked' : '';
  const checkedByText = item.is_checked && item.checked_by_username
    ? ` (checked by ${escapeHtml(item.checked_by_username)})`
    : '';

  if (item.type === 'counter') {
    // Render counter item
    const counterValue = item.counter_value || 0;
    const counterTarget = item.counter_target;
    const isComplete = counterTarget && counterValue >= counterTarget;

    itemDiv.innerHTML = `
      <div class="item-header">
        <span class="item-text ${isComplete ? 'complete' : ''}">${escapeHtml(item.text)}</span>
        <div class="counter-controls">
          <button class="counter-btn" data-item-id="${item.id}" data-delta="-1">-</button>
          <span class="counter-value">${counterValue}${counterTarget ? ` / ${counterTarget}` : ''}</span>
          <button class="counter-btn" data-item-id="${item.id}" data-delta="1">+</button>
        </div>
      </div>
      ${item.description ? `<div class="item-description">${escapeHtml(item.description)}</div>` : ''}
      ${isComplete ? '<span class="item-complete-badge">Complete!</span>' : ''}
    `;
  } else {
    // Render checkbox item
    itemDiv.innerHTML = `
      <div class="item-header">
        <input 
          type="checkbox" 
          ${item.is_checked ? 'checked' : ''} 
          data-item-id="${item.id}"
          class="item-checkbox"
        >
        <span class="item-text ${checkedClass}">${escapeHtml(item.text)}</span>
        ${item.is_checked ? `<span class="item-checked-by">${checkedByText}</span>` : ''}
      </div>
      ${item.description ? `<div class="item-description">${escapeHtml(item.description)}</div>` : ''}
    `;
  }

  // Add event handlers
  if (item.type === 'counter') {
    // Counter buttons
    itemDiv.querySelectorAll('.counter-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemId = parseInt(btn.dataset.itemId);
        const delta = parseInt(btn.dataset.delta);
        try {
          await api.updateCounter(itemId, delta);
          await loadListPage(currentListId);
        } catch (error) {
          console.error('Error updating counter:', error);
          alert('Failed to update counter: ' + error.message);
        }
      });
    });
  } else {
    // Checkbox toggle
    const checkbox = itemDiv.querySelector('.item-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', async (e) => {
        const itemId = parseInt(e.target.dataset.itemId);
        try {
          await api.toggleItem(itemId);
          await loadListPage(currentListId);
        } catch (error) {
          console.error('Error toggling item:', error);
          e.target.checked = !e.target.checked;
          alert('Failed to toggle item: ' + error.message);
        }
      });
    }
  }

  // Render children recursively
  if (item.children && item.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'item-children';
    item.children.forEach(child => {
      childrenContainer.appendChild(renderItemNode(child, depth + 1));
    });
    itemDiv.appendChild(childrenContainer);
  }

  return itemDiv;
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

