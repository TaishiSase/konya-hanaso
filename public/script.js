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
//   talk_timing TEXT NOT NULL DEFAULT 'anytime',  -- 'anytime' | 'asap' | 'specific_date'
//   talk_date DATE,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   resolved_at TIMESTAMPTZ
// );
//
// CREATE TABLE discussion_logs (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
//   comment TEXT NOT NULL,
//   added_by TEXT NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
// =============================================

var db = null;
var currentUser      = null;  // 'papa' | 'mama'
var selectedCategory = null;
var selectedPriority = 'normal';
var selectedTiming   = 'anytime';
var currentTopicId   = null;
var _currentTopicData = null;

// 編集モーダル用
var selectedEditCategory = null;
var selectedEditPriority = 'normal';
var selectedEditTiming   = 'anytime';

const CATEGORIES = {
  money:     { label: 'お金',       emoji: '💰', color: '#1B7F4C', bg: '#EEFBF4' },
  childcare: { label: '育児・子ども', emoji: '👶', color: '#C4456E', bg: '#FFF0F5' },
  home:      { label: '家のこと',   emoji: '🏠', color: '#1A6EA8', bg: '#EEF6FF' },
  couple:    { label: '二人のこと', emoji: '💑', color: '#7048B6', bg: '#F5EEFF' },
  work:      { label: '仕事のこと', emoji: '💼', color: '#B86218', bg: '#FFF3E8' }
};

// ===== Supabase =====
async function initSupabase(config) {
  var { createClient } = window.supabase;
  db = createClient(config.supabaseUrl, config.supabaseKey);
}

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
async function checkAuth() {
  var { data: { session } } = await db.auth.getSession();
  if (!session) { showAuthScreen(); return; }
  currentUser = session.user.email === window._appConfig.papaEmail ? 'papa' : 'mama';
  showMainApp();
}

function selectUser(user) {
  currentUser = user;
  document.getElementById('userBtnPapa').classList.toggle('selected', user === 'papa');
  document.getElementById('userBtnMama').classList.toggle('selected', user === 'mama');
  document.getElementById('authError').textContent = '';
  document.getElementById('authPassword').focus();
}

async function authenticate() {
  var errEl = document.getElementById('authError');
  if (!currentUser) { errEl.textContent = 'パパかママを選んでください'; return; }
  var pw    = document.getElementById('authPassword').value.trim();
  if (!pw)  { errEl.textContent = 'パスワードを入力してください'; return; }
  var email = currentUser === 'papa' ? window._appConfig.papaEmail : window._appConfig.mamaEmail;
  var btn   = document.getElementById('btnLogin');
  btn.disabled    = true;
  btn.textContent = '確認中…';
  var { error } = await db.auth.signInWithPassword({ email: email, password: pw });
  btn.disabled    = false;
  btn.textContent = 'はじめる';
  if (error) { errEl.textContent = 'パスワードが違います'; return; }
  showMainApp();
}

async function logout() {
  await db.auth.signOut();
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

  if (pageName === 'topics')       loadTopics();
  else if (pageName === 'history') loadHistory();
}

