/* ============================================
   G-TRACKER v3.0 — APP.JS
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
  declining_balance: 'Declining Balance (2×)',
  custom_rate:       'Custom Rate',
  none:              'None',
};

const SEVERITY_META = {
  low:      { label: 'Low',      cls: 'sev-low'      },
  medium:   { label: 'Medium',   cls: 'sev-medium'   },
  high:     { label: 'High',     cls: 'sev-high'     },
  critical: { label: 'Critical', cls: 'sev-critical' },
};

const INC_STATUS_META = {
  open:        { label: 'Open',        cls: 'inc-open'        },
  in_progress: { label: 'In Progress', cls: 'inc-in_progress' },
  resolved:    { label: 'Resolved',    cls: 'inc-resolved'    },
  closed:      { label: 'Closed',      cls: 'inc-closed'      },
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────
let auth = { token: null, user: null };
function saveAuth(t, u) { auth={token:t,user:u}; sessionStorage.setItem('gt_token',t); sessionStorage.setItem('gt_user',JSON.stringify(u)); }
function loadAuth()     { const t=sessionStorage.getItem('gt_token'),u=sessionStorage.getItem('gt_user'); if(t&&u){auth={token:t,user:JSON.parse(u)};return true;}return false; }
function clearAuth()    { auth={token:null,user:null}; sessionStorage.removeItem('gt_token'); sessionStorage.removeItem('gt_user'); }
function isAdmin()      { return auth.user?.role==='admin'; }
function canEdit()      { return ['admin','editor'].includes(auth.user?.role); }

// ─── STATE ────────────────────────────────────────────────────────────────────
let state = {
  currentView: 'dashboard', currentCategory: null,
  filterStatus: '', filterCategory: '', searchQuery: '',
  filterMyAssets: false,
  colFilters: {
    asset_number: '', name: '', location: '',
    serial_number: '', accountable_department: '', accountable_person: '',
  },
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindLogin();
  if (loadAuth()) showApp();
  else showLogin();
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  loadLogoToLogin();
}
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  applyRoleVisibility();
  bindApp();
  loadLogo();
  refreshIncidentBadge();
  showView('dashboard');
}
function applyRoleVisibility() {
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin()?'':'none');
  document.querySelectorAll('.editor-only').forEach(el => el.style.display = canEdit()?'':'none');
  document.getElementById('cuName').textContent = auth.user?.full_name||auth.user?.username||'—';
  // Use cuRole span only — don't overwrite the whole div which contains the "change password" hint
  const cuRoleSpan = document.getElementById('cuRole');
  if (cuRoleSpan) cuRoleSpan.textContent = auth.user?.role||'—';
}
function bindLogin() {
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('loginPassword').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('loginUsername').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('loginPassword').focus(); });
}
async function doLogin() {
  const username=document.getElementById('loginUsername').value.trim();
  const password=document.getElementById('loginPassword').value;
  const btn=document.getElementById('loginBtn');
  if(!username||!password){showLoginError('Please enter username and password.');return;}
  btn.textContent='Signing in…'; btn.disabled=true;
  document.getElementById('loginError').classList.add('hidden');
  try {
    const res = await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})});
    if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.detail||'Login failed');}
    const data=await res.json();
    saveAuth(data.access_token,data.user);
    showApp();
  } catch(err){showLoginError(err.message);}
  finally{btn.textContent='Sign In';btn.disabled=false;}
}
function showLoginError(msg){const el=document.getElementById('loginError');el.textContent=msg;el.classList.remove('hidden');}
function doLogout(){clearAuth();state={currentView:'dashboard',currentCategory:null,filterStatus:'',filterCategory:'',searchQuery:''};showLogin();}

// ─── LOGO ─────────────────────────────────────────────────────────────────────
async function loadLogo() {
  try {
    const settings = await api('/settings');
    if (settings.logo_path) renderLogo(settings.logo_path);
  } catch {}
}
async function loadLogoToLogin() {
  try {
    const res = await fetch(`${API}/settings`,{headers:{'Authorization':`Bearer ${auth.token||''}`}});
    if(!res.ok) return;
    const s = await res.json();
    if (s.logo_path) {
      const wrap = document.getElementById('loginLogoWrap');
      if(wrap) { wrap.innerHTML=`<img src="${s.logo_path}?t=${Date.now()}" alt="Logo" />`; }
    }
  } catch {}
}
function renderLogo(url) {
  const wrap = document.getElementById('sidebarLogoWrap');
  if (!wrap) return;
  const existing = wrap.querySelector('img');
  if (existing) existing.remove();
  const img = document.createElement('img');
  img.src = url + '?t=' + Date.now();
  img.alt = 'Logo';
  wrap.insertBefore(img, wrap.firstChild);
}
function bindLogoUpload() {
  const input = document.getElementById('logoUploadInput');
  if (!input) return;
  input.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/settings/logo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.token}` },
        body: formData,
      });
      if (!res.ok) { const d=await res.json(); throw new Error(d.detail||'Upload failed'); }
      const data = await res.json();
      renderLogo(data.logo_url);
      showToast('Logo updated.', 'success');
    } catch(err) { showToast(err.message, 'error'); }
    input.value = '';
  });
}

// ─── APP BINDINGS ─────────────────────────────────────────────────────────────
function bindApp() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
  document.getElementById('sidebarToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('addAssetBtn').addEventListener('click', () => openAddModal());
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===document.getElementById('modalOverlay')) closeModal(); });
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

  let searchTimer;
  document.getElementById('globalSearch').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      if (state.currentView==='assets') renderAssetsView();
      else if (state.searchQuery) { state.filterCategory=''; state.currentCategory=null; showView('assets'); }
    }, 300);
  });

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      const view=el.dataset.view, cat=el.dataset.category;
      if (view==='dashboard')      { state.currentCategory=null; state.filterCategory=''; showView('dashboard'); }
      else if (view==='assets')    { state.currentCategory=null; state.filterCategory=''; showView('assets'); }
      else if (view==='incidents') { showView('incidents'); }
      else if (view==='users')     { showView('users'); }
      else if (view==='documents') { showView('documents'); }
      else if (cat) { state.currentCategory=cat; state.filterCategory=cat; showView('assets'); }
      if(window.innerWidth<900) document.getElementById('sidebar').classList.remove('open');
    });
  });

  bindLogoUpload();
}

// ─── INCIDENT BADGE ───────────────────────────────────────────────────────────
async function refreshIncidentBadge() {
  try {
    const incidents = await api('/incidents?status=open');
    const badge = document.getElementById('openIncidentsBadge');
    if (!badge) return;
    const count = incidents.length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  } catch {}
}

// ─── VIEW ROUTING ─────────────────────────────────────────────────────────────
async function showView(name) {
  state.currentView = name;
  ['dashboard','assets','incidents','users','documents'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  const labels = {dashboard:'Dashboard',assets:'All Assets',incidents:'Incident Reports',users:'User Management',documents:'Policy Documents'};
  document.getElementById('breadcrumb').textContent = (state.currentCategory ? CATEGORY_META[state.currentCategory]?.label : null) || labels[name] || name;
  try {
    if      (name==='dashboard') await renderDashboard();
    else if (name==='assets')    await renderAssetsView();
    else if (name==='incidents') await renderIncidentsView();
    else if (name==='users')     await renderUsersView();
    else if (name==='documents') await renderDocumentsView();
  } catch(err) {
    console.error(`showView(${name}) error:`, err);
  }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('view-dashboard');
  el.innerHTML = '<div class="loading">Loading dashboard</div>';
  let summary;
  try { summary = await api('/dashboard/summary'); }
  catch { el.innerHTML=`<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load dashboard.</p></div>`; return; }
  const {total_assets:total=0,total_value:totalVal=0,total_book_value:totalBV=0,by_status:byStatus={},by_category:byCat={},by_department:byDept=[],recent_assets:recent=[]} = summary;
  el.innerHTML = `
    <div class="dashboard-header">
      <h1>Good ${getGreeting()}, <em>${esc(auth.user?.full_name||auth.user?.username||'Manager')}</em></h1>
      <p>ASSET OVERVIEW · ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase()}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Assets</div><div class="stat-value">${total}</div><div class="stat-sub">Across all categories</div></div>
      <div class="stat-card"><div class="stat-label">Available</div><div class="stat-value" style="color:var(--status-available)">${byStatus.available||0}</div><div class="stat-sub">${total?Math.round((byStatus.available||0)/total*100):0}% of total</div></div>
      <div class="stat-card"><div class="stat-label">Purchase Value</div><div class="stat-value small">₱${formatNumber(totalVal)}</div><div class="stat-sub">Total cost basis</div></div>
      <div class="stat-card"><div class="stat-label">Book Value</div><div class="stat-value small" style="color:var(--gold-light)">₱${formatNumber(totalBV)}</div><div class="stat-sub">Depreciated value</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-title">Assets by Category</div>
        <div class="category-bars">
          ${Object.entries(CATEGORY_META).map(([key,meta])=>{
            const count=byCat[key]||0,pct=total?Math.round(count/total*100):0;
            return `<div class="cat-bar-item"><div class="cat-bar-header"><span class="cat-bar-name">${meta.icon} ${meta.label}</span><span class="cat-bar-count">${count}</span></div><div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${meta.color}88,${meta.color})"></div></div></div>`;
          }).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="panel">
          <div class="panel-title">Status Breakdown</div>
          <div class="status-pills">
            ${Object.entries(STATUS_META).map(([key,meta])=>`
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
            ${recent.length===0?`<div style="color:var(--text-muted);font-size:13px">No assets yet.</div>`:recent.map(a=>{
              const cat=CATEGORY_META[a.category]||{icon:'◻',label:a.category};
              return `<div class="recent-item" onclick="openDetailModal('${a.asset_id}')">
                <span class="recent-icon">${cat.icon}</span>
                <div class="recent-info"><div class="recent-name">${esc(a.name)}</div><div class="recent-meta">${cat.label} · ${esc(a.accountable_department||a.location||'—')}</div></div>
                ${statusBadge(a.status)}</div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="panel-title">Assets by Department</div>
      ${byDept.length===0?`<div style="color:var(--text-muted);font-size:13px">No department data yet.</div>`:`
      <table class="dept-table"><thead><tr><th>Department</th><th style="text-align:right">Assets</th><th style="text-align:right">Purchase Value</th><th style="text-align:right">Book Value</th></tr></thead>
      <tbody>${byDept.map(d=>`<tr><td class="dept-name">${esc(d.department)}</td><td class="dept-num">${d.count}</td><td class="dept-num">₱${formatNumber(d.purchase_value)}</td><td class="dept-num" style="color:var(--gold-light)">₱${formatNumber(d.book_value)}</td></tr>`).join('')}</tbody></table>
      <div class="book-value-note" style="margin-top:12px">BOOK VALUE — COMPUTED BASED ON DEPRECIATION METHOD, AGE, AND REPAIR COSTS</div>`}
    </div>`;
}

// ─── ASSETS VIEW ──────────────────────────────────────────────────────────────
async function renderAssetsView() {
  const el = document.getElementById('view-assets');
  el.innerHTML = '<div class="loading">Loading assets</div>';
  const params = buildAssetParams();
  let assets;
  try { assets = await api(`/assets/?${params}`); }
  catch { el.innerHTML=`<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load assets.</p></div>`; return; }
  const catLabel = state.currentCategory ? CATEGORY_META[state.currentCategory]?.label||'Assets' : 'All Assets';

  el.innerHTML = `
    <div class="assets-header">
      <h2>${catLabel}</h2>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn-secondary" id="exportCsvBtn" onclick="exportCSV()">⬇ Export CSV</button>
        <button class="btn-my-assets" id="myAssetsBtn" onclick="toggleMyAssets()" title="Show only assets assigned to me">👤 My Assets</button>
        <div class="assets-filters">
          <select class="filter-select" id="filterStatus" onchange="onFilterChange()">
            <option value="">All Statuses</option>
            ${Object.entries(STATUS_META).map(([k,v])=>`<option value="${k}" ${state.filterStatus===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
          ${!state.currentCategory?`<select class="filter-select" id="filterCategory" onchange="onFilterChange()"><option value="">All Categories</option>${Object.entries(CATEGORY_META).map(([k,v])=>`<option value="${k}" ${state.filterCategory===k?'selected':''}>${v.label}</option>`).join('')}</select>`:''}
          <button class="btn-secondary" onclick="clearAllFilters()" title="Clear all filters" style="padding:7px 12px">✕ Clear</button>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset No.</th><th>Name</th><th>Category</th><th>Status</th>
            <th>Location</th><th>Serial No.</th><th>Department</th>
            <th>Responsible Person</th><th>Confirmed</th><th>Purchase Value</th>
            <th>Repair Cost</th><th>Book Value</th>
            ${canEdit()?'<th></th>':''}
          </tr>
          <tr class="filter-row" id="filterRow">
            <th><input class="col-filter" id="cf_asset_number" placeholder="Filter…" oninput="onColFilterChange()" value="${esc(state.colFilters.asset_number||'')}" /></th>
            <th><input class="col-filter" id="cf_name" placeholder="Filter…" oninput="onColFilterChange()" value="${esc(state.colFilters.name||'')}" /></th>
            <th></th>
            <th></th>
            <th><input class="col-filter" id="cf_location" placeholder="Filter…" oninput="onColFilterChange()" value="${esc(state.colFilters.location||'')}" /></th>
            <th><input class="col-filter" id="cf_serial_number" placeholder="Filter…" oninput="onColFilterChange()" value="${esc(state.colFilters.serial_number||'')}" /></th>
            <th><input class="col-filter" id="cf_accountable_department" placeholder="Filter…" oninput="onColFilterChange()" value="${esc(state.colFilters.accountable_department||'')}" /></th>
            <th><input class="col-filter" id="cf_accountable_person" placeholder="Filter…" oninput="onColFilterChange()" value="${esc(state.colFilters.accountable_person||'')}" /></th>
            <th></th><th></th><th></th>
            ${canEdit()?'<th></th>':''}
          </tr>
        </thead>
        <tbody>
          ${assets.length===0
            ? `<tr><td colspan="${canEdit()?14:13}" style="text-align:center;padding:48px;color:var(--text-muted)">No assets match your filters.</td></tr>`
            : assets.map(a => {
                const cat = CATEGORY_META[a.category]||{icon:'◻',label:a.category};
                return `<tr onclick="openDetailModal('${a.asset_id}')">
                  <td style="font-family:var(--font-mono);font-size:11px;color:var(--gold-light)">${esc(a.asset_number||'—')}</td>
                  <td class="asset-name">${cat.icon} ${esc(a.name)}</td>
                  <td>${cat.label}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>${esc(a.location||'—')}</td>
                  <td style="font-family:var(--font-mono);font-size:11px">${esc(a.serial_number||'—')}</td>
                  <td>${esc(a.accountable_department||'—')}</td>
                  <td>${esc(a.responsible_user_name||a.accountable_person||'—')}</td>
                  <td>${confirmedBadge(a.confirmed, a.responsible_user_id)}</td>
                  <td>${a.purchase_value?'₱'+formatNumber(parseFloat(a.purchase_value)):'—'}</td>
                  <td style="color:var(--status-lost)">${a.repair_cost?'₱'+formatNumber(a.repair_cost):'—'}</td>
                  <td style="color:var(--gold-light)">${a.book_value!=null?'₱'+formatNumber(a.book_value):'—'}</td>
                  ${canEdit()?`<td onclick="event.stopPropagation()"><div class="table-actions">
                    <button class="btn-icon" title="Edit" onclick="openEditModal('${a.asset_id}')">✎</button>
                    <button class="btn-icon" title="Delete" onclick="confirmDelete('${a.asset_id}','${esc(a.name)}')">✕</button>
                  </div></td>`:''}
                </tr>`;
              }).join('')
          }
        </tbody>
      </table>
    </div>`;
}

function onFilterChange() {
  const s = document.getElementById('filterStatus');
  const c = document.getElementById('filterCategory');
  if (s) state.filterStatus   = s.value;
  if (c) state.filterCategory = c.value;
  renderAssetsView();
}

let _colFilterTimer;
function onColFilterChange() {
  clearTimeout(_colFilterTimer);
  _colFilterTimer = setTimeout(() => {
    const fields = ['asset_number','name','location','serial_number','accountable_department','accountable_person'];
    fields.forEach(f => {
      const el = document.getElementById(`cf_${f}`);
      if (el) state.colFilters[f] = el.value.trim();
    });
    renderAssetsView();
  }, 300);
}

function clearAllFilters() {
  state.filterStatus   = '';
  state.filterCategory = '';
  state.searchQuery    = '';
  state.filterMyAssets = false;
  const myBtn = document.getElementById('myAssetsBtn'); if(myBtn) myBtn.classList.remove('active');
  document.getElementById('globalSearch').value = '';
  Object.keys(state.colFilters).forEach(k => state.colFilters[k] = '');
  renderAssetsView();
}

function buildAssetParams() {
  const p = new URLSearchParams();
  if (state.filterCategory)  p.set('category',            state.filterCategory);
  if (state.filterStatus)    p.set('status',              state.filterStatus);
  if (state.searchQuery)     p.set('search',              state.searchQuery);
  if (state.filterMyAssets)  p.set('responsible_user_id', auth.user?.user_id || '');
  Object.entries(state.colFilters).forEach(([k, v]) => { if (v) p.set(k, v); });
  return p;
}

function toggleMyAssets() {
  state.filterMyAssets = !state.filterMyAssets;
  const btn = document.getElementById('myAssetsBtn');
  if (btn) btn.classList.toggle('active', state.filterMyAssets);
  renderAssetsView();
}

// ─── INCIDENTS VIEW ───────────────────────────────────────────────────────────
async function renderIncidentsView() {
  const el = document.getElementById('view-incidents');
  el.innerHTML = '<div class="loading">Loading incidents</div>';
  let incidents;
  try { incidents = await api('/incidents'); }
  catch { el.innerHTML=`<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load incidents.</p></div>`; return; }

  // Group by status
  const open=incidents.filter(i=>i.status==='open');
  const inprog=incidents.filter(i=>i.status==='in_progress');
  const resolved=incidents.filter(i=>['resolved','closed'].includes(i.status));

  el.innerHTML=`
    <div class="assets-header">
      <h2>Incident Reports</h2>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn-secondary" id="exportIncidentsBtn" onclick="exportIncidentsCSV()">⬇ Export CSV</button>
        <button class="btn-primary" onclick="openReportIncidentModal()">⚑ Report Incident</button>
      </div>
    </div>
    ${incidents.length===0?`<div class="empty-state"><span class="empty-icon">⚑</span><p>No incidents reported. Great!</p></div>`:`
    <div style="display:flex;flex-direction:column;gap:28px">
      ${open.length?`<div><div class="panel-title" style="margin-bottom:12px;font-family:var(--font-mono);font-size:10px;letter-spacing:.2em;color:var(--status-lost)">OPEN (${open.length})</div><div class="incident-grid">${open.map(incidentCard).join('')}</div></div>`:''}
      ${inprog.length?`<div><div class="panel-title" style="margin-bottom:12px;font-family:var(--font-mono);font-size:10px;letter-spacing:.2em;color:var(--status-maintenance)">IN PROGRESS (${inprog.length})</div><div class="incident-grid">${inprog.map(incidentCard).join('')}</div></div>`:''}
      ${resolved.length?`<div><div class="panel-title" style="margin-bottom:12px;font-family:var(--font-mono);font-size:10px;letter-spacing:.2em;color:var(--text-muted)">RESOLVED / CLOSED (${resolved.length})</div><div class="incident-grid">${resolved.map(incidentCard).join('')}</div></div>`:''}
    </div>`}`;
}

function incidentCard(inc) {
  const sev=SEVERITY_META[inc.severity]||{label:inc.severity,cls:'sev-medium'};
  const st=INC_STATUS_META[inc.status]||{label:inc.status,cls:'inc-open'};
  return `<div class="incident-card" onclick="openIncidentDetail('${inc.incident_id}')">
    <div class="incident-card-header">
      <div class="incident-card-title">${esc(inc.title)}</div>
      <span class="sev-badge ${sev.cls}">${sev.label}</span>
    </div>
    ${inc.asset_name?`<div class="incident-card-asset">📎 ${esc(inc.asset_name)}</div>`:''}
    <div class="incident-card-meta" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="inc-status-badge ${st.cls}">${st.label}</span>
      <span>by ${esc(inc.reporter_name||'Unknown')}</span>
      <span>· ${timeAgo(inc.created_at)}</span>
      ${inc.comments.length?`<span>· 💬 ${inc.comments.length}</span>`:''}
    </div>
  </div>`;
}

async function openIncidentDetail(incidentId) {
  let inc;
  try { inc=await api(`/incidents/${incidentId}`); } catch { showToast('Could not load incident.','error'); return; }
  const sev=SEVERITY_META[inc.severity]||{label:inc.severity,cls:'sev-medium'};
  const st=INC_STATUS_META[inc.status]||{label:inc.status,cls:'inc-open'};

  const editorControls = canEdit() ? `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <div class="form-grid" style="margin-bottom:12px">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="incStatus">
            ${Object.entries(INC_STATUS_META).map(([k,v])=>`<option value="${k}" ${inc.status===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Severity</label>
          <select class="form-select" id="incSeverity">
            ${Object.entries(SEVERITY_META).map(([k,v])=>`<option value="${k}" ${inc.severity===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group full">
          <label class="form-label">Resolution Note</label>
          <textarea class="form-textarea" id="incResolution" placeholder="Describe the action taken…">${esc(inc.resolution||'')}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-primary" onclick="updateIncident('${inc.incident_id}')">Save Changes</button>
        ${inc.status!=='closed'?`<button class="btn-secondary" onclick="closeIncident('${inc.incident_id}')">✓ Close Ticket</button>`:''}
        ${isAdmin()?`<button class="btn-danger" style="margin-left:auto" onclick="confirmDeleteIncident('${inc.incident_id}','${esc(inc.title)}')">Delete</button>`:''}
      </div>
    </div>` : '';

  openModal('Incident Detail', `
    <div class="incident-detail">
      <div class="inc-detail-header">
        <div class="inc-detail-meta">
          <div class="inc-detail-title">${esc(inc.title)}</div>
          <div class="inc-detail-badges">
            <span class="sev-badge ${sev.cls}">${sev.label}</span>
            <span class="inc-status-badge ${st.cls}">${st.label}</span>
            ${inc.asset_name?`<span style="font-size:12px;color:var(--gold-muted)">📎 ${esc(inc.asset_name)}</span>`:''}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-family:var(--font-mono)">
            Reported by ${esc(inc.reporter_name||'Unknown')} · ${timeAgo(inc.created_at)}
          </div>
        </div>
      </div>
      <div class="detail-notes" style="margin-bottom:16px">${esc(inc.description)}</div>
      ${inc.resolution?`<div style="margin-bottom:16px"><div class="detail-field-label" style="font-family:var(--font-mono);font-size:9px;letter-spacing:.15em;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Resolution</div><div class="detail-notes">${esc(inc.resolution)}</div></div>`:''}
      ${editorControls}
      <div class="comments-section">
        <div class="comments-title">Comments (${inc.comments.length})</div>
        <div class="comment-list" id="commentList">
          ${inc.comments.length===0?`<div style="color:var(--text-muted);font-size:13px">No comments yet.</div>`:
            inc.comments.map(c=>`
              <div class="comment-item">
                <div><span class="comment-author">${esc(c.author_name||'User')}</span><span class="comment-time">${timeAgo(c.created_at)}</span></div>
                <div class="comment-body">${esc(c.body)}</div>
              </div>`).join('')}
        </div>
        <div class="comment-input-wrap">
          <textarea class="form-textarea" id="newComment" placeholder="Add a comment…" style="min-height:52px"></textarea>
          <button class="btn-primary" style="align-self:flex-end" onclick="submitComment('${inc.incident_id}')">Post</button>
        </div>
      </div>
    </div>`);
}

async function updateIncident(id) {
  const payload = {
    status:     document.getElementById('incStatus')?.value,
    severity:   document.getElementById('incSeverity')?.value,
    resolution: document.getElementById('incResolution')?.value.trim()||null,
  };
  try {
    await api(`/incidents/${id}`,'PUT',payload);
    closeModal();
    showToast('Incident updated.','success');
    await renderIncidentsView();
    refreshIncidentBadge();
  } catch(e) { showToast(e.message||'Failed to update.','error'); }
}

async function closeIncident(id) {
  try {
    await api(`/incidents/${id}`,'PUT',{status:'closed'});
    closeModal();
    showToast('Ticket closed.','success');
    await renderIncidentsView();
    refreshIncidentBadge();
  } catch(e) { showToast(e.message,'error'); }
}

async function submitComment(incidentId) {
  const body = document.getElementById('newComment')?.value.trim();
  if (!body) return;
  try {
    await api(`/incidents/${incidentId}/comments`,'POST',{body});
    showToast('Comment posted.','success');
    await openIncidentDetail(incidentId);
  } catch(e) { showToast(e.message,'error'); }
}

function openReportIncidentModal() {
  openModal('Report Incident', `
    <div class="form-grid">
      <div class="form-group full">
        <label class="form-label">Title *</label>
        <input class="form-input" id="inc_title" placeholder="Brief description of the incident" />
      </div>
      <div class="form-group">
        <label class="form-label">Related Asset (optional)</label>
        <select class="form-select" id="inc_asset_id">
          <option value="">— None —</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Severity</label>
        <select class="form-select" id="inc_severity">
          ${Object.entries(SEVERITY_META).map(([k,v])=>`<option value="${k}" ${k==='medium'?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label class="form-label">Description *</label>
        <textarea class="form-textarea" id="inc_description" style="min-height:100px" placeholder="Describe what happened, when, and where…"></textarea>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="incSubmitBtn">Submit Report</button>
    </div>`);

  // Populate asset dropdown
  api('/assets').then(assets => {
    const sel = document.getElementById('inc_asset_id');
    if(!sel) return;
    assets.forEach(a => {
      const opt=document.createElement('option');
      opt.value=a.asset_id; opt.textContent=a.name;
      sel.appendChild(opt);
    });
  }).catch(()=>{});

  document.getElementById('incSubmitBtn').addEventListener('click', async () => {
    const title=document.getElementById('inc_title')?.value.trim();
    const desc=document.getElementById('inc_description')?.value.trim();
    const asset_id=document.getElementById('inc_asset_id')?.value||null;
    const severity=document.getElementById('inc_severity')?.value;
    if(!title||!desc){showToast('Title and description are required.','error');return;}
    try {
      await api('/incidents','POST',{title,description:desc,asset_id,severity});
      closeModal();
      showToast('Incident reported.','success');
      await renderIncidentsView();
      refreshIncidentBadge();
    } catch(e){showToast(e.message||'Failed to submit.','error');}
  });
}

function confirmDeleteIncident(id, title) {
  openModal('Delete Incident',`
    <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.7">Delete incident <strong style="color:var(--text-primary)">${esc(title)}</strong>? This cannot be undone.</p>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" style="padding:9px 20px" onclick="deleteIncident('${id}')">Delete</button>
    </div>`);
}
async function deleteIncident(id) {
  try{await api(`/incidents/${id}`,'DELETE');closeModal();showToast('Incident deleted.','info');await renderIncidentsView();refreshIncidentBadge();}
  catch(e){showToast(e.message,'error');}
}

// ─── ASSET FORMS ──────────────────────────────────────────────────────────────
function assetForm(asset=null,prefillCat=null){
  const v=k=>asset?esc(asset[k]||''):'';
  const cat=asset?.category||prefillCat||'',st=asset?.status||'available',dep=asset?.depreciation_method||'none';
  return `
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Asset Number <span style="font-weight:300;opacity:.6">(auto-generated if blank)</span></label><input class="form-input" id="f_asset_number" value="${v('asset_number')}" placeholder="e.g. AST-00001" style="font-family:var(--font-mono)" /></div>
      <div class="form-group full"><label class="form-label">Asset Name *</label><input class="form-input" id="f_name" value="${v('name')}" placeholder="e.g. Deluxe Room 101" /></div>
      <div class="form-group"><label class="form-label">Category *</label><select class="form-select" id="f_category"><option value="">Select…</option>${Object.entries(CATEGORY_META).map(([k,m])=>`<option value="${k}" ${cat===k?'selected':''}>${m.icon} ${m.label}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="f_status">${Object.entries(STATUS_META).map(([k,m])=>`<option value="${k}" ${st===k?'selected':''}>${m.label}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="f_location" value="${v('location')}" placeholder="e.g. Building A, Floor 2" /></div>
      <div class="form-group"><label class="form-label">Serial Number</label><input class="form-input" id="f_serial_number" value="${v('serial_number')}" /></div>
      <div class="form-group"><label class="form-label">Accountable Department</label><input class="form-input" id="f_accountable_department" value="${v('accountable_department')}" /></div>
      <div class="form-group">
        <label class="form-label">Responsible User <span style="font-weight:300;opacity:.6">(linked account)</span></label>
        <select class="form-select" id="f_responsible_user_id" onchange="onResponsibleUserChange()">
          <option value="">— Not linked —</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Accountable Person <span style="font-weight:300;opacity:.6">(free text / auto-filled)</span></label><input class="form-input" id="f_accountable_person" value="${v('accountable_person')}" placeholder="Auto-filled when user is selected" /></div>
      <div class="form-group"><label class="form-label">Purchase Date</label><input class="form-input" id="f_purchase_date" type="date" value="${v('purchase_date')}" /></div>
      <div class="form-group"><label class="form-label">Purchase Value (₱)</label><input class="form-input" id="f_purchase_value" type="number" value="${v('purchase_value')}" placeholder="0" /></div>
      <div class="form-group"><label class="form-label">Service Life (years)</label><input class="form-input" id="f_service_life_years" type="number" min="1" value="${asset?.service_life_years||''}" /></div>
      <div class="form-group"><label class="form-label">Depreciation Method</label><select class="form-select" id="f_depreciation_method" onchange="toggleRateField()">${Object.entries(DEPRECIATION_LABELS).map(([k,l])=>`<option value="${k}" ${dep===k?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="form-group" id="rateFieldWrap" style="${dep==='custom_rate'?'':'display:none'}"><label class="form-label">Annual Depreciation Rate (%)</label><input class="form-input" id="f_depreciation_rate" type="number" min="0.01" max="100" step="0.01" value="${asset?.depreciation_rate!=null?asset.depreciation_rate:''}" placeholder="e.g. 15" /></div>
      <div class="form-group"><label class="form-label">Repair Cost (₱)</label><input class="form-input" id="f_repair_cost" type="number" min="0" step="0.01" value="${asset?.repair_cost!=null?asset.repair_cost:''}" placeholder="Cumulative repair costs" /></div>
      <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" id="f_notes">${v('notes')}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="assetFormSubmit">${asset?'Save Changes':'Create Asset'}</button>
    </div>`;
}

function collectAssetForm(){
  return {
    asset_number:           document.getElementById('f_asset_number')?.value.trim()||null,
    name:                   document.getElementById('f_name')?.value.trim(),
    category:               document.getElementById('f_category')?.value,
    status:                 document.getElementById('f_status')?.value,
    location:               document.getElementById('f_location')?.value.trim()||null,
    serial_number:          document.getElementById('f_serial_number')?.value.trim()||null,
    accountable_department: document.getElementById('f_accountable_department')?.value.trim()||null,
    accountable_person:     document.getElementById('f_accountable_person')?.value.trim()||null,
    purchase_date:          document.getElementById('f_purchase_date')?.value||null,
    purchase_value:         document.getElementById('f_purchase_value')?.value||null,
    service_life_years:     document.getElementById('f_service_life_years')?.value?parseInt(document.getElementById('f_service_life_years').value):null,
    depreciation_method:    document.getElementById('f_depreciation_method')?.value||null,
    depreciation_rate:      document.getElementById('f_depreciation_rate')?.value?parseFloat(document.getElementById('f_depreciation_rate').value):null,
    repair_cost:            document.getElementById('f_repair_cost')?.value?parseFloat(document.getElementById('f_repair_cost').value):null,
    notes:                  document.getElementById('f_notes')?.value.trim()||null,
  };
}

function openAddModal(){openModal('New Asset',assetForm(null,state.currentCategory));document.getElementById('assetFormSubmit').addEventListener('click',async()=>{const data=collectAssetForm();if(!data.name||!data.category){showToast('Name and category are required.','error');return;}try{await api('/assets','POST',data);closeModal();showToast('Asset created.','success');await(state.currentView==='assets'?renderAssetsView():renderDashboard());}catch(e){showToast(e.message||'Failed.','error');}});}
async function openEditModal(assetId){const asset=await api(`/assets/${assetId}`);openModal('Edit Asset',assetForm(asset));document.getElementById('assetFormSubmit').addEventListener('click',async()=>{const data=collectAssetForm();try{await api(`/assets/${assetId}`,'PUT',data);closeModal();showToast('Asset updated.','success');await(state.currentView==='assets'?renderAssetsView():renderDashboard());}catch(e){showToast(e.message||'Failed.','error');}});}

async function openDetailModal(assetId){
  let a;try{a=await api(`/assets/${assetId}`);}catch{showToast('Could not load asset.','error');return;}
  const cat=CATEGORY_META[a.category]||{icon:'◻',label:a.category};
  openModal('Asset Details',`
    <div class="asset-detail">
      <div class="detail-header">
        <span class="detail-icon">${cat.icon}</span>
        <div class="detail-meta"><div class="detail-name">${esc(a.name)}</div><div class="detail-id">${a.asset_id}</div><div style="margin-top:8px">${statusBadge(a.status)}</div></div>
        ${canEdit()?`<div class="detail-actions"><button class="btn-secondary" onclick="closeModal();openEditModal('${a.asset_id}')">Edit</button><button class="btn-danger" onclick="closeModal();confirmDelete('${a.asset_id}','${esc(a.name)}')">Delete</button></div>`:''}
      </div>
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-field-label">Asset Number</div><div class="detail-field-value" style="font-family:var(--font-mono);font-size:13px;color:var(--gold-light)">${esc(a.asset_number||'—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">Category</div><div class="detail-field-value">${cat.label}</div></div>
        <div class="detail-field"><div class="detail-field-label">Location</div><div class="detail-field-value">${esc(a.location||'—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">Serial Number</div><div class="detail-field-value" style="font-family:var(--font-mono);font-size:12px">${esc(a.serial_number||'—')}</div></div>
        <div class="detail-field"><div class="detail-field-label">Purchase Value</div><div class="detail-field-value">${a.purchase_value?'₱'+formatNumber(parseFloat(a.purchase_value)):'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Purchase Date</div><div class="detail-field-value">${a.purchase_date||'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Service Life</div><div class="detail-field-value">${a.service_life_years?a.service_life_years+' years':'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Depreciation Method</div><div class="detail-field-value">${DEPRECIATION_LABELS[a.depreciation_method]||'—'}</div></div>
        ${a.depreciation_method==='custom_rate'?`<div class="detail-field"><div class="detail-field-label">Depreciation Rate</div><div class="detail-field-value">${a.depreciation_rate!=null?a.depreciation_rate+'%':'—'} / year</div></div>`:''}
        <div class="detail-field"><div class="detail-field-label">Repair Cost</div><div class="detail-field-value" style="color:var(--status-lost)">${a.repair_cost!=null?'₱'+formatNumber(a.repair_cost):'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Book Value</div><div class="detail-field-value" style="color:var(--gold-light);font-family:var(--font-display);font-size:18px">${a.book_value!=null?'₱'+formatNumber(a.book_value):'—'}</div></div>
        <div class="detail-field"><div class="detail-field-label">Accountable Department</div><div class="detail-field-value">${esc(a.accountable_department||'—')}</div></div>
        <div class="detail-field">
          <div class="detail-field-label">Responsible Person</div>
          <div class="detail-field-value">
            ${esc(a.responsible_user_name||a.accountable_person||'—')}
            ${a.responsible_user_id ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-left:6px">linked</span>` : ''}
          </div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Custody Confirmed</div>
          <div class="detail-field-value" style="display:flex;align-items:center;gap:10px">
            ${confirmedBadge(a.confirmed, a.responsible_user_id)}
            ${canConfirm(a) ? `<button class="btn-secondary" style="padding:5px 12px;font-size:12px" onclick="toggleConfirm('${a.asset_id}')">${a.confirmed ? 'Unconfirm' : 'Confirm Custody'}</button>` : ''}
          </div>
        </div>
        <div class="detail-field"><div class="detail-field-label">Last Updated</div><div class="detail-field-value" style="font-size:12px;color:var(--text-muted)">${a.updated_at?new Date(a.updated_at).toLocaleString():'—'}</div></div>
        ${a.notes?`<div class="detail-field full" style="grid-column:1/-1"><div class="detail-field-label">Notes</div><div class="detail-notes">${esc(a.notes)}</div></div>`:''}
      </div>
    </div>`);
}

function confirmDelete(assetId,name){openModal('Delete Asset',`<p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.7">Delete <strong style="color:var(--text-primary)">${esc(name)}</strong>? This cannot be undone.</p><div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-danger" style="padding:9px 20px" onclick="deleteAsset('${assetId}')">Delete Asset</button></div>`);}
async function deleteAsset(assetId){try{await api(`/assets/${assetId}`,'DELETE');closeModal();showToast('Asset deleted.','info');await(state.currentView==='assets'?renderAssetsView():renderDashboard());}catch{showToast('Failed.','error');}}

// ─── USERS VIEW ───────────────────────────────────────────────────────────────
async function renderUsersView(){
  if(!isAdmin()){document.getElementById('view-users').innerHTML=`<div class="empty-state"><span class="empty-icon">🔒</span><p>Admin access required.</p></div>`;return;}
  const el=document.getElementById('view-users');
  el.innerHTML='<div class="loading">Loading users</div>';
  let users;try{users=await api('/users');}catch{el.innerHTML=`<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load users.</p></div>`;return;}
  el.innerHTML=`<div class="assets-header"><h2>User Management</h2><button class="btn-primary" onclick="openAddUserModal()">+ New User</button></div>
    <div class="table-wrap"><table><thead><tr><th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.map(u=>`<tr class="${u.is_active?'':'user-inactive'}">
        <td class="asset-name">${esc(u.username)}</td><td>${esc(u.full_name||'—')}</td>
        <td style="font-family:var(--font-mono);font-size:11px">${esc(u.email||'—')}</td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td>${u.is_active?'<span style="color:var(--status-available)">Active</span>':'<span style="color:var(--text-muted)">Inactive</span>'}</td>
        <td><div class="table-actions"><button class="btn-icon" onclick="openEditUserModal('${u.user_id}')">✎</button>${u.user_id!==auth.user?.user_id?`<button class="btn-icon" onclick="confirmDeleteUser('${u.user_id}','${esc(u.username)}')">✕</button>`:''}</div></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function userForm(user=null){
  const v=k=>user?esc(user[k]||''):'';
  return `<div class="form-grid">
    <div class="form-group"><label class="form-label">Username *</label><input class="form-input" id="u_username" value="${v('username')}" ${user?'readonly':''} /></div>
    <div class="form-group"><label class="form-label">Role *</label><select class="form-select" id="u_role">${['viewer','editor','admin'].map(r=>`<option value="${r}" ${user?.role===r?'selected':''}>${r}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="u_full_name" value="${v('full_name')}" /></div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="u_email" type="email" value="${v('email')}" /></div>
    <div class="form-group"><label class="form-label">${user?'New Password (blank = no change)':'Password *'}</label><input class="form-input" id="u_password" type="password" /></div>
    ${user?`<div class="form-group"><label class="form-label">Status</label><select class="form-select" id="u_is_active"><option value="true" ${user.is_active?'selected':''}>Active</option><option value="false" ${!user.is_active?'selected':''}>Inactive</option></select></div>`:''}
  </div>
  <div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" id="userFormSubmit">${user?'Save Changes':'Create User'}</button></div>`;
}

function collectUserForm(isEdit=false){
  const pw=document.getElementById('u_password')?.value;
  const data={username:document.getElementById('u_username')?.value.trim(),full_name:document.getElementById('u_full_name')?.value.trim()||null,email:document.getElementById('u_email')?.value.trim()||null,role:document.getElementById('u_role')?.value};
  if(pw) data.password=pw;
  else if(!isEdit){showToast('Password is required.','error');return null;}
  if(isEdit){const a=document.getElementById('u_is_active');if(a) data.is_active=a.value==='true';}
  return data;
}

function openAddUserModal(){openModal('New User',userForm());document.getElementById('userFormSubmit').addEventListener('click',async()=>{const data=collectUserForm(false);if(!data||!data.username){showToast('Username is required.','error');return;}try{await api('/users','POST',data);closeModal();showToast('User created.','success');await renderUsersView();}catch(e){showToast(e.message||'Failed.','error');}});}
async function openEditUserModal(userId){let users;try{users=await api('/users');}catch{showToast('Could not load user.','error');return;}const user=users.find(u=>u.user_id===userId);if(!user)return;openModal('Edit User',userForm(user));document.getElementById('userFormSubmit').addEventListener('click',async()=>{const data=collectUserForm(true);if(!data)return;try{await api(`/users/${userId}`,'PUT',data);closeModal();showToast('User updated.','success');await renderUsersView();}catch(e){showToast(e.message||'Failed.','error');}});}
function confirmDeleteUser(userId,username){openModal('Delete User',`<p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.7">Delete user <strong style="color:var(--text-primary)">${esc(username)}</strong>?</p><div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-danger" style="padding:9px 20px" onclick="deleteUser('${userId}')">Delete User</button></div>`);}
async function deleteUser(userId){try{await api(`/users/${userId}`,'DELETE');closeModal();showToast('User deleted.','info');await renderUsersView();}catch(e){showToast(e.message,'error');}}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(title,bodyHTML){document.getElementById('modalTitle').textContent=title;document.getElementById('modalBody').innerHTML=bodyHTML;document.getElementById('modalOverlay').classList.remove('hidden');}
function closeModal(){document.getElementById('modalOverlay').classList.add('hidden');}

// ─── MISC UI HELPERS ──────────────────────────────────────────────────────────
function toggleRateField(){const m=document.getElementById('f_depreciation_method')?.value,w=document.getElementById('rateFieldWrap');if(w) w.style.display=m==='custom_rate'?'':' none';}

async function exportCSV(){
  const params = buildAssetParams();
  const btn=document.getElementById('exportCsvBtn');
  if(btn){btn.textContent='⏳ Exporting…';btn.disabled=true;}
  try{
    const res=await fetch(`${API}/assets/export/csv?${params}`,{headers:{'Authorization':`Bearer ${auth.token}`}});
    if(!res.ok) throw new Error('Export failed');
    const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    const cd=res.headers.get('Content-Disposition')||'',match=cd.match(/filename=([^;]+)/);
    a.download=match?match[1]:'gtracker_assets.csv'; a.href=url;
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    showToast('CSV exported.','success');
  }catch{showToast('Export failed.','error');}
  finally{if(btn){btn.textContent='⬇ Export CSV';btn.disabled=false;}}
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(path,method='GET',body=null){
  const headers={'Content-Type':'application/json'};
  if(auth.token) headers['Authorization']=`Bearer ${auth.token}`;
  const opts={method,headers};
  if(body) opts.body=JSON.stringify(body);
  const res=await fetch(`${API}${path}`,opts);
  if(res.status===401){clearAuth();showLogin();throw new Error('Session expired');}
  if(method==='DELETE'&&res.status===204) return null;
  const data=await res.json();
  if(!res.ok) throw new Error(data.detail||'API error');
  return data;
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function statusBadge(s){const m=STATUS_META[s]||{label:s,color:'#888',bg:'#222',border:'#333'};return `<span class="badge badge-${s}">${m.label}</span>`;}
function esc(str){if(!str)return '';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function formatNumber(n){if(isNaN(n))return '0';return n.toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:0});}
function getGreeting(){const h=new Date().getHours();return h<12?'morning':h<17?'afternoon':'evening';}
function timeAgo(iso){if(!iso)return '';const d=new Date(iso),now=new Date(),diff=Math.floor((now-d)/1000);if(diff<60)return 'just now';if(diff<3600)return Math.floor(diff/60)+'m ago';if(diff<86400)return Math.floor(diff/3600)+'h ago';return Math.floor(diff/86400)+'d ago';}
function showToast(msg,type='info'){const c=document.getElementById('toastContainer'),t=document.createElement('div');t.className=`toast ${type}`;const icons={success:'✓',error:'✕',info:'◈'};t.innerHTML=`<span style="color:${type==='success'?'var(--status-available)':type==='error'?'var(--status-lost)':'var(--gold)'}">${icons[type]||''}</span> ${esc(msg)}`;c.appendChild(t);setTimeout(()=>t.remove(),4000);}

// ─── DOCUMENTS VIEW ───────────────────────────────────────────────────────────
async function renderDocumentsView() {
  const el = document.getElementById('view-documents');
  el.innerHTML = '<div class="loading">Loading documents</div>';
  let docs;
  try { docs = await api('/documents/'); }
  catch { el.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠</span><p>Failed to load documents.</p></div>`; return; }

  el.innerHTML = `
    <div class="assets-header">
      <h2>Policy Documents</h2>
      ${isAdmin() ? `<button class="btn-primary" onclick="openUploadDocModal()">⬆ Upload Document</button>` : ''}
    </div>
    ${docs.length === 0
      ? `<div class="empty-state">
           <span class="empty-icon">📄</span>
           <p>${isAdmin() ? 'No documents uploaded yet. Use the button above to add a PDF.' : 'No policy documents are available yet.'}</p>
         </div>`
      : `<div class="doc-grid">
           ${docs.map(docCard).join('')}
         </div>`
    }`;
}

function docCard(doc) {
  const size = doc.file_size ? formatFileSize(doc.file_size) : '';
  return `
    <div class="doc-card">
      <div class="doc-card-icon">📄</div>
      <div class="doc-card-name">${esc(doc.name)}</div>
      ${doc.description ? `<div class="doc-card-desc">${esc(doc.description)}</div>` : ''}
      <div class="doc-card-meta">
        ${size ? `<span>📦 ${size}</span>` : ''}
        <span>⬆ ${esc(doc.uploader_name || 'Admin')}</span>
        <span>📅 ${new Date(doc.created_at).toLocaleDateString()}</span>
      </div>
      <div class="doc-card-actions">
        <button class="btn-download" onclick="downloadDoc('${doc.doc_id}', '${esc(doc.filename)}')">
          ⬇ Download PDF
        </button>
        ${isAdmin() ? `<button class="btn-icon" title="Delete" onclick="confirmDeleteDoc('${doc.doc_id}','${esc(doc.name)}')">✕</button>` : ''}
      </div>
    </div>`;
}

async function downloadDoc(docId, filename) {
  try {
    const res = await fetch(`${API}/documents/${docId}/download`, {
      headers: { 'Authorization': `Bearer ${auth.token}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`, 'success');
  } catch(err) {
    showToast('Download failed. Please try again.', 'error');
  }
}

function openUploadDocModal() {
  openModal('Upload Policy Document', `
    <div class="form-grid">
      <div class="form-group full">
        <label class="form-label">Document Name *</label>
        <input class="form-input" id="doc_name" placeholder="e.g. Employee Code of Conduct" />
      </div>
      <div class="form-group full">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="doc_description" placeholder="Brief description of this document…"></textarea>
      </div>
      <div class="form-group full">
        <label class="form-label">PDF File *</label>
        <div class="upload-zone" id="docDropZone" onclick="document.getElementById('docFileInput').click()">
          <span class="upload-zone-icon">📄</span>
          <div class="upload-zone-text" id="docDropText">Click to select a PDF, or drag and drop here</div>
          <div class="upload-zone-hint">PDF only · Max 20 MB</div>
        </div>
        <input type="file" id="docFileInput" accept=".pdf" style="display:none" onchange="onDocFileSelected(this)" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="docUploadBtn">Upload Document</button>
    </div>`);

  // Drag-and-drop binding
  const zone = document.getElementById('docDropZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) updateDocDropZone(file);
    const input = document.getElementById('docFileInput');
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    input.files = dt.files;
  });

  document.getElementById('docUploadBtn').addEventListener('click', submitDocUpload);
}

function onDocFileSelected(input) {
  if (input.files[0]) updateDocDropZone(input.files[0]);
}

function updateDocDropZone(file) {
  const text = document.getElementById('docDropText');
  if (text) text.textContent = `✓ ${file.name} (${formatFileSize(file.size)})`;
  const zone = document.getElementById('docDropZone');
  if (zone) { zone.style.borderColor = 'var(--status-available)'; zone.style.background = 'var(--status-available-bg)'; }
}

async function submitDocUpload() {
  const name  = document.getElementById('doc_name')?.value.trim();
  const desc  = document.getElementById('doc_description')?.value.trim();
  const input = document.getElementById('docFileInput');
  const file  = input?.files[0];
  const btn   = document.getElementById('docUploadBtn');

  if (!name)  { showToast('Document name is required.', 'error'); return; }
  if (!file)  { showToast('Please select a PDF file.', 'error'); return; }
  if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Only PDF files are allowed.', 'error'); return; }

  btn.textContent = 'Uploading…'; btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', desc || '');
    formData.append('file', file);

    const res = await fetch(`${API}/documents/`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${auth.token}` },
      body:    formData,
      // Note: do NOT set Content-Type here — browser sets it with boundary automatically
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Upload failed'); }
    closeModal();
    showToast('Document uploaded successfully.', 'success');
    await renderDocumentsView();
  } catch(err) {
    showToast(err.message || 'Upload failed.', 'error');
  } finally {
    btn.textContent = 'Upload Document'; btn.disabled = false;
  }
}

function confirmDeleteDoc(docId, name) {
  openModal('Delete Document', `
    <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.7">
      Delete <strong style="color:var(--text-primary)">${esc(name)}</strong>?
      The PDF file will be permanently removed and users will no longer be able to download it.
    </p>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" style="padding:9px 20px" onclick="deleteDoc('${docId}')">Delete Document</button>
    </div>`);
}

async function deleteDoc(docId) {
  try {
    await api(`/documents/${docId}`, 'DELETE');
    closeModal();
    showToast('Document deleted.', 'info');
    await renderDocumentsView();
  } catch(err) {
    showToast(err.message || 'Failed to delete.', 'error');
  }
}

// ─── FILE SIZE FORMATTER ──────────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// ─── INCIDENTS CSV EXPORT ─────────────────────────────────────────────────────
async function exportIncidentsCSV() {
  // Honour whatever filters are currently visible in the incidents view
  const params = new URLSearchParams();
  // If you add filter dropdowns to the incidents view in the future,
  // append them here the same way as the assets export does.

  const btn = document.getElementById('exportIncidentsBtn');
  if (btn) { btn.textContent = '⏳ Exporting…'; btn.disabled = true; }

  try {
    const res = await fetch(`${API}/incidents/export/csv?${params}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` },
    });
    if (!res.ok) throw new Error('Export failed');

    const blob  = await res.blob();
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const cd    = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename=([^;]+)/);
    a.download  = match ? match[1] : 'gtracker_incidents.csv';
    a.href      = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Incidents exported successfully.', 'success');
  } catch (err) {
    showToast('Export failed. Please try again.', 'error');
  } finally {
    if (btn) { btn.textContent = '⬇ Export CSV'; btn.disabled = false; }
  }
}

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
function openChangePasswordModal() {
  openModal('Change Password', `
    <div class="form-grid">
      <div class="form-group full">
        <label class="form-label">Current Password *</label>
        <input class="form-input" id="cp_current" type="password"
               placeholder="Enter your current password" autocomplete="current-password" />
      </div>
      <div class="form-group full">
        <label class="form-label">New Password *</label>
        <input class="form-input" id="cp_new" type="password"
               placeholder="Minimum 6 characters" autocomplete="new-password"
               oninput="checkPasswordStrength(this.value)" />
        <div id="cp_strength" style="margin-top:6px;font-family:var(--font-mono);font-size:10px;color:var(--text-muted)"></div>
      </div>
      <div class="form-group full">
        <label class="form-label">Confirm New Password *</label>
        <input class="form-input" id="cp_confirm" type="password"
               placeholder="Re-enter new password" autocomplete="new-password" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="cpSubmitBtn">Update Password</button>
    </div>`);

  document.getElementById('cp_current').focus();
  document.getElementById('cpSubmitBtn').addEventListener('click', submitChangePassword);
  // Allow Enter key on last field to submit
  document.getElementById('cp_confirm').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitChangePassword();
  });
}

function checkPasswordStrength(pw) {
  const el = document.getElementById('cp_strength');
  if (!el) return;
  if (!pw) { el.textContent = ''; return; }
  if (pw.length < 6)  { el.style.color = 'var(--status-lost)';        el.textContent = '⚠ Too short (min 6 characters)'; return; }
  if (pw.length < 10) { el.style.color = 'var(--status-maintenance)'; el.textContent = '▲ Fair'; return; }
  const hasUpper  = /[A-Z]/.test(pw);
  const hasLower  = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const score = [hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  if (score >= 3) { el.style.color = 'var(--status-available)'; el.textContent = '✓ Strong'; }
  else            { el.style.color = 'var(--status-maintenance)'; el.textContent = '▲ Moderate — add numbers or symbols for a stronger password'; }
}

async function submitChangePassword() {
  const current = document.getElementById('cp_current')?.value;
  const newPw   = document.getElementById('cp_new')?.value;
  const confirm = document.getElementById('cp_confirm')?.value;
  const btn     = document.getElementById('cpSubmitBtn');

  if (!current) { showToast('Current password is required.', 'error'); return; }
  if (!newPw)   { showToast('New password is required.', 'error'); return; }
  if (newPw.length < 6) { showToast('New password must be at least 6 characters.', 'error'); return; }
  if (newPw !== confirm) { showToast('New passwords do not match.', 'error'); return; }
  if (current === newPw) { showToast('New password must be different from your current password.', 'error'); return; }

  btn.textContent = 'Updating…'; btn.disabled = true;

  // Verify current password by attempting a login
  try {
    const verifyRes = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ username: auth.user.username, password: current }),
    });
    if (!verifyRes.ok) {
      showToast('Current password is incorrect.', 'error');
      btn.textContent = 'Update Password'; btn.disabled = false;
      return;
    }
  } catch {
    showToast('Could not verify current password. Check your connection.', 'error');
    btn.textContent = 'Update Password'; btn.disabled = false;
    return;
  }

  // Update via the users API
  try {
    await api(`/users/${auth.user.user_id}`, 'PUT', { password: newPw });
    closeModal();
    showToast('Password updated successfully.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to update password.', 'error');
  } finally {
    btn.textContent = 'Update Password'; btn.disabled = false;
  }
}

// ─── RESPONSIBLE USER / CONFIRM HELPERS ──────────────────────────────────────

function canConfirm(asset) {
  // The linked responsible user can confirm; admins can also toggle
  if (!asset.responsible_user_id) return false;
  return auth.user?.user_id === asset.responsible_user_id ||
         auth.user?.role    === 'admin';
}

function confirmedBadge(confirmed, responsibleUserId) {
  if (!responsibleUserId) return '<span style="color:var(--text-muted);font-size:11px">—</span>';
  if (confirmed) return '<span style="background:#1a2e22;color:#7eb894;border:1px solid #2a4a36;border-radius:20px;padding:2px 10px;font-size:11px;font-family:var(--font-mono)">✓ Confirmed</span>';
  return '<span style="background:#2e2010;color:#e8b47a;border:1px solid #4a3518;border-radius:20px;padding:2px 10px;font-size:11px;font-family:var(--font-mono)">⏳ Pending</span>';
}

async function toggleConfirm(assetId) {
  try {
    await api(`/assets/${assetId}/confirm`, 'PATCH');
    showToast('Custody confirmation updated.', 'success');
    // Refresh the detail modal in place
    await openDetailModal(assetId);
    // Also refresh the table in the background
    if (state.currentView === 'assets') renderAssetsView();
  } catch(err) {
    showToast(err.message || 'Failed to update confirmation.', 'error');
  }
}

// Auto-fill accountable_person when a responsible user is selected
async function onResponsibleUserChange() {
  const sel   = document.getElementById('f_responsible_user_id');
  const input = document.getElementById('f_accountable_person');
  if (!sel || !input) return;
  const userId = sel.value;
  if (!userId) return;
  // Find the selected option's display text and extract name
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.name) {
    input.value = opt.dataset.name;
  }
}

// Populate the responsible user dropdown in the asset form
async function populateUserPicker(selectedUserId) {
  const sel = document.getElementById('f_responsible_user_id');
  if (!sel) return;
  try {
    const users = await api('/users/picker');
    // Clear existing options except the first (— Not linked —)
    while (sel.options.length > 1) sel.remove(1);
    users.forEach(u => {
      const opt      = document.createElement('option');
      opt.value      = u.user_id;
      opt.textContent = `${u.full_name || u.username} (${u.role})`;
      opt.dataset.name = u.full_name || u.username;
      if (u.user_id === selectedUserId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch { /* picker failure is non-fatal */ }
}

// Override openAddModal and openEditModal to populate user picker after render
const _origOpenAddModal  = openAddModal;
const _origOpenEditModal = openEditModal;

function openAddModal() {
  _origOpenAddModal();
  setTimeout(() => populateUserPicker(null), 0);
}

async function openEditModal(assetId) {
  const asset = await api(`/assets/${assetId}`);
  // Call original logic inline to keep asset available for picker
  openModal('Edit Asset', assetForm(asset));
  setTimeout(() => populateUserPicker(asset.responsible_user_id), 0);
  document.getElementById('assetFormSubmit').addEventListener('click', async () => {
    const data = collectAssetForm();
    try {
      await api(`/assets/${assetId}`, 'PUT', data);
      closeModal();
      showToast('Asset updated.', 'success');
      await (state.currentView === 'assets' ? renderAssetsView() : renderDashboard());
    } catch(e) { showToast(e.message || 'Failed.', 'error'); }
  });
}
