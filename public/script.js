// =============================================
// こんや話そ - script.js
// =============================================
// Supabase topics テーブル SQL:
//
// CREATE TABLE topics (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   title TEXT NOT NULL,
//   category TEXT NOT NULL,
//   priority TEXT NOT NULL DEFAULT 'normal',
//   added_by TEXT NOT NULL,
//   is_resolved BOOLEAN DEFAULT FALSE,
//   resolution_memo TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   resolved_at TIMESTAMPTZ
// );
//
// ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "allow_all" ON topics FOR ALL TO anon USING (true) WITH CHECK (true);
// =============================================

var db = null;
var currentUser     = null;  // 'papa' | 'mama'
var selectedCategory = null;
var selectedPriority = 'normal';
var currentTopicId   = null;
var _currentTopicData = null;

const AUTH_EXPIRY = 24 * 60 * 60 * 1000;

const CATEGORIES = {
  money:     { label: 'お金',       emoji: '💰', color: '#1B7F4C', bg: '#EEFBF4' },
  childcare: { label: '育児・子ども', emoji: '👶', color: '#C4456E', bg: '#FFF0F5' },
  home:      { label: '家のこと',   emoji: '🏠', color: '#1A6EA8', bg: '#EEF6FF' },
  couple:    { label: '二人のこと', emoji: '💑', color: '#7048B6', bg: '#F5EEFF' },
  work:      { label: '仕事のこと', emoji: '💼', color: '#B86218', bg: '#FFF3E8' }
};

// ===== Supabase =====
async function initSupabase(config) {
  const { createClient } = window.supabase;
  db = createClient(config.supabaseUrl, config.supabaseKey);
}

// db が null なら config.json から再初期化を試みる
async function ensureDb() {
  if (db) return true;
  try {
    var res    = await fetch('config.json');
    var config = await res.json();
    window._appConfig = config;
    await initSupabase(config);
    return !!db;
  } catch (e) {
    console.error('DB再初期化失敗:', e);
    return false;
  }
}

// ===== 認証 =====
function checkAuth() {
  const t = localStorage.getItem('konya_auth_time');
  const u = localStorage.getItem('konya_user');
  if (t && u && (Date.now() - parseInt(t)) < AUTH_EXPIRY) {
    currentUser = u;
    showMainApp();
  } else {
    localStorage.removeItem('konya_auth_time');
    localStorage.removeItem('konya_user');
    showAuthScreen();
  }
}

function selectUser(user) {
  currentUser = user;
  document.getElementById('userBtnPapa').classList.toggle('selected', user === 'papa');
  document.getElementById('userBtnMama').classList.toggle('selected', user === 'mama');
  document.getElementById('authError').textContent = '';
}

function authenticate() {
  const pw    = document.getElementById('passwordInput').value;
  const errEl = document.getElementById('authError');

  if (!currentUser) { errEl.textContent = 'パパかママを選んでください'; return; }
  if (!pw)          { errEl.textContent = 'パスワードを入力してください'; return; }

  const correctPw = window._appConfig && window._appConfig.password
    ? window._appConfig.password
    : 'こんや';

  if (pw === correctPw) {
    errEl.textContent = '';
    localStorage.setItem('konya_auth_time', Date.now().toString());
    localStorage.setItem('konya_user', currentUser);
    showMainApp();
  } else {
    errEl.textContent = 'パスワードが正しくありません';
    document.getElementById('passwordInput').value = '';
    const card = document.querySelector('.auth-card');
    card.style.animation = 'none';
    setTimeout(function() { card.style.animation = 'authShake 0.4s ease'; }, 10);
  }
}

function togglePasswordVisibility() {
  const input = document.getElementById('passwordInput');
  const icon  = document.getElementById('eyeIcon');
  if (input.type === 'password') { input.type = 'text';     icon.textContent = '🙈'; }
  else                           { input.type = 'password'; icon.textContent = '👁'; }
}

function logout() {
  localStorage.removeItem('konya_auth_time');
  localStorage.removeItem('konya_user');
  location.reload();
}

function showAuthScreen() {
  document.getElementById('authScreen').classList.add('active');
  document.getElementById('mainApp').classList.remove('active');
}