// ===== ユーティリティ =====
function esc(str) {
  var d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatDate(dateStr) {
  var d = new Date(dateStr);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  return parseInt(parts[1]) + '/' + parseInt(parts[2]);
}

function formatDateTime(dateStr) {
  var d = new Date(dateStr);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
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

function timingBadgeHtml(topic) {
  var timing = topic.talk_timing || 'anytime';
  if (timing === 'asap') {
    return '<span class="badge badge-asap">🚨 早めに</span>';
  }
  if (timing === 'specific_date' && topic.talk_date) {
    return '<span class="badge badge-date">📅 ' + esc(formatDateShort(topic.talk_date)) + '</span>';
  }
  return '';
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

    // 並び順: 急ぎ → asap → specific_date（近い順）→ anytime
    data.sort(function(a, b) {
      var urgentA = a.priority === 'urgent' ? 0 : 1;
      var urgentB = b.priority === 'urgent' ? 0 : 1;
      if (urgentA !== urgentB) return urgentA - urgentB;
      var timingOrder = { asap: 0, specific_date: 1, anytime: 2 };
      var tA = timingOrder[a.talk_timing || 'anytime'];
      var tB = timingOrder[b.talk_timing || 'anytime'];
      if (tA !== tB) return tA - tB;
      if ((a.talk_timing || 'anytime') === 'specific_date' && a.talk_date && b.talk_date) {
        return a.talk_date < b.talk_date ? -1 : 1;
      }
      return 0;
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
  var cat  = CATEGORIES[topic.category] || CATEGORIES.couple;
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
  if (!isHistory) {
    html += timingBadgeHtml(topic);
  }
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
    html += '<button class="btn-reopen" data-id="' + esc(topic.id) + '">↩ 話し合いに戻す</button>';
  } else {
    html += '<div class="topic-meta">' + esc(addedByLabel) + ' が追加 · ' + esc(formatRelativeDate(topic.created_at)) + '</div>';
  }

  card.innerHTML = html;

  if (!isHistory) {
    card.addEventListener('click', function() { showTopicModal(topic.id, topic); });
  } else {
    card.querySelector('.btn-reopen').addEventListener('click', function(e) {
      e.stopPropagation();
      reopenTopic(topic.id);
    });
  }

  return card;
}

// ===== 追加モーダル =====
function showAddModal() {
  selectedCategory = null;
  selectedPriority = 'normal';
  selectedTiming   = 'anytime';

  document.getElementById('topicTitleInput').value = '';
  document.getElementById('addError').textContent  = '';

  document.querySelectorAll('#catChips .cat-chip').forEach(function(c) { c.classList.remove('selected'); });
  document.getElementById('priorityNormal').classList.add('active');
  document.getElementById('priorityUrgent').classList.remove('active');

  document.querySelectorAll('#addTimingToggle .timing-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-timing') === 'anytime');
  });
  document.getElementById('timingDateWrap').style.display = 'none';
  document.getElementById('timingDateInput').value = '';

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
  document.querySelectorAll('#catChips .cat-chip').forEach(function(c) {
    c.classList.toggle('selected', c.getAttribute('data-cat') === cat);
  });
  document.getElementById('addError').textContent = '';
}

function selectPriority(priority) {
  selectedPriority = priority;
  document.getElementById('priorityNormal').classList.toggle('active', priority === 'normal');
  document.getElementById('priorityUrgent').classList.toggle('active', priority === 'urgent');
}

function selectTiming(timing) {
  selectedTiming = timing;
  document.querySelectorAll('#addTimingToggle .timing-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-timing') === timing);
  });
  document.getElementById('timingDateWrap').style.display = timing === 'specific_date' ? 'block' : 'none';
}

