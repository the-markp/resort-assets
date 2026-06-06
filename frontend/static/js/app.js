/* ============================================
   G-TRACKER RESORT ASSET MANAGEMENT — APP.JS
============================================ */

const API = '/api';

const CATEGORY_META = {
  rooms_facilities:      { label: 'Rooms & Facilities',      icon: '🏨', color: '#C9A96E' },
  furniture_equipment:   { label: 'Furniture & Equipment',   icon: '🪑', color: '#7B9E87' },
  vehicles_transport:    { label: 'Vehicles & Transport',    icon: '🚗', color: '#6E8EAD' },
  it_electronics:        { label: 'IT & Electronics',        icon: '💻', color: '#9B7DB5' },
  maintenance_tools:     { label: 'Maintenance Tools',       icon: '🔧', color: '#C47F5A' },
  inventory_consumables: { label: 'Inventory & Consumables', icon: '📦', color: '#A0B894' },
};

const STATUS_META = {
  available:   { label: 'Available',         color: '#7eb894', bg: '#1a2e22', border: '#2a4a36' },
  in_use:      { label: 'In Use',            color: '#7aade8', bg: '#1a2540', border: '#1e3558' },
  maintenance: { label: 'Under Maintenance', color: '#e8b47a', bg: '#2e2010', border: '#4a3518' },
  retired:     { label: 'Retired',           color: '#9090a0', bg: '#202028', border: '#303038' },
  lost:        { label: 'Lost',              color: '#e87a7a', bg: '#2e1010', border: '#4a1818' },
};

const DEPRECIATION_LABELS = {
  straight_line:     'Straight Line',
  declining_balance: 'Declining Balance',
  none:              'None',
};

// ─── AUTH STATE ───────────────────────────────────────────────────────────────
let auth = { token: null, user: null };

function saveAuth(token, user) {
  auth = { token, user };
  sessionStorage.setItem('gt_token', token);
  sessionStorage.setItem('gt_user',  JSON.stringify(user));
}
function loadAuth() {
  const t = sessionStorage.getItem('gt_token');
  const u = sessionStorage.getItem('gt_user');
  if (t && u) { auth = { token: t, user: JSON.parse(u) }; return true; }
  return false;
}
function clearAuth() {
  auth = { token: null, user: null };
  sessionStorage.removeItem('gt_token');
  sessionStorage.removeItem('gt_user');
}
function isAdmin()  { return auth.user?.role === 'admin'; }
function canEdit()  { return auth.user?.role === 'admin' || auth.user?.role === 'editor'; }

// ─── APP STATE ────────────────────────────────────────────────────────────────
let state = {
  currentView: 'dashboard',
  currentCategory: null,
  filterStatus: '',
  filterCategory: '',
  searchQuery: '',
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindLogin();
  if (loadAuth()) {
    showApp();
  } else {
    showLogin();
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginUsername').focus();
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  applyRoleVisibility();
  bindApp();
  showView('dashboard');
}

function applyRoleVisibility() {
  // Admin-only nav items
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin() ? '' : 'none';
  });
  // Editor-only buttons
  document.querySelectorAll('.editor-only').forEach(el => {
    el.style.display = canEdit() ? '' : 'none';
  });
  // Sidebar user display
  document.getElementById('cuName').textContent  = auth.user?.full_name || auth.user?.username || '—';
  document.getElementById('cuRole').textContent  = auth.user?.role || '—';
}

function bindLogin() {
  const btn  = document.getElementById('loginBtn');
  const pwEl = document.getElementById('loginPassword');

  btn.addEventListener('click', doLogin);
  pwEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('loginUsername').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginPassword').focus();
  });
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if (!username || !password) {
    showLoginError('Please enter username and password.');
    return;
  }
  btn.textContent = 'Signing in…';
  btn.disabled    = true;
  errEl.classList.add('hidden');

  try {
    const body = new URLSearchParams({ username, password });
    const res  = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Login failed');
    }
    const data = await res.json();
    saveAuth(data.access_token, data.user);
    showApp();
  } catch (err) {
    showLoginError(err.message);
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled    = false;
  }
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function doLogout() {
  clearAuth();
  state = { currentView: 'dashboard', currentCategory: null, filterStatus: '', filterCategory: '', searchQuery: '' };
  showLogin();
}