function showMainApp() {
  document.getElementById('authScreen').classList.remove('active');
  document.getElementById('mainApp').classList.add('active');
  document.getElementById('headerUser').textContent = currentUser === 'papa' ? 'パパとして' : 'ママとして';
  goToPage('topics');
}

// ===== ページ遷移 =====
function goToPage(pageName) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.bnav-btn[data-page]').forEach(function(b) { b.classList.remove('active'); });

  document.getElementById(pageName + 'Page').classList.add('active');
  var btn = document.querySelector('.bnav-btn[data-page="' + pageName + '"]');
  if (btn) btn.classList.add('active');

  if (pageName === 'topics')  loadTopics();
  else if (pageName === 'history') loadHistory();
}

// ===== ユーティリティ =====
function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(dateStr) {
  var d = new Date(dateStr);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatRelativeDate(dateStr) {
  var d    = new Date(dateStr);
  var now  = new Date();
  var diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  if (diff < 7)  return diff + '日前';
  if (diff < 30) return Math.floor(diff / 7) + '週間前';
  return formatDate(dateStr);
}

// ===== トピック一覧 =====
async function loadTopics() {
  var container = document.getElementById('topicsList');
  container.innerHTML = '<p class="loading-msg">読み込み中…</p>';

  if (!await ensureDb()) {
    container.innerHTML = '<p class="error-msg">データベースに接続できません。<br>ページを再読み込みしてください。</p>';
    return;
  }

  try {
    var result = await db.from('topics')
      .select('*')
      .eq('is_resolved', false)
      .order('created_at', { ascending: false });
    if (result.error) throw result.error;

    var data = result.data || [];

    // 急ぎ → 普通 の順（同じ優先度なら新しい順を維持）
    data.sort(function(a, b) {
      if (a.priority === b.priority) return 0;
      return a.priority === 'urgent' ? -1 : 1;
    });

    var countEl = document.getElementById('topicCount');
    if (data.length > 0) {
      countEl.textContent = data.length + '件';
      countEl.className = 'topic-count';
    } else {
      countEl.textContent = '';
      countEl.className = 'topic-count empty';
    }

    container.innerHTML = '';

    if (data.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-icon">💬</div>' +
        '<p class="empty-title">話し合いたいことはありません</p>' +
        '<p class="empty-sub">＋ボタンから追加しましょう！</p>' +
        '</div>';
      return;
    }

    data.forEach(function(topic, idx) {
      var card = renderTopicCard(topic, false);
      card.style.animationDelay = Math.min(idx, 10) * 55 + 'ms';
      container.appendChild(card);
    });

  } catch (err) {
    console.error('トピック読み込みエラー:', err);
    container.innerHTML = '<p class="error-msg">読み込みに失敗しました</p>';
  }
}

async function loadHistory() {
  var container = document.getElementById('historyList');
  container.innerHTML = '<p class="loading-msg">読み込み中…</p>';

  if (!await ensureDb()) {
    container.innerHTML = '<p class="error-msg">データベースに接続できません。<br>ページを再読み込みしてください。</p>';
    return;
  }

  try {
    var result = await db.from('topics')
      .select('*')
      .eq('is_resolved', true)
      .order('resolved_at', { ascending: false });
    if (result.error) throw result.error;

    var data = result.data || [];
    container.innerHTML = '';

    if (data.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-icon">✅</div>' +
        '<p class="empty-title">解決済みの話し合いはまだありません</p>' +
        '<p class="empty-sub">話し合いを完了したら、ここに記録されます！</p>' +
        '</div>';
      return;
    }

    data.forEach(function(topic, idx) {
      var card = renderTopicCard(topic, true);
      card.style.animationDelay = Math.min(idx, 10) * 55 + 'ms';
      container.appendChild(card);
    });

  } catch (err) {
    container.innerHTML = '<p class="error-msg">読み込みに失敗しました</p>';
  }
}

function renderTopicCard(topic, isHistory) {
  var cat = CATEGORIES[topic.category] || CATEGORIES.couple;
  var card = document.createElement('div');
  card.className = 'topic-card' +
    (topic.priority === 'urgent' && !isHistory ? ' urgent' : '') +
    (isHistory ? ' resolved' : '');

  var addedByLabel = topic.added_by === 'papa' ? 'パパ' : 'ママ';
  var html = '';

  // トップ行（バッジ）
  html += '<div class="topic-card-top"><div class="topic-badges">';
  if (topic.priority === 'urgent' && !isHistory) {
    html += '<span class="badge badge-urgent">🔥 急ぎ</span>';
  }
  html += '<span class="badge" style="background:' + cat.bg + ';color:' + cat.color + '">' +
    cat.emoji + ' ' + esc(cat.label) + '</span>';
  html += '</div>';
  if (isHistory) {
    html += '<span class="resolved-badge">✅ 解決済み</span>';
  }
  html += '</div>';

  // タイトル
  html += '<div class="topic-title">' + esc(topic.title) + '</div>';

  // 解決メモ（履歴のみ）
  if (isHistory && topic.resolution_memo) {
    html += '<div class="resolution-memo">📝 ' + esc(topic.resolution_memo) + '</div>';
  }

  // メタ情報
  if (isHistory) {
    var resolvedDate = topic.resolved_at ? formatDate(topic.resolved_at) : '';
    html += '<div class="topic-meta">' + esc(addedByLabel) + ' が追加 · ' + esc(resolvedDate) + ' に解決</div>';
  } else {
    html += '<div class="topic-meta">' + esc(addedByLabel) + ' が追加 · ' + esc(formatRelativeDate(topic.created_at)) + '</div>';
  }

  card.innerHTML = html;

  if (!isHistory) {
    card.addEventListener('click', function() { showTopicModal(topic.id, topic); });
  }

  return card;
}

// ===== 追加モーダル =====
function showAddModal() {
  selectedCategory = null;
  selectedPriority = 'normal';
  document.getElementById('topicTitleInput').value = '';
  document.getElementById('addError').textContent  = '';

  document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('selected'); });
  document.getElementById('priorityNormal').classList.add('active');
  document.getElementById('priorityUrgent').classList.remove('active');

  var btn = document.getElementById('addSubmitBtn');
  btn.disabled    = false;
  btn.textContent = '追加する';

  document.getElementById('addModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { document.getElementById('topicTitleInput').focus(); }, 300);
}