async function submitTopic() {
  var title = document.getElementById('topicTitleInput').value.trim();
  var errEl = document.getElementById('addError');
  var btn   = document.getElementById('addSubmitBtn');

  if (!title)            { errEl.textContent = 'タイトルを入力してください'; return; }
  if (!selectedCategory) { errEl.textContent = 'カテゴリを選んでください';   return; }

  var talkDate = null;
  if (selectedTiming === 'specific_date') {
    talkDate = document.getElementById('timingDateInput').value;
    if (!talkDate) { errEl.textContent = '日にちを選んでください'; return; }
  }
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
      talk_timing: selectedTiming,
      talk_date:   talkDate,
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

  var cat          = CATEGORIES[topicData.category] || CATEGORIES.couple;
  var addedByLabel = topicData.added_by === 'papa' ? 'パパ' : 'ママ';

  document.getElementById('topicModalContent').innerHTML =
    '<div class="topic-detail-badges">' +
      (topicData.priority === 'urgent'
        ? '<span class="badge badge-urgent">🔥 急ぎ</span>' : '') +
      '<span class="badge" style="background:' + cat.bg + ';color:' + cat.color + '">' +
        cat.emoji + ' ' + esc(cat.label) +
      '</span>' +
      timingBadgeHtml(topicData) +
    '</div>' +
    '<div class="topic-detail-title">' + esc(topicData.title) + '</div>' +
    '<div class="topic-detail-meta">' +
      esc(addedByLabel) + ' が ' + esc(formatDate(topicData.created_at)) + ' に追加' +
    '</div>';

  document.getElementById('newLogInput').value = '';
  var addLogBtn = document.getElementById('addLogBtn');
  addLogBtn.disabled    = false;
  addLogBtn.textContent = '📝 ログを追加';

  loadDiscussionLogs(topicId);

  document.getElementById('topicModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideTopicModal() {
  document.getElementById('topicModal').classList.remove('active');
  document.body.style.overflow = '';
  currentTopicId    = null;
  _currentTopicData = null;
}

// ===== 話し合いログ =====
async function loadDiscussionLogs(topicId) {
  var container = document.getElementById('discussionLogsList');
  container.innerHTML = '<p class="logs-empty" style="padding:8px">読み込み中…</p>';

  if (!await ensureDb()) return;

  try {
    var result = await db.from('discussion_logs')
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true });
    if (result.error) throw result.error;

    var logs = result.data || [];

    if (logs.length === 0) {
      container.innerHTML = '<p class="logs-empty">まだログはありません</p>';
      return;
    }

    container.innerHTML = '';
    logs.forEach(function(log) {
      var item  = document.createElement('div');
      item.className = 'log-item';
      var emoji = log.added_by === 'papa' ? '👨' : '👩';
      var name  = log.added_by === 'papa' ? 'パパ' : 'ママ';
      item.innerHTML =
        '<div class="log-meta">' + emoji + ' ' + esc(name) + ' · ' + esc(formatDateTime(log.created_at)) + '</div>' +
        '<div class="log-comment">' + esc(log.comment) + '</div>';
      container.appendChild(item);
    });

  } catch (err) {
    console.error('ログ読み込みエラー:', err);
    container.innerHTML = '<p class="logs-empty">読み込みに失敗しました</p>';
  }
}

async function addDiscussionLog() {
  if (!currentTopicId) return;
  var comment = document.getElementById('newLogInput').value.trim();
  if (!comment) return;

  var btn = document.getElementById('addLogBtn');
  btn.disabled    = true;
  btn.textContent = '追加中…';

  if (!await ensureDb()) {
    btn.disabled    = false;
    btn.textContent = '📝 ログを追加';
    return;
  }

  try {
    var result = await db.from('discussion_logs').insert({
      topic_id: currentTopicId,
      comment:  comment,
      added_by: currentUser
    });
    if (result.error) throw result.error;

    document.getElementById('newLogInput').value = '';
    loadDiscussionLogs(currentTopicId);

  } catch (err) {
    console.error('ログ追加エラー:', err);
    alert('ログの追加に失敗しました: ' + (err.message || JSON.stringify(err)));
  }

  btn.disabled    = false;
  btn.textContent = '📝 ログを追加';
}

// ===== 編集モーダル =====
function showEditModal() {
  if (!_currentTopicData) return;
  var t = _currentTopicData;

  selectedEditCategory = t.category;
  selectedEditPriority = t.priority;
  selectedEditTiming   = t.talk_timing || 'anytime';

  document.getElementById('editTitleInput').value = t.title;
  document.getElementById('editError').textContent = '';

  document.querySelectorAll('#editCatChips .cat-chip').forEach(function(c) {
    c.classList.toggle('selected', c.getAttribute('data-cat') === t.category);
  });

  document.getElementById('editPriorityNormal').classList.toggle('active', t.priority === 'normal');
  document.getElementById('editPriorityUrgent').classList.toggle('active', t.priority === 'urgent');

  document.querySelectorAll('#editTimingToggle .timing-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-timing') === selectedEditTiming);
  });
  document.getElementById('editTimingDateInput').value = t.talk_date || '';
  document.getElementById('editTimingDateWrap').style.display =
    selectedEditTiming === 'specific_date' ? 'block' : 'none';

  var btn = document.getElementById('editSubmitBtn');
  btn.disabled    = false;
  btn.textContent = '保存する';

  document.getElementById('topicModal').classList.remove('active');
  document.getElementById('editModal').classList.add('active');
}

