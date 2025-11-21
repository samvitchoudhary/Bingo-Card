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
  async addItem(bucketListId, text) {
    return this.request('/items', {
      method: 'POST',
      body: JSON.stringify({ bucket_list_id: bucketListId, text }),
    });
  },

  async toggleItem(itemId) {
    return this.request(`/items/${itemId}/toggle`, {
      method: 'PATCH',
    });
  },
};

// Check if user is on dashboard or login page
const isDashboard = window.location.pathname.includes('dashboard.html');

// Authentication check
async function checkAuth() {
  try {
    const data = await api.getMe();
    if (data.user) {
      if (!isDashboard) {
        // Redirect to dashboard if logged in
        window.location.href = 'dashboard.html';
      }
      return data.user;
    }
  } catch (error) {
    if (isDashboard) {
      // Redirect to login if not authenticated
      window.location.href = 'index.html';
    }
  }
  return null;
}

// Initialize based on page
if (isDashboard) {
  initDashboard();
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
let currentListId = null;

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

  // Modal handlers
  const modal = document.getElementById('listModal');
  const closeModal = document.getElementById('closeModal');

  closeModal?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // Add item form
  const addItemForm = document.getElementById('addItemForm');
  addItemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('addItemError');
    errorDiv.textContent = '';

    const itemText = document.getElementById('itemText').value;

    try {
      await api.addItem(currentListId, itemText);
      document.getElementById('itemText').value = '';
      loadBucketList(currentListId);
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

    // Add click handlers
    container.querySelectorAll('.bucket-list-card').forEach(card => {
      card.addEventListener('click', () => {
        const listId = parseInt(card.dataset.id);
        openBucketList(listId);
      });
    });
  } catch (error) {
    console.error('Error loading bucket lists:', error);
  }
}

async function openBucketList(listId) {
  currentListId = listId;
  const modal = document.getElementById('listModal');

  try {
    const data = await api.getBucketList(listId);

    // Set modal title
    document.getElementById('listModalTitle').textContent = escapeHtml(data.bucketList.name);

    // Set share code
    document.getElementById('shareCodeDisplay').textContent = data.bucketList.share_code;

    // Set members
    const membersText = data.members.map(m => escapeHtml(m.username)).join(', ');
    document.getElementById('membersDisplay').textContent = membersText || 'None';

    // Load items
    loadItems(data.items);

    // Show modal
    modal.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading bucket list:', error);
    alert('Failed to load bucket list: ' + error.message);
  }
}

async function loadBucketList(listId) {
  try {
    const data = await api.getBucketList(listId);
    loadItems(data.items);

    // Update members
    const membersText = data.members.map(m => escapeHtml(m.username)).join(', ');
    document.getElementById('membersDisplay').textContent = membersText || 'None';
  } catch (error) {
    console.error('Error reloading bucket list:', error);
  }
}

function loadItems(items) {
  const container = document.getElementById('itemsContainer');

  if (!items || items.length === 0) {
    container.innerHTML = '<p class="empty-message">No items yet. Add one above!</p>';
    return;
  }

  container.innerHTML = items.map(item => {
    const checkedClass = item.is_checked ? 'checked' : '';
    const checkedByText = item.is_checked && item.checked_by_username
      ? ` (checked by ${escapeHtml(item.checked_by_username)})`
      : '';

    return `
      <div class="item ${checkedClass}">
        <input 
          type="checkbox" 
          ${item.is_checked ? 'checked' : ''} 
          data-item-id="${item.id}"
        >
        <span class="item-text">${escapeHtml(item.text)}</span>
        ${item.is_checked ? `<span class="item-checked-by">${checkedByText}</span>` : ''}
      </div>
    `;
  }).join('');

  // Add checkbox handlers
  container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const itemId = parseInt(e.target.dataset.itemId);
      try {
        await api.toggleItem(itemId);
        loadBucketList(currentListId);
      } catch (error) {
        console.error('Error toggling item:', error);
        // Revert checkbox state
        e.target.checked = !e.target.checked;
        alert('Failed to toggle item: ' + error.message);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