function hideAddModal() {
  document.getElementById('addModal').classList.remove('active');
  document.body.style.overflow = '';
}

function selectCategory(cat) {
  selectedCategory = cat;
  document.querySelectorAll('.cat-chip').forEach(function(c) {
    c.classList.toggle('selected', c.getAttribute('data-cat') === cat);
  });
  document.getElementById('addError').textContent = '';
}

function selectPriority(priority) {
  selectedPriority = priority;
  document.getElementById('priorityNormal').classList.toggle('active', priority === 'normal');
  document.getElementById('priorityUrgent').classList.toggle('active', priority === 'urgent');
}

async function submitTopic() {
  var title = document.getElementById('topicTitleInput').value.trim();
  var errEl = document.getElementById('addError');
  var btn   = document.getElementById('addSubmitBtn');

  if (!title)            { errEl.textContent = 'タイトルを入力してください'; return; }
  if (!selectedCategory) { errEl.textContent = 'カテゴリを選んでください';   return; }
  errEl.textContent = '';

  btn.disabled    = true;
  btn.textContent = '追加中…';

  if (!await ensureDb()) {
    errEl.textContent = 'データベースに接続できません。ページを再読み込みしてください。';
    btn.disabled = false; btn.textContent = '追加する';
    return;
  }

  try {
    var result = await db.from('topics').insert({
      title:       title,
      category:    selectedCategory,
      priority:    selectedPriority,
      added_by:    currentUser,
      is_resolved: false
    });
    if (result.error) throw result.error;

    hideAddModal();
    goToPage('topics');

  } catch (err) {
    console.error('追加エラー:', err);
    errEl.textContent = '追加に失敗しました: ' + err.message;
    btn.disabled    = false;
    btn.textContent = '追加する';
  }
}