function cancelEditModal() {
  document.getElementById('editModal').classList.remove('active');
  if (currentTopicId && _currentTopicData) {
    document.getElementById('topicModal').classList.add('active');
  } else {
    document.body.style.overflow = '';
  }
}

function hideEditModal() {
  document.getElementById('editModal').classList.remove('active');
  document.body.style.overflow = '';
}

function selectEditCategory(cat) {
  selectedEditCategory = cat;
  document.querySelectorAll('#editCatChips .cat-chip').forEach(function(c) {
    c.classList.toggle('selected', c.getAttribute('data-cat') === cat);
  });
}

function selectEditPriority(p) {
  selectedEditPriority = p;
  document.getElementById('editPriorityNormal').classList.toggle('active', p === 'normal');
  document.getElementById('editPriorityUrgent').classList.toggle('active', p === 'urgent');
}

function selectEditTiming(t) {
  selectedEditTiming = t;
  document.querySelectorAll('#editTimingToggle .timing-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-timing') === t);
  });
  document.getElementById('editTimingDateWrap').style.display =
    t === 'specific_date' ? 'block' : 'none';
}

async function submitEditTopic() {
  var title = document.getElementById('editTitleInput').value.trim();
  var errEl = document.getElementById('editError');
  var btn   = document.getElementById('editSubmitBtn');

  if (!title)               { errEl.textContent = 'タイトルを入力してください'; return; }
  if (!selectedEditCategory){ errEl.textContent = 'カテゴリを選んでください';   return; }

  var talkDate = null;
  if (selectedEditTiming === 'specific_date') {
    talkDate = document.getElementById('editTimingDateInput').value;
    if (!talkDate) { errEl.textContent = '日にちを選んでください'; return; }
  }
  errEl.textContent = '';

  btn.disabled    = true;
  btn.textContent = '保存中…';

  if (!await ensureDb()) {
    errEl.textContent = 'データベースに接続できません';
    btn.disabled = false; btn.textContent = '保存する';
    return;
  }

  try {
    var updateData = {
      title:       title,
      category:    selectedEditCategory,
      priority:    selectedEditPriority,
      talk_timing: selectedEditTiming,
      talk_date:   talkDate
    };
    var result = await db.from('topics').update(updateData).eq('id', currentTopicId);
    if (result.error) throw result.error;

    _currentTopicData = Object.assign({}, _currentTopicData, updateData);

    document.getElementById('editModal').classList.remove('active');
    loadTopics();
    showTopicModal(currentTopicId, _currentTopicData);

  } catch (err) {
    console.error('編集エラー:', err);
    errEl.textContent = '保存に失敗しました: ' + err.message;
    btn.disabled    = false;
    btn.textContent = '保存する';
  }
}

// ===== 削除 =====
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

  document.getElementById('topicModal').classList.remove('active');
  document.getElementById('resolveModal').classList.add('active');
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

// ===== 話し合いに戻す =====
async function reopenTopic(topicId) {
  if (!confirm('このトピックを「話し合いたいこと」に戻しますか？')) return;

  if (!await ensureDb()) { alert('データベースに接続できません'); return; }

  try {
    var result = await db.from('topics').update({
      is_resolved:     false,
      resolution_memo: null,
      resolved_at:     null
    }).eq('id', topicId);
    if (result.error) throw result.error;
    loadHistory();
  } catch (err) {
    console.error('戻すエラー:', err);
    alert('操作に失敗しました');
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

  // モーダル外クリックで閉じる
  ['addModal', 'topicModal', 'resolveModal', 'editModal'].forEach(function(id) {
    document.getElementById(id).addEventListener('click', function(e) {
      if (e.target.id !== id) return;
      if (id === 'addModal')     hideAddModal();
      if (id === 'topicModal')   hideTopicModal();
      if (id === 'resolveModal') hideResolveModal();
      if (id === 'editModal')    hideEditModal();
    });
  });

  // Escape で閉じる
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    hideAddModal();
    hideTopicModal();
    hideResolveModal();
    hideEditModal();
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

  await checkAuth();

  document.getElementById('authPassword').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') authenticate();
  });
});