// ─── APP BINDINGS ─────────────────────────────────────────────────────────────
function bindApp() {
  document.getElementById('logoutBtn').addEventListener('click', doLogout);
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('addAssetBtn').addEventListener('click', () => openAddModal());
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  let searchTimer;
  document.getElementById('globalSearch').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      if (state.currentView === 'assets') renderAssetsView();
      else if (state.searchQuery) { state.filterCategory = ''; state.currentCategory = null; showView('assets'); }
    }, 300);
  });

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      const view = el.dataset.view;
      const cat  = el.dataset.category;
      if (view === 'dashboard') { state.currentCategory = null; state.filterCategory = ''; showView('dashboard'); }
      else if (view === 'assets')  { state.currentCategory = null; state.filterCategory = ''; showView('assets'); }
      else if (view === 'users')   { showView('users'); }
      else if (cat) { state.currentCategory = cat; state.filterCategory = cat; showView('assets'); }
      if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
    });
  });
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────
async function showView(name) {
  state.currentView = name;
  ['dashboard','assets','users'].forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== name);
  });
  const labels = { dashboard: 'Dashboard', assets: 'All Assets', users: 'User Management' };
  const catLabel = state.currentCategory ? CATEGORY_META[state.currentCategory]?.label : null;
  document.getElementById('breadcrumb').textContent = catLabel || labels[name] || name;

  if (name === 'dashboard') await renderDashboard();
  else if (name === 'assets') await renderAssetsView();
  else if (name === 'users') await renderUsersView();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('view-dashboard');
  el.innerHTML = '<div class="loading">Loading dashboard</div>';
  let summary;
  try { summary = await api('/dashboard/summary'); }
  catch { el.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load dashboard.</p></div>`; return; }

  const { total_assets: total=0, total_value: totalVal=0, by_status: byStatus={}, by_category: byCat={}, recent_assets: recent=[] } = summary;

  el.innerHTML = `
    <div class="dashboard-header">
      <h1>Good ${getGreeting()}, <em>${esc(auth.user?.full_name || auth.user?.username || 'Manager')}</em></h1>
      <p>ASSET OVERVIEW · ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase()}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Assets</div><div class="stat-value">${total}</div><div class="stat-sub">Across all categories</div></div>
      <div class="stat-card"><div class="stat-label">Available</div><div class="stat-value" style="color:var(--status-available)">${byStatus.available||0}</div><div class="stat-sub">${total?Math.round((byStatus.available||0)/total*100):0}% of total</div></div>
      <div class="stat-card"><div class="stat-label">In Use</div><div class="stat-value" style="color:var(--status-in_use)">${byStatus.in_use||0}</div><div class="stat-sub">${total?Math.round((byStatus.in_use||0)/total*100):0}% of total</div></div>
      <div class="stat-card"><div class="stat-label">Total Value</div><div class="stat-value small">₱${formatNumber(totalVal)}</div><div class="stat-sub">Purchase value</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-title">Assets by Category</div>
        <div class="category-bars">
          ${Object.entries(CATEGORY_META).map(([key,meta]) => {
            const count = byCat[key]||0, pct = total ? Math.round(count/total*100) : 0;
            return `<div class="cat-bar-item">
              <div class="cat-bar-header"><span class="cat-bar-name">${meta.icon} ${meta.label}</span><span class="cat-bar-count">${count}</span></div>
              <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${meta.color}88,${meta.color})"></div></div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="panel">
          <div class="panel-title">Status Breakdown</div>
          <div class="status-pills">
            ${Object.entries(STATUS_META).map(([key,meta]) => `
              <div class="status-pill" style="background:${meta.bg};border-color:${meta.border}">
                <span class="pill-dot" style="background:${meta.color}"></span>
                <span class="pill-label">${meta.label}</span>
                <span class="pill-count" style="color:${meta.color}">${byStatus[key]||0}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Recently Added</div>
          <div class="recent-list">
            ${recent.length === 0
              ? `<div style="color:var(--text-muted);font-size:13px">No assets yet.</div>`
              : recent.map(a => {
                  const cat = CATEGORY_META[a.category]||{icon:'◻',label:a.category};
                  return `<div class="recent-item" onclick="openDetailModal('${a.asset_id}')">
                    <span class="recent-icon">${cat.icon}</span>
                    <div class="recent-info">
                      <div class="recent-name">${esc(a.name)}</div>
                      <div class="recent-meta">${cat.label} · ${esc(a.accountable_department||a.location||'—')}</div>
                    </div>
                    ${statusBadge(a.status)}
                  </div>`;
                }).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

// ─── ASSETS VIEW ──────────────────────────────────────────────────────────────
async function renderAssetsView() {
  const el = document.getElementById('view-assets');
  el.innerHTML = '<div class="loading">Loading assets</div>';
  const params = new URLSearchParams();
  if (state.filterCategory) params.set('category', state.filterCategory);
  if (state.filterStatus)   params.set('status',   state.filterStatus);
  if (state.searchQuery)    params.set('search',   state.searchQuery);
  let assets;
  try { assets = await api(`/assets?${params}`); }
  catch { el.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load assets.</p></div>`; return; }

  const catLabel = state.currentCategory ? CATEGORY_META[state.currentCategory]?.label||'Assets' : 'All Assets';

  el.innerHTML = `
    <div class="assets-header">
      <h2>${catLabel}</h2>
      <div class="assets-filters">
        <select class="filter-select" id="filterStatus" onchange="onFilterChange()">
          <option value="">All Statuses</option>
          ${Object.entries(STATUS_META).map(([k,v])=>`<option value="${k}" ${state.filterStatus===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
        ${!state.currentCategory ? `
        <select class="filter-select" id="filterCategory" onchange="onFilterChange()">
          <option value="">All Categories</option>
          ${Object.entries(CATEGORY_META).map(([k,v])=>`<option value="${k}" ${state.filterCategory===k?'selected':''}>${v.label}</option>`).join('')}
        </select>` : ''}
      </div>
    </div>
    <div class="table-wrap">
      ${assets.length === 0
        ? `<div class="empty-state"><span class="empty-icon">◻</span><p>No assets found.</p></div>`
        : `<table>
            <thead><tr>
              <th>Name</th><th>Category</th><th>Status</th><th>Department</th>
              <th>Accountable Person</th><th>Service Life</th><th>Value (₱)</th>
              ${canEdit() ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${assets.map(a => {
                const cat = CATEGORY_META[a.category]||{icon:'◻',label:a.category};
                return `<tr onclick="openDetailModal('${a.asset_id}')">
                  <td class="asset-name">${cat.icon} ${esc(a.name)}</td>
                  <td>${cat.label}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>${esc(a.accountable_department||'—')}</td>
                  <td>${esc(a.accountable_person||'—')}</td>
                  <td>${a.service_life_years ? a.service_life_years + ' yr' : '—'}</td>
                  <td>${a.purchase_value ? '₱'+formatNumber(parseFloat(a.purchase_value)) : '—'}</td>
                  ${canEdit() ? `<td onclick="event.stopPropagation()">
                    <div class="table-actions">
                      <button class="btn-icon" title="Edit" onclick="openEditModal('${a.asset_id}')">✎</button>
                      <button class="btn-icon" title="Delete" onclick="confirmDelete('${a.asset_id}','${esc(a.name)}')">✕</button>
                    </div>
                  </td>` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
    </div>`;
}

function onFilterChange() {
  const s = document.getElementById('filterStatus');
  const c = document.getElementById('filterCategory');
  if (s) state.filterStatus   = s.value;
  if (c) state.filterCategory = c.value;
  renderAssetsView();
}

// ─── USERS VIEW ───────────────────────────────────────────────────────────────
async function renderUsersView() {
  if (!isAdmin()) { document.getElementById('view-users').innerHTML = `<div class="empty-state"><span class="empty-icon">🔒</span><p>Admin access required.</p></div>`; return; }
  const el = document.getElementById('view-users');
  el.innerHTML = '<div class="loading">Loading users</div>';
  let users;
  try { users = await api('/users'); }
  catch { el.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load users.</p></div>`; return; }

  el.innerHTML = `
    <div class="assets-header">
      <h2>User Management</h2>
      <button class="btn-primary" onclick="openAddUserModal()">+ New User</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr class="${u.is_active?'':'user-inactive'}">
              <td class="asset-name">${esc(u.username)}</td>
              <td>${esc(u.full_name||'—')}</td>
              <td style="font-family:var(--font-mono);font-size:11px">${esc(u.email||'—')}</td>
              <td><span class="role-badge role-${u.role}">${u.role}</span></td>
              <td>${u.is_active ? '<span style="color:var(--status-available)">Active</span>' : '<span style="color:var(--text-muted)">Inactive</span>'}</td>
              <td><div class="table-actions">
                <button class="btn-icon" onclick="openEditUserModal('${u.user_id}')">✎</button>
                ${u.user_id !== auth.user?.user_id
                  ? `<button class="btn-icon" onclick="confirmDeleteUser('${u.user_id}','${esc(u.username)}')">✕</button>`
                  : '<span style="width:32px;display:inline-block"></span>'}
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────
function openModal(title, bodyHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML    = bodyHTML;
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ─── ASSET FORMS ──────────────────────────────────────────────────────────────
function assetForm(asset = null, prefillCat = null) {
  const v   = k => asset ? esc(asset[k]||'') : '';
  const cat = asset?.category || prefillCat || '';
  const st  = asset?.status   || 'available';
  const dep = asset?.depreciation_method || 'none';

  return `
    <div class="form-grid">
      <div class="form-group full">
        <label class="form-label">Asset Name *</label>
        <input class="form-input" id="f_name" value="${v('name')}" placeholder="e.g. Deluxe Room 101" />
      </div>
      <div class="form-group">
        <label class="form-label">Category *</label>
        <select class="form-select" id="f_category">
          <option value="">Select…</option>
          ${Object.entries(CATEGORY_META).map(([k,m])=>`<option value="${k}" ${cat===k?'selected':''}>${m.icon} ${m.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="f_status">
          ${Object.entries(STATUS_META).map(([k,m])=>`<option value="${k}" ${st===k?'selected':''}>${m.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Location</label>
        <input class="form-input" id="f_location" value="${v('location')}" placeholder="e.g. Building A, Floor 2" />
      </div>
      <div class="form-group">
        <label class="form-label">Serial Number</label>
        <input class="form-input" id="f_serial_number" value="${v('serial_number')}" placeholder="e.g. RM-101" />
      </div>
      <div class="form-group">
        <label class="form-label">Accountable Department</label>
        <input class="form-input" id="f_accountable_department" value="${v('accountable_department')}" placeholder="e.g. Rooms Division" />
      </div>
      <div class="form-group">
        <label class="form-label">Accountable Person</label>
        <input class="form-input" id="f_accountable_person" value="${v('accountable_person')}" placeholder="e.g. Maria Santos" />
      </div>
      <div class="form-group">
        <label class="form-label">Purchase Date</label>
        <input class="form-input" id="f_purchase_date" type="date" value="${v('purchase_date')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Purchase Value (₱)</label>
        <input class="form-input" id="f_purchase_value" type="number" value="${v('purchase_value')}" placeholder="0" />
      </div>
      <div class="form-group">
        <label class="form-label">Service Life (years)</label>
        <input class="form-input" id="f_service_life_years" type="number" min="1" value="${asset?.service_life_years||''}" placeholder="e.g. 10" />
      </div>
      <div class="form-group">
        <label class="form-label">Depreciation Method</label>
        <select class="form-select" id="f_depreciation_method">
          ${Object.entries(DEPRECIATION_LABELS).map(([k,l])=>`<option value="${k}" ${dep===k?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="f_notes">${v('notes')}</textarea>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="assetFormSubmit">${asset ? 'Save Changes' : 'Create Asset'}</button>
    </div>`;
}

function collectAssetForm() {
  return {
    name:                   document.getElementById('f_name')?.value.trim(),
    category:               document.getElementById('f_category')?.value,
    status:                 document.getElementById('f_status')?.value,
    location:               document.getElementById('f_location')?.value.trim()               || null,
    serial_number:          document.getElementById('f_serial_number')?.value.trim()          || null,
    accountable_department: document.getElementById('f_accountable_department')?.value.trim() || null,
    accountable_person:     document.getElementById('f_accountable_person')?.value.trim()     || null,
    purchase_date:          document.getElementById('f_purchase_date')?.value                 || null,
    purchase_value:         document.getElementById('f_purchase_value')?.value                || null,
    service_life_years:     document.getElementById('f_service_life_years')?.value
                              ? parseInt(document.getElementById('f_service_life_years').value) : null,
    depreciation_method:    document.getElementById('f_depreciation_method')?.value           || null,
    notes:                  document.getElementById('f_notes')?.value.trim()                  || null,
  };
}

function openAddModal() {
  openModal('New Asset', assetForm(null, state.currentCategory));
  document.getElementById('assetFormSubmit').addEventListener('click', async () => {
    const data = collectAssetForm();
    if (!data.name || !data.category) { showToast('Name and category are required.', 'error'); return; }
    try { await api('/assets', 'POST', data); closeModal(); showToast('Asset created.', 'success'); await (state.currentView==='assets' ? renderAssetsView() : renderDashboard()); }
    catch (e) { showToast(e.message||'Failed to create asset.', 'error'); }
  });
}

async function openEditModal(assetId) {
  const asset = await api(`/assets/${assetId}`);
  openModal('Edit Asset', assetForm(asset));
  document.getElementById('assetFormSubmit').addEventListener('click', async () => {
    const data = collectAssetForm();
    try { await api(`/assets/${assetId}`, 'PUT', data); closeModal(); showToast('Asset updated.', 'success'); await (state.currentView==='assets' ? renderAssetsView() : renderDashboard()); }
    catch (e) { showToast(e.message||'Failed to update asset.', 'error'); }
  });
}

async function openDetailModal(assetId) {
  let a;
  try { a = await api(`/assets/${assetId}`); } catch { showToast('Could not load asset.', 'error'); return; }
  const cat = CATEGORY_META[a.category]||{icon:'◻',label:a.category};
  openModal('Asset Details', `
    <div class="asset-detail">
      <div class="detail-header">
        <span class="detail-icon">${cat.icon}</span>
        <div class="detail-meta">
          <div class="detail-name">${esc(a.name)}</div>
          <div class="detail-id">${a.asset_id}</div>
          <div style="margin-top:8px">${statusBadge(a.status)}</div>
        </div>
        ${canEdit() ? `<div class="detail-actions">
          <button class="btn-secondary" onclick="closeModal();openEditModal('${a.asset_id}')">Edit</button>
          <button class="btn-danger" onclick="closeModal();confirmDelete('${a.asset_id}','${esc(a.name)}')">Delete</button>
        </div>` : ''}
      </div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-field-label">Category</div><div class="detail-field-value">${cat.label}</div></div>
        <div class="detail-field"><div class="detail-field-label">Location</div><div class="detail-field-value">${esc(a.location||'—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">Serial Number</div><div class="detail-field-value" style="font-family:var(--font-mono);font-size:12px">${esc(a.serial_number||'—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">Purchase Value</div><div class="detail-field-value">${a.purchase_value?'₱'+formatNumber(parseFloat(a.purchase_value)):'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Purchase Date</div><div class="detail-field-value">${a.purchase_date||'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Service Life</div><div class="detail-field-value">${a.service_life_years ? a.service_life_years+' years' : '—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Depreciation</div><div class="detail-field-value">${DEPRECIATION_LABELS[a.depreciation_method]||'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Accountable Department</div><div class="detail-field-value">${esc(a.accountable_department||'—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">Accountable Person</div><div class="detail-field-value">${esc(a.accountable_person||'—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">Last Updated</div><div class="detail-field-value" style="font-size:12px;color:var(--text-muted)">${a.updated_at?new Date(a.updated_at).toLocaleString():'—'}</div></div>
        ${a.notes ? `<div class="detail-field full" style="grid-column:1/-1"><div class="detail-field-label">Notes</div><div class="detail-notes">${esc(a.notes)}</div></div>` : ''}
      </div>
    </div>`);
}

function confirmDelete(assetId, name) {
  openModal('Delete Asset', `
    <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.7">
      Are you sure you want to delete <strong style="color:var(--text-primary)">${esc(name)}</strong>? This cannot be undone.
    </p>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" style="padding:9px 20px" onclick="deleteAsset('${assetId}')">Delete Asset</button>
    </div>`);
}

async function deleteAsset(assetId) {
  try { await api(`/assets/${assetId}`, 'DELETE'); closeModal(); showToast('Asset deleted.', 'info'); await (state.currentView==='assets' ? renderAssetsView() : renderDashboard()); }
  catch { showToast('Failed to delete asset.', 'error'); }
}

// ─── USER FORMS ───────────────────────────────────────────────────────────────
function userForm(user = null) {
  const v = k => user ? esc(user[k]||'') : '';
  return `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Username *</label>
        <input class="form-input" id="u_username" value="${v('username')}" placeholder="e.g. jreyes" ${user?'readonly':''} />
      </div>
      <div class="form-group">
        <label class="form-label">Role *</label>
        <select class="form-select" id="u_role">
          <option value="viewer" ${user?.role==='viewer'?'selected':''}>Viewer</option>
          <option value="editor" ${user?.role==='editor'?'selected':''}>Editor</option>
          <option value="admin"  ${user?.role==='admin' ?'selected':''}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input class="form-input" id="u_full_name" value="${v('full_name')}" placeholder="e.g. Jose Reyes" />
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="u_email" type="email" value="${v('email')}" placeholder="e.g. jose@resort.com" />
      </div>
      <div class="form-group">
        <label class="form-label">${user ? 'New Password (leave blank to keep)' : 'Password *'}</label>
        <input class="form-input" id="u_password" type="password" placeholder="${user?'Enter new password…':'Min. 6 characters'}" />
      </div>
      ${user ? `<div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="u_is_active">
          <option value="true"  ${user.is_active?'selected':''}>Active</option>
          <option value="false" ${!user.is_active?'selected':''}>Inactive</option>
        </select>
      </div>` : ''}
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="userFormSubmit">${user ? 'Save Changes' : 'Create User'}</button>
    </div>`;
}

function collectUserForm(isEdit = false) {
  const pw = document.getElementById('u_password')?.value;
  const data = {
    username:  document.getElementById('u_username')?.value.trim(),
    full_name: document.getElementById('u_full_name')?.value.trim() || null,
    email:     document.getElementById('u_email')?.value.trim()     || null,
    role:      document.getElementById('u_role')?.value,
  };
  if (pw) data.password = pw;
  if (!isEdit) { if (!pw) { showToast('Password is required.','error'); return null; } }
  else {
    const activeEl = document.getElementById('u_is_active');
    if (activeEl) data.is_active = activeEl.value === 'true';
  }
  return data;
}

function openAddUserModal() {
  openModal('New User', userForm());
  document.getElementById('userFormSubmit').addEventListener('click', async () => {
    const data = collectUserForm(false);
    if (!data) return;
    if (!data.username) { showToast('Username is required.','error'); return; }
    try { await api('/users', 'POST', data); closeModal(); showToast('User created.','success'); await renderUsersView(); }
    catch (e) { showToast(e.message||'Failed to create user.','error'); }
  });
}

async function openEditUserModal(userId) {
  let users;
  try { users = await api('/users'); } catch { showToast('Could not load user.','error'); return; }
  const user = users.find(u => u.user_id === userId);
  if (!user) return;
  openModal('Edit User', userForm(user));
  document.getElementById('userFormSubmit').addEventListener('click', async () => {
    const data = collectUserForm(true);
    if (!data) return;
    try { await api(`/users/${userId}`, 'PUT', data); closeModal(); showToast('User updated.','success'); await renderUsersView(); }
    catch (e) { showToast(e.message||'Failed to update user.','error'); }
  });
}

function confirmDeleteUser(userId, username) {
  openModal('Delete User', `
    <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.7">
      Delete user <strong style="color:var(--text-primary)">${esc(username)}</strong>? This cannot be undone.
    </p>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" style="padding:9px 20px" onclick="deleteUser('${userId}')">Delete User</button>
    </div>`);
}

async function deleteUser(userId) {
  try { await api(`/users/${userId}`, 'DELETE'); closeModal(); showToast('User deleted.','info'); await renderUsersView(); }
  catch (e) { showToast(e.message||'Failed to delete user.','error'); }
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (res.status === 401) { clearAuth(); showLogin(); throw new Error('Session expired'); }
  if (method === 'DELETE' && res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'API error');
  return data;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function statusBadge(status) {
  const m = STATUS_META[status]||{label:status,color:'#888',bg:'#222',border:'#333'};
  return `<span class="badge badge-${status}">${m.label}</span>`;
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatNumber(n) {
  if (isNaN(n)) return '0';
  return n.toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:0});
}
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = {success:'✓',error:'✕',info:'◈'};
  t.innerHTML = `<span style="color:${type==='success'?'var(--status-available)':type==='error'?'var(--status-lost)':'var(--gold)'}">${icons[type]||''}</span> ${esc(msg)}`;
  c.appendChild(t);
  setTimeout(()=>t.remove(), 4000);
}