// ===== トピック詳細モーダル =====
function showTopicModal(topicId, topicData) {
  currentTopicId    = topicId;
  _currentTopicData = topicData;

  var cat = CATEGORIES[topicData.category] || CATEGORIES.couple;
  var addedByLabel = topicData.added_by === 'papa' ? 'パパ' : 'ママ';

  document.getElementById('topicModalContent').innerHTML =
    '<div class="topic-detail-badges">' +
      (topicData.priority === 'urgent'
        ? '<span class="badge badge-urgent">🔥 急ぎ</span>' : '') +
      '<span class="badge" style="background:' + cat.bg + ';color:' + cat.color + '">' +
        cat.emoji + ' ' + esc(cat.label) +
      '</span>' +
    '</div>' +
    '<div class="topic-detail-title">' + esc(topicData.title) + '</div>' +
    '<div class="topic-detail-meta">' +
      esc(addedByLabel) + ' が ' + esc(formatDate(topicData.created_at)) + ' に追加' +
    '</div>';

  document.getElementById('topicModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideTopicModal() {
  document.getElementById('topicModal').classList.remove('active');
  document.body.style.overflow = '';
  currentTopicId    = null;
  _currentTopicData = null;
}

async function deleteTopicFromModal() {
  if (!currentTopicId) return;
  if (!confirm('このトピックを削除しますか？')) return;

  if (!await ensureDb()) { alert('データベースに接続できません'); return; }

  try {
    var result = await db.from('topics').delete().eq('id', currentTopicId);
    if (result.error) throw result.error;
    hideTopicModal();
    loadTopics();
  } catch (err) {
    alert('削除に失敗しました');
  }
}

// ===== 解決モーダル =====
function showResolveModal() {
  if (!_currentTopicData) return;

  document.getElementById('resolveTopicTitle').textContent = _currentTopicData.title;
  document.getElementById('resolutionMemoInput').value     = '';
  document.getElementById('resolveError').textContent      = '';

  var btn = document.getElementById('resolveSubmitBtn');
  btn.disabled    = false;
  btn.textContent = '✅ 解決済みにする';

  hideTopicModal();

  document.getElementById('resolveModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideResolveModal() {
  document.getElementById('resolveModal').classList.remove('active');
  document.body.style.overflow = '';
}

async function resolveTopic() {
  if (!currentTopicId) return;

  var memo  = document.getElementById('resolutionMemoInput').value.trim();
  var errEl = document.getElementById('resolveError');
  var btn   = document.getElementById('resolveSubmitBtn');

  btn.disabled    = true;
  btn.textContent = '処理中…';
  errEl.textContent = '';

  if (!await ensureDb()) {
    errEl.textContent = 'データベースに接続できません。ページを再読み込みしてください。';
    btn.disabled = false; btn.textContent = '✅ 解決済みにする';
    return;
  }

  try {
    var result = await db.from('topics').update({
      is_resolved:     true,
      resolution_memo: memo || null,
      resolved_at:     new Date().toISOString()
    }).eq('id', currentTopicId);
    if (result.error) throw result.error;

    currentTopicId    = null;
    _currentTopicData = null;

    hideResolveModal();
    showCelebration();
    setTimeout(function() { loadTopics(); }, 900);

  } catch (err) {
    console.error('解決エラー:', err);
    errEl.textContent = '更新に失敗しました: ' + err.message;
    btn.disabled    = false;
    btn.textContent = '✅ 解決済みにする';
  }
}

// ===== セレブレーション =====
function showCelebration() {
  var el = document.getElementById('celebration');
  el.classList.add('active');
  setTimeout(function() { el.classList.remove('active'); }, 2000);
}

// ===== 初期化 =====
window.addEventListener('load', async function() {

  // Enter でログイン
  document.getElementById('passwordInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') authenticate();
  });

  // モーダル外クリックで閉じる
  ['addModal', 'topicModal', 'resolveModal'].forEach(function(id) {
    document.getElementById(id).addEventListener('click', function(e) {
      if (e.target.id !== id) return;
      if (id === 'addModal')     hideAddModal();
      if (id === 'topicModal')   hideTopicModal();
      if (id === 'resolveModal') hideResolveModal();
    });
  });

  // Escape で閉じる
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    hideAddModal();
    hideTopicModal();
    hideResolveModal();
  });

  // Supabase 初期化
  try {
    var res    = await fetch('config.json');
    var config = await res.json();
    window._appConfig = config;
    await initSupabase(config);
  } catch (err) {
    console.error('Supabase初期化エラー:', err);
  }

  checkAuth();
});
