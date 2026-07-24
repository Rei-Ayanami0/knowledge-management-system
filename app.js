/* 桌面版将数据保存到“文档\知识管理系统数据”；浏览器模式使用浏览器本地存储。 */
const STORE = 'review-notebook-v1';
const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const modalRoot = document.querySelector('#modal-root');
const toastEl = document.querySelector('#toast');
let toastTimer;
let selectedIds = new Set();
const IMAGE_DATABASE = 'review-notebook-images-v1';
const IMAGE_STORE = 'images';
let imageDatabasePromise;
const desktopStorageEnabled = () => Boolean(window.desktopStorage);

function openImageDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('当前浏览器不支持图片数据库'));
  if (!imageDatabasePromise) imageDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(IMAGE_STORE)) request.result.createObjectStore(IMAGE_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return imageDatabasePromise;
}
async function putImageBlob(id, blob) { if (desktopStorageEnabled()) return window.desktopStorage.writeImage(id, await blob.arrayBuffer(), blob.type).then(result => { if (!result?.ok) throw new Error('图片文件保存失败'); }); const db = await openImageDatabase(); return new Promise((resolve, reject) => { const request = db.transaction(IMAGE_STORE, 'readwrite').objectStore(IMAGE_STORE).put(blob, id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
async function getImageBlob(id, mimeType = 'image/jpeg') { if (desktopStorageEnabled()) return window.desktopStorage.readImage(id).then(result => result?.bytes ? new Blob([result.bytes], { type:result.mimeType || mimeType }) : null); const db = await openImageDatabase(); return new Promise((resolve, reject) => { const request = db.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); }
async function showStoredImage(item) { const image = app.querySelector('.image-prompt img'); if (!image) return; try { const blob = await getImageBlob(item.imageId || item.id, item.imageMime); if (blob && image.isConnected) { const url = URL.createObjectURL(blob); image.src = url; image.onload = () => URL.revokeObjectURL(url); return; } } catch { /* 使用旧版数据兜底。 */ } if (item.imageData) image.src = item.imageData; }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const now = () => new Date().toISOString();
const escapeHtml = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c]));
function renderMath(source = '') {
  const renderPart = value => {
    let html = escapeHtml(value);
    html = html.replace(/\\sqrt(?:\[([^\]]+)\])?\{([^{}]*)\}/g, (_, index, radicand) => `<span class="math-root">${index ? `<sup>${renderPart(index)}</sup>` : ''}√<span class="math-radicand">${renderPart(radicand)}</span></span>`);
    html = html.replace(/\\sqrt\s*([A-Za-z0-9])/g, (_, radicand) => `<span class="math-root">√<span class="math-radicand">${radicand}</span></span>`);
    html = html.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, numerator, denominator) => `<span class="math-fraction"><span>${renderPart(numerator)}</span><span>${renderPart(denominator)}</span></span>`);
    html = html.replace(/\^\{([^{}]*)\}/g, (_, exponent) => `<sup>${renderPart(exponent)}</sup>`).replace(/_\{([^{}]*)\}/g, (_, subscript) => `<sub>${renderPart(subscript)}</sub>`);
    html = html.replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>').replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>');
    return html.replace(/\\pi/g, 'π').replace(/\\in/g, '∈').replace(/\\notin/g, '∉').replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠').replace(/\\times/g, '×').replace(/\\div/g, '÷');
  };
  return `<span class="math-display">${renderPart(source)}</span>`;
}
function nl(s = '') {
  return String(s).split(/(\$[^$\n]+\$)/g).map(part => part.startsWith('$') && part.endsWith('$') ? renderMath(part.slice(1, -1)) : escapeHtml(part)).join('').replace(/\n/g, '<br>');
}

function initialData() {
  const regular = uid(); const errors = uid(); const time = now();
  return {
    notebooks: [
      { id: regular, name: '我的复习本', system: false, createdAt: time, updatedAt: time },
      { id: errors, name: '错题本', system: true, createdAt: time, updatedAt: time }
    ],
    errorNotebookId: errors,
    items: [
      { id: uid(), notebookId: regular, prompt: 'raise ... by 5%', answer: '将……提高 5%', createdAt: time, updatedAt: time },
      { id: uid(), notebookId: regular, prompt: 'buying something', answer: '买某件东西', createdAt: time, updatedAt: time },
      { id: uid(), notebookId: regular, prompt: 'C语言的特点', answer: 'C语言是面向过程、可移植性高、高级、编译型语言。', createdAt: time, updatedAt: time }
    ]
  };
}
function load() { try { const content = desktopStorageEnabled() ? window.desktopStorage.readData() : localStorage.getItem(STORE); return JSON.parse(content) || initialData(); } catch { return initialData(); } }
let data = load();
function darkModeEnabled() { return data.settings?.darkMode === true; }
function applyTheme() { document.documentElement.classList.toggle('dark-theme', darkModeEnabled()); }
applyTheme();
let activeSubject = 'all';
function save() { const content = JSON.stringify(data); if (desktopStorageEnabled()) { if (!window.desktopStorage.writeData(content)) throw new Error('本地数据文件保存失败'); } else localStorage.setItem(STORE, content); }
function totalReviewCount() { return Math.max(0, Number(data.statistics?.totalReviewed) || 0); }
function recordReview() {
  data.statistics ||= {};
  data.statistics.totalReviewed = totalReviewCount() + 1;
  save();
  const counter = nav.querySelector('[data-total-reviewed]');
  if (counter) counter.textContent = `累计学习：${totalReviewCount()}`;
}
async function initializeImageDatabase() {
  const legacyImages = data.items.filter(item => item.type === 'image' && item.imageData);
  for (const item of legacyImages) {
    try {
      const blob = await (await fetch(item.imageData)).blob();
      await putImageBlob(item.imageId || item.id, blob);
      item.imageId ||= item.id; item.imageMime ||= blob.type || 'image/jpeg'; delete item.imageData;
    } catch { /* 保留旧数据，避免迁移失败造成图片丢失。 */ }
  }
  if (legacyImages.some(item => !item.imageData)) save();
}
function findBook(id) { return data.notebooks.find(b => b.id === id); }
function bookSubject(book) { return String(book?.subject || '').trim(); }
function bookItems(id) { return data.items.filter(i => i.notebookId === id); }
function shuffled(ids) { return [...ids].sort(() => Math.random() - .5); }
function reviewWeight(itemId) { return Math.min(3, Math.max(-3, Number(data.reviewWeights?.[itemId]) || 0)); }
function weightedReviewShuffle(ids) {
  return [...ids]
    .map(id => ({ id, key: Math.random() ** (1 / Math.max(.25, 1 + reviewWeight(id) * .5)) }))
    .sort((a, b) => b.key - a.key)
    .map(entry => entry.id);
}
function adjustReviewWeight(itemId, change) {
  data.reviewWeights ||= {};
  const next = Math.min(3, Math.max(-3, reviewWeight(itemId) + change));
  if (next === 0) delete data.reviewWeights[itemId]; else data.reviewWeights[itemId] = next;
  save();
  return next;
}
function drawReviewRound(bookId, count) {
  const ids = bookItems(bookId).map(item => item.id); if (!ids.length) return [];
  data.reviewProgress ||= {};
  let progress = data.reviewProgress[bookId];
  if (!progress || !Array.isArray(progress.remainingIds)) progress = data.reviewProgress[bookId] = { remainingIds:weightedReviewShuffle(ids), knownIds:[...ids] };
  const validIds = new Set(ids); const knownIds = new Set(progress.knownIds || []);
  progress.remainingIds = progress.remainingIds.filter(id => validIds.has(id));
  const addedIds = ids.filter(id => !knownIds.has(id));
  if (addedIds.length) progress.remainingIds.push(...weightedReviewShuffle(addedIds));
  progress.knownIds = [...ids];
  if (!progress.remainingIds.length) progress.remainingIds = weightedReviewShuffle(ids);
  const roundIds = progress.remainingIds.splice(0, Math.min(count, progress.remainingIds.length));
  save(); return roundIds;
}
function toast(message) { toastEl.textContent = message; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200); }
function setNav() { document.querySelector('.brand').textContent = '知识管理系统'; nav.innerHTML = `<span class="total-reviewed" data-total-reviewed>累计学习：${totalReviewCount()}</span><button type="button" data-nav="notebooks">复习本</button><button type="button" data-nav="errors">错题本</button><button type="button" data-nav="settings">设置</button><button type="button" data-nav="about">关于系统</button>`; }
function go(hash) { location.hash = hash; }

function home() {
  app.onmouseup = null; app.ontouchend = null;
  const subjects = [...new Set(data.notebooks.filter(book => !book.system).map(bookSubject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const visibleBooks = data.notebooks.filter(book => {
    if (activeSubject === 'all') return true;
    if (activeSubject === 'uncategorized') return !book.system && !bookSubject(book);
    return !book.system && bookSubject(book) === activeSubject;
  });
  const cards = visibleBooks.map(book => {
    const count = bookItems(book.id).length;
    const category = book.system ? '系统复习本' : (bookSubject(book) || '未分类');
    return `<article class="notebook-card ${book.system ? 'error' : ''}" data-book-card="${book.id}">
      <div><h2>${escapeHtml(book.name)}</h2><p class="book-subject">${escapeHtml(category)}</p><p class="subtle">${count} 条知识点${book.system ? ' · 重点复习内容' : ''}</p></div>
      <div class="card-actions"><button class="button dark" data-action="study" data-id="${book.id}">开始复习</button><button class="button" data-action="manage" data-id="${book.id}">管理</button></div>
    </article>`;
  }).join('');
  const filterButton = (id, label) => `<button class="button ${activeSubject === id ? 'dark' : ''}" data-action="filter-subject" data-subject="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
  app.innerHTML = `<section class="home-page"><div class="home-content">
    <div class="subject-filter" aria-label="按学科筛选"><span class="subject-filter-label">学科分类</span>${filterButton('all', '全部')}${subjects.map(subject => filterButton(subject, subject)).join('')}${filterButton('uncategorized', '未分类')}</div>
    <div class="notebook-grid">${cards || '<div class="subject-empty"><p>该学科暂时没有复习本。</p></div>'}</div>
    <p class="subject-reorder-hint">长按复习本可拖动排序。</p>
  </div></section>`;
  enableNotebookReorder();
}
function saveNotebookOrder(grid) {
  const visibleIds = new Set([...grid.querySelectorAll('[data-book-card]')].map(card => card.dataset.bookCard));
  const orderedVisibleBooks = [...grid.querySelectorAll('[data-book-card]')].map(card => findBook(card.dataset.bookCard));
  let visibleIndex = 0;
  data.notebooks = data.notebooks.map(book => visibleIds.has(book.id) ? orderedVisibleBooks[visibleIndex++] : book);
  save();
}
function moveCardBeforePointer(grid, card, clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)?.closest('[data-book-card]');
  if (!target || target === card || !grid.contains(target)) return;
  const box = target.getBoundingClientRect();
  const before = clientY < box.top + box.height / 2 || (clientY <= box.bottom && clientX < box.left + box.width / 2);
  grid.insertBefore(card, before ? target : target.nextSibling);
}
function enableNotebookReorder() {
  const grid = app.querySelector('.notebook-grid'); if (!grid) return;
  let pressedCard = null; let dragTimer = null; let dragging = false; let startX = 0; let startY = 0; let activePointerId = null;
  const cancelPress = () => { clearTimeout(dragTimer); dragTimer = null; if (pressedCard) pressedCard.classList.remove('dragging'); pressedCard = null; dragging = false; activePointerId = null; };
  grid.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const card = event.target.closest('[data-book-card]'); if (!card) return;
    pressedCard = card; startX = event.clientX; startY = event.clientY; activePointerId = event.pointerId;
    dragTimer = setTimeout(() => {
      if (!pressedCard) return;
      dragging = true; pressedCard.classList.add('dragging');
      try { grid.setPointerCapture(activePointerId); } catch {}
      navigator.vibrate?.(20); toast('已进入排序模式，拖动卡片即可换位。');
    }, 400);
  });
  grid.addEventListener('pointermove', event => {
    if (!pressedCard || event.pointerId !== activePointerId) return;
    if (!dragging && Math.hypot(event.clientX - startX, event.clientY - startY) > 10) { cancelPress(); return; }
    if (dragging) { event.preventDefault(); moveCardBeforePointer(grid, pressedCard, event.clientX, event.clientY); }
  });
  const finishReorder = event => {
    if (!pressedCard || event.pointerId !== activePointerId) return;
    if (dragging) { saveNotebookOrder(grid); event.preventDefault(); }
    cancelPress();
  };
  grid.addEventListener('pointerup', finishReorder); grid.addEventListener('pointercancel', cancelPress); grid.addEventListener('lostpointercapture', cancelPress);
}
function management(bookId) {
  const book = findBook(bookId); if (!book) return home();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = params.get('q') || '';
  const sortOrder = params.get('order') === 'desc' ? 'desc' : 'asc';
  const matchedItems = bookItems(bookId).filter(i => `${i.prompt}\n${i.answer}`.toLowerCase().includes(filter.toLowerCase()));
  const items = sortOrder === 'asc' ? matchedItems : [...matchedItems].reverse();
  const rows = items.length ? items.map((item, index) => { const serial = sortOrder === 'asc' ? index + 1 : items.length - index; const title = item.type === 'image' ? `图片：${escapeHtml(item.prompt)}` : nl(item.prompt); return `<tr><td class="select-cell"><input type="checkbox" data-select-item="${item.id}" ${selectedIds.has(item.id) ? 'checked' : ''} aria-label="选择第 ${serial} 条" /></td><td class="number">${serial}</td><td>${title}</td><td><div class="action-row"><button class="button" data-action="edit-item" data-id="${item.id}">编辑</button><button class="button danger" data-action="delete-item" data-id="${item.id}">删除</button></div></td></tr>`; }).join('') : `<tr><td colspan="4" class="subtle">${filter ? '没有匹配的知识点。' : '还没有知识点，请使用“批量导入知识点”或“批量导入词汇”录入。'}</td></tr>`;
  const allChecked = items.length && items.every(item => selectedIds.has(item.id));
  app.innerHTML = `<section><button class="button manage-back" data-action="home">← 返回</button><div class="page-head management-head"><div class="management-book-info"><h1>${escapeHtml(book.name)}</h1><p class="subtle">${bookItems(bookId).length} 条知识点</p></div><div class="action-row management-actions"><button class="button" data-action="rename-book" data-id="${bookId}">改名</button><button class="button" data-action="review-settings" data-id="${bookId}">复习设置</button><button class="button" data-action="bulk-import" data-book="${bookId}">批量导入词汇</button><button class="button" data-action="bulk-import-knowledge" data-book="${bookId}">批量导入知识点</button><button class="button" data-action="bulk-export" data-book="${bookId}">批量导出</button><button class="button danger" data-action="batch-delete" data-book="${bookId}">批量删除</button>${book.system ? '' : '<button class="button danger" data-action="delete-book" data-id="'+bookId+'">删除复习本</button>'}</div></div><div class="toolbar"><input class="search" id="search" value="${escapeHtml(filter)}" placeholder="搜索知识点或答案" /><button class="button" data-action="search" data-id="${bookId}" data-order="${sortOrder}">搜索</button><div class="order-actions"><button class="button ${sortOrder === 'asc' ? 'dark' : ''}" data-action="set-order" data-id="${bookId}" data-order="asc">正序查看</button><button class="button ${sortOrder === 'desc' ? 'dark' : ''}" data-action="set-order" data-id="${bookId}" data-order="desc">倒序查看</button></div></div><div class="table-wrap"><table><thead><tr><th class="select-cell"><input type="checkbox" data-select-all ${allChecked ? 'checked' : ''} aria-label="全选" /></th><th class="number">序号</th><th>题干 / 知识点</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  const choiceImportButton = document.createElement('button');
  choiceImportButton.type = 'button';
  choiceImportButton.className = 'button';
  choiceImportButton.textContent = '批量导入单选题';
  choiceImportButton.onclick = event => { event.stopPropagation(); bulkChoiceImport(bookId); };
  const imageImportButton = document.createElement('button');
  imageImportButton.type = 'button';
  imageImportButton.className = 'button';
  imageImportButton.textContent = '导入图片';
  imageImportButton.onclick = event => { event.stopPropagation(); imageItemModal(bookId); };
  const exportButton = app.querySelector('[data-action="bulk-export"]');
  exportButton.parentElement.insertBefore(imageImportButton, exportButton);
  exportButton.parentElement.insertBefore(choiceImportButton, exportButton);
  app.onchange = event => { const input = event.target; if (input.matches('[data-select-item]')) { input.checked ? selectedIds.add(input.dataset.selectItem) : selectedIds.delete(input.dataset.selectItem); } if (input.matches('[data-select-all]')) { items.forEach(item => input.checked ? selectedIds.add(item.id) : selectedIds.delete(item.id)); management(bookId); } };
}
function reviewSettings(bookId, startAfterSave = true) {
  const book = findBook(bookId); const total = bookItems(bookId).length;
  if (!book) return home();
  if (!total) return study(bookId);
  data.reviewCounts ||= {};
  const savedCount = Math.min(Math.max(Number(data.reviewCounts[bookId]) || Math.min(20, total), 1), total);
  modal('设置每轮复习数量', `<p class="subtle">${escapeHtml(book.name)}共有 ${total} 条知识点。未出现的内容会优先抽取，全部出现前不会重复。</p><label class="field">每轮复习数量<input name="count" type="text" inputmode="numeric" pattern="[0-9]*" value="${savedCount}" required autofocus /></label><p class="import-help">按当前数量，约 ${Math.ceil(total / savedCount)} 轮可覆盖全部内容；如需两轮覆盖，每轮至少设为 ${Math.ceil(total / 2)} 条。保存后会记住此数量。</p>`, fd => {
    const count = Math.min(Math.max(Number(fd.get('count')) || 1, 1), total);
    data.reviewCounts[bookId] = count; save(); modalRoot.innerHTML = ''; if (startAfterSave) study(bookId, count); else management(bookId);
  });
  modalRoot.querySelector('button[type="submit"]').textContent = startAfterSave ? '开始复习' : '保存设置';
}
function startReview(bookId) {
  const total = bookItems(bookId).length; if (!total) return study(bookId);
  const savedCount = Number(data.reviewCounts?.[bookId]);
  if (!Number.isInteger(savedCount) || savedCount < 1) return reviewSettings(bookId);
  study(bookId, Math.min(savedCount, total));
}
function study(bookId, roundSize) {
  const book = findBook(bookId); const items = bookItems(bookId);
  if (!book) return home();
  if (!items.length) { app.innerHTML = `<section class="empty"><h2>${escapeHtml(book.name)}还没有内容</h2><p class="subtle">请先添加知识点，再开始复习。</p><button class="button dark" data-action="manage" data-id="${bookId}">去添加知识点</button></section>`; return; }
  const count = Math.min(Math.max(Number(roundSize) || items.length, 1), items.length);
  let order = drawReviewRound(bookId, count); let position = 0; let revealed = false;
  const renderCard = () => { const item = data.items.find(i => i.id === order[position]); if (!item) return study(bookId); const hasAnswer = Boolean(item.answer.trim()); const cardType = hasAnswer ? '快速阅读' : '知识点'; const nextLabel = hasAnswer && !revealed ? '查看答案 →' : '下一条 →'; app.innerHTML = `<section class="study"><div class="study-top"><button class="button" data-action="home">← 返回</button><span>${escapeHtml(book.name)} · ${position + 1} / ${order.length}</span></div><div class="study-card ${hasAnswer ? '' : 'knowledge-card'}"><span class="card-type">${cardType}</span><div class="prompt">${nl(item.prompt)}</div></div>${hasAnswer ? `<div class="reveal ${revealed ? '' : 'hidden'}">${revealed ? `<span class="answer">${nl(item.answer)}</span>` : '点击下方“查看答案”'}</div>` : ''}<div class="study-actions"><button class="button" data-action="previous" ${position === 0 ? 'disabled' : ''}>← 上一条</button><button class="button" data-action="mark" data-id="${item.id}">重点复习</button><button class="button" data-action="edit-study" data-id="${item.id}">修改知识点</button><button class="button dark" data-action="next">${nextLabel}</button></div></section>`; };
  const studyObserver = new MutationObserver(() => {
    const actions = app.querySelector('.study-actions');
    if (!actions) { studyObserver.disconnect(); return; }
    if (actions.querySelector('[data-action="delete-study"]')) return;
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'button danger';
    deleteButton.dataset.action = 'delete-study';
    deleteButton.textContent = '删除此条';
    deleteButton.onclick = event => {
      event.stopPropagation();
      const currentId = order[position];
      const current = data.items.find(entry => entry.id === currentId && entry.notebookId === bookId);
      if (!current || !confirm(`确定从“${book.name}”删除这条内容吗？`)) return;
      data.items = data.items.filter(entry => entry.id !== current.id);
      selectedIds.delete(current.id);
      if (data.reviewProgress?.[bookId]) data.reviewProgress[bookId].remainingIds = data.reviewProgress[bookId].remainingIds.filter(id => id !== current.id);
      save();
      order.splice(position, 1);
      if (!order.length) { study(bookId, Math.min(count, bookItems(bookId).length)); return; }
      if (position >= order.length) position = 0;
      revealed = false;
      toast('已从当前复习本删除此条内容。');
      renderCard();
    };
    const nextButton = actions.querySelector('[data-action="next"]');
    const nextActions = document.createElement('div');
    nextActions.className = 'study-next-actions';
    actions.insertBefore(nextActions, nextButton);
    nextActions.append(nextButton, deleteButton);
  });
  studyObserver.observe(app, { childList:true, subtree:true });
  const handleSelectedWord = () => { setTimeout(() => { const selection = window.getSelection(); const selectedText = selection?.toString().trim().replace(/\s+/g, ' '); const node = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement; if (!selectedText || !node?.closest('.study-card, .reveal') || !isLikelyEnglish(selectedText) || modalRoot.innerHTML) return; selection.removeAllRanges(); selectedWordModal(selectedText); }, 0); };
  app.onmouseup = handleSelectedWord; app.ontouchend = handleSelectedWord;
  app.onclick = event => { const button = event.target.closest('button'); if (!button) return; const action = button.dataset.action; if (action === 'previous') { if (position > 0) { position -= 1; revealed = false; renderCard(); } return; } if (action === 'next') { const current = data.items.find(i => i.id === order[position]); if (current?.answer?.trim() && !revealed) { revealed = true; renderCard(); return; } position += 1; if (position >= order.length) { order = drawReviewRound(bookId, count); position = 0; toast(`本轮复习完成，已开始下一轮（${order.length} 条，优先未出现内容）。`); } revealed = false; renderCard(); return; } if (action === 'edit-study') { const current = data.items.find(i => i.id === button.dataset.id); if (current) itemModal(bookId, current, renderCard); return; } if (action === 'mark') { markImportant(button.dataset.id); return; } if (action === 'home') { app.onclick = handleClick; app.onmouseup = null; app.ontouchend = null; home(); if (location.hash !== '#home') location.hash = '#home'; } };
  renderCard();
}
function study(bookId, roundSize) {
  const book = findBook(bookId); const initialItems = bookItems(bookId);
  if (!book) return home();
  if (!initialItems.length) {
    app.onmouseup = null; app.ontouchend = null;
    app.innerHTML = `<section class="empty"><h2>${escapeHtml(book.name)}还没有内容</h2><p class="subtle">请先添加知识点，再开始复习。</p><div class="empty-actions"><button class="button dark" data-action="manage">去添加知识点</button><button class="button" data-action="home">返回主页</button></div></section>`;
    app.onclick = event => {
      const action = event.target.closest('button')?.dataset.action;
      if (action === 'manage') { app.onclick = handleClick; go(`#manage/${bookId}`); return; }
      if (action === 'home') { app.onclick = handleClick; home(); if (location.hash !== '#home') location.hash = '#home'; }
    };
    return;
  }
  const count = Math.min(Math.max(Number(roundSize) || initialItems.length, 1), initialItems.length);
  let order = drawReviewRound(bookId, count); let position = 0; let revealed = false; let selectedChoice = '';
  const advance = () => {
    recordReview();
    position += 1;
    if (position >= order.length) { order = drawReviewRound(bookId, count); position = 0; toast(`本轮复习完成，已开始下一轮（${order.length} 条，优先未出现内容）。`); }
    revealed = false; selectedChoice = ''; renderCard();
  };
  const renderChoice = item => {
    const letters = ['A','B','C','D'];
    const options = letters.map(letter => {
      const state = revealed ? (letter === item.answer ? ' correct' : selectedChoice === letter ? ' wrong' : '') : (selectedChoice === letter ? ' selected' : '');
      return `<button type="button" class="choice-option${state}" data-choice="${letter}" ${revealed ? 'disabled' : ''}><span class="choice-letter">${letter}.</span><span>${nl(item.options?.[letter] || '')}</span></button>`;
    }).join('');
    const feedback = revealed ? `<div class="choice-feedback ${selectedChoice === item.answer ? 'correct' : 'wrong'}"><p>你的答案：${selectedChoice}　参考答案：${item.answer}</p>${item.analysis ? `<p>解析：${nl(item.analysis)}</p>` : '<p>暂无解析。</p>'}</div>` : '<div class="choice-feedback choice-feedback-placeholder" aria-hidden="true"></div>';
    return `<div class="choice-options">${options}</div>${feedback}`;
  };
  const renderTranslation = item => revealed
    ? `<div class="translation-practice translation-result"><div class="translation-result-head"><p>输入不完全一致，正确英文：</p></div><span class="answer">${nl(item.answer)}</span><p class="subtle">已提高此条后续复习优先级。按 Enter 可立即重新输入，点击“下一条”继续。</p></div>`
    : `<div class="translation-practice"><label for="translation-answer">根据中文写出英文（需完全一致）</label><textarea id="translation-answer" name="translation-answer" rows="2" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="在此输入英文"></textarea></div>`;
  const renderCard = () => {
    const item = data.items.find(i => i.id === order[position]); if (!item) return study(bookId, count);
    const isChoice = item.type === 'choice'; const isTranslation = item.type === 'translation'; const isImage = item.type === 'image'; const hasAnswer = Boolean(item.answer?.trim());
    const cardType = isChoice ? '单选题' : isTranslation ? '练习翻译' : isImage ? '图片复习' : hasAnswer ? '快速阅读' : '知识点';
    const nextLabel = isChoice ? (revealed ? '下一题 →' : '请选择答案') : isTranslation ? (revealed ? '下一条 →' : '提交翻译') : hasAnswer && !revealed ? '查看答案 →' : '下一条 →';
    const answerArea = isChoice ? renderChoice(item) : isTranslation ? renderTranslation(item) : hasAnswer ? `<div class="reveal ${revealed ? '' : 'hidden'}">${revealed ? `<span class="answer">${nl(item.answer)}</span>` : '点击下方“查看答案”'}</div>` : '';
    const imageScale = [50, 75, 100].includes(Number(item.imageScale)) ? Number(item.imageScale) : 100;
    const cardContent = isImage ? `<div class="image-prompt" style="--image-scale:${imageScale}%"><img src="${escapeHtml(item.imageData || '')}" alt="${escapeHtml(item.prompt)}" /></div>` : `<div class="prompt">${nl(item.prompt)}</div>`;
    app.innerHTML = `<section class="study ${isChoice && revealed ? 'choice-revealed' : ''} ${isTranslation && revealed ? 'translation-revealed' : ''}"><div class="study-top"><button class="button" data-action="home">← 返回</button><div class="study-status"><button class="button danger study-delete" data-action="delete-study" data-id="${item.id}">删除此条</button><span>${escapeHtml(book.name)} · ${position + 1} / ${order.length}</span></div></div><div class="study-card ${isChoice ? 'choice-card' : isImage ? 'image-card' : hasAnswer ? '' : 'knowledge-card'}"><span class="card-type">${cardType}</span>${cardContent}</div>${answerArea}<div class="study-actions"><button class="button" data-action="previous" ${position === 0 ? 'disabled' : ''}>← 上一条</button><div class="study-main-actions"><button class="button" data-action="edit-study" data-id="${item.id}">修改知识点</button><button class="button" data-action="mark" data-id="${item.id}">重点复习</button></div><div class="study-next-group"><button class="button dark" data-action="next">${nextLabel}</button><div class="study-weight-actions"><button class="button" data-action="need-review" data-id="${item.id}">需复习</button><button class="button" data-action="familiar" data-id="${item.id}">已熟悉</button></div></div></div></section>`;
    if (isImage) showStoredImage(item);
  };
  app.onmouseup = null; app.ontouchend = null;
  app.oncontextmenu = event => {
    const selection = window.getSelection(); const selectedText = selection?.toString().trim().replace(/\s+/g, ' ');
    const node = event.target?.nodeType === Node.ELEMENT_NODE ? event.target : event.target?.parentElement;
    if (!selectedText || !node?.closest('.study-card, .reveal, .translation-practice, .choice-options, .choice-feedback') || modalRoot.innerHTML) return;
    event.preventDefault(); selection.removeAllRanges(); selectedTextNotebookModal(selectedText);
  };
  app.onkeydown = event => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const current = data.items.find(entry => entry.id === order[position]);
    if (current?.type !== 'translation') return;
    event.preventDefault();
    if (revealed) {
      revealed = false;
      renderCard();
      requestAnimationFrame(() => app.querySelector('[name="translation-answer"]')?.focus());
      return;
    }
    if (event.target.matches('[name="translation-answer"]')) app.querySelector('[data-action="next"]')?.click();
  };
  app.onclick = event => {
    const button = event.target.closest('button'); if (!button) return;
    const item = data.items.find(i => i.id === order[position]); if (!item) return;
    if (button.dataset.choice && item.type === 'choice' && !revealed) { selectedChoice = button.dataset.choice; revealed = true; renderCard(); return; }
    const action = button.dataset.action;
    if (action === 'previous') { if (position > 0) { position -= 1; revealed = false; selectedChoice = ''; renderCard(); } return; }
    if (action === 'next') {
      if (item.type === 'translation' && !revealed) {
        const userAnswer = String(app.querySelector('[name="translation-answer"]')?.value || '').trim();
        const expectedAnswer = String(item.answer || '').trim();
        if (!userAnswer) { toast('请先输入英文翻译。'); return; }
        if (userAnswer === expectedAnswer) { toast('翻译正确。'); advance(); return; }
        adjustReviewWeight(item.id, 1); revealed = true; renderCard(); return;
      }
      if (item.type === 'choice' && !revealed) { toast('请先选择一个答案。'); return; }
      if (item.answer?.trim() && !revealed) { revealed = true; renderCard(); return; }
      advance(); return;
    }
    if (action === 'retry-translation') { revealed = false; renderCard(); app.querySelector('[name="translation-answer"]')?.focus(); return; }
    if (action === 'edit-study') { if (item.type === 'choice') choiceItemModal(bookId, item, renderCard); else if (item.type === 'image') imageItemModal(bookId, item, renderCard); else itemModal(bookId, item, renderCard); return; }
    if (action === 'delete-study') {
      if (!directDeleteEnabled() && !confirm(`确定从“${book.name}”删除这条内容吗？`)) return;
      data.items = data.items.filter(entry => entry.id !== item.id); selectedIds.delete(item.id);
      if (data.reviewProgress?.[bookId]) data.reviewProgress[bookId].remainingIds = data.reviewProgress[bookId].remainingIds.filter(id => id !== item.id);
      save(); order.splice(position, 1);
      if (!order.length) { study(bookId, Math.min(count, bookItems(bookId).length)); return; }
      if (position >= order.length) position = 0;
      revealed = false; selectedChoice = ''; toast('已从当前复习本删除此条内容。'); renderCard(); return;
    }
    if (action === 'need-review') { const level = adjustReviewWeight(item.id, 1); toast(`已提高后续复习权重（${level}/3）。`); return; }
    if (action === 'familiar') { const level = adjustReviewWeight(item.id, -1); toast(`已降低后续复习权重（${level}/3）。`); return; }
    if (action === 'mark') {
      markImportant(item.id, () => {
        data.items = data.items.filter(entry => entry.id !== item.id);
        selectedIds.delete(item.id);
        if (data.reviewProgress?.[bookId]) data.reviewProgress[bookId].remainingIds = data.reviewProgress[bookId].remainingIds.filter(id => id !== item.id);
        save();
        order.splice(position, 1);
        if (!order.length) { study(bookId, Math.min(count, bookItems(bookId).length)); return; }
        if (position >= order.length) position = 0;
        revealed = false;
        selectedChoice = '';
        toast('已加入复习本，并删除当前条目。');
        renderCard();
      });
      return;
    }
    if (action === 'home') { app.onclick = handleClick; app.onmouseup = null; app.ontouchend = null; app.oncontextmenu = null; app.onkeydown = null; home(); if (location.hash !== '#home') location.hash = '#home'; }
  };
  renderCard();
}
function addImportantToBook(item, targetBookId) {
  const targetBook = findBook(targetBookId);
  if (!targetBook || targetBook.id === item.notebookId) return null;
  const sourceId = item.sourceId || item.id;
  const exists = data.items.some(entry => entry.notebookId === targetBookId && (entry.sourceId || entry.id) === sourceId);
  if (!exists) data.items.push({ ...item, id:uid(), notebookId:targetBookId, sourceId, createdAt:now(), updatedAt:now() });
  data.importantNotebookId = targetBookId;
  save();
  return { targetBook, exists };
}
function markImportant(itemId, onPracticeAdded) {
  const item = data.items.find(entry => entry.id === itemId);
  if (!item) return;
  const books = data.notebooks.filter(book => book.id !== item.notebookId);
  if (!books.length) { toast('没有其他可添加的复习本。'); return; }
  const lastBookId = data.importantNotebookId;
  if (practiceModeEnabled() && books.some(book => book.id === lastBookId)) {
    const result = addImportantToBook(item, lastBookId);
    if (result) {
      recordReview();
      if (typeof onPracticeAdded === 'function') { onPracticeAdded(); return; }
    }
  }
  const defaultBookId = books.some(book => book.id === lastBookId)
    ? lastBookId
    : (findBook(data.errorNotebookId) && data.errorNotebookId !== item.notebookId ? data.errorNotebookId : books[0].id);
  const options = books.map(book => `<option value="${book.id}" ${book.id === defaultBookId ? 'selected' : ''}>${escapeHtml(book.name)}</option>`).join('');
  modal('添加重点复习', `<p>选择要加入的复习本。</p><label class="field">复习本<select name="notebookId">${options}</select></label>`, fd => {
    const result = addImportantToBook(item, String(fd.get('notebookId') || ''));
    if (!result) { toast('请选择有效的复习本。'); return; }
    modalRoot.innerHTML = '';
    recordReview();
    if (practiceModeEnabled() && typeof onPracticeAdded === 'function') { onPracticeAdded(); return; }
    toast(result.exists ? `“${result.targetBook.name}”中已有这条内容。` : `已加入“${result.targetBook.name}”。`);
  });
  modalRoot.querySelector('button[type="submit"]').textContent = '添加';
}
function selectedWordModal(word) {
  const answer = lookupOfflineTranslation(word);
  if (!answer) { alert(`“${word}”未在本地离线词典中找到中文释义，未加入生词本。`); return; }
  const books = data.notebooks.filter(book => !book.system);
  if (!books.length) { toast('请先新建一个复习本。'); return; }
  const defaultBookId = findBook(data.vocabNotebookId) && !findBook(data.vocabNotebookId).system ? data.vocabNotebookId : books[0].id;
  const options = books.map(book => `<option value="${book.id}" ${book.id === defaultBookId ? 'selected' : ''}>${escapeHtml(book.name)}</option>`).join('');
  modal('加入生词本', `<p>将 <strong>${escapeHtml(word)}</strong> 加入生词本。</p><p class="subtle">中文释义：${escapeHtml(answer)}</p><label class="field">选择复习本<select name="notebookId">${options}</select></label><p class="import-help">本次选择会作为以后选词时的默认生词本。</p>`, fd => {
    const notebookId = String(fd.get('notebookId') || ''); const targetBook = findBook(notebookId);
    if (!targetBook || targetBook.system) return;
    data.vocabNotebookId = notebookId;
    if (bookItems(notebookId).some(item => normalizedPrompt(item.prompt) === normalizedPrompt(word))) { save(); modalRoot.innerHTML = ''; toast(`“${word}”已在${targetBook.name}中。`); return; }
    const time = now(); data.items.push({ id:uid(), notebookId, prompt:word, answer, createdAt:time, updatedAt:time }); save(); modalRoot.innerHTML = ''; toast(`已加入${targetBook.name}。`);
  });
  modalRoot.querySelector('button[type="submit"]').textContent = '加入';
}
function selectedTextNotebookModal(text) {
  const books = data.notebooks;
  if (!books.length) { toast('请先新建一个复习本。'); return; }
  const translation = isLikelyEnglish(text) ? lookupOfflineTranslation(text) : '';
  const defaultBookId = books.some(book => book.id === data.selectedTextNotebookId) ? data.selectedTextNotebookId : books[0].id;
  const options = books.map(book => `<option value="${book.id}" ${book.id === defaultBookId ? 'selected' : ''}>${escapeHtml(book.name)}${book.system ? '（系统复习本）' : ''}</option>`).join('');
  modal('加入复习本', `<p class="subtle">右键后自动识别英文释义；识别不到时可自行填写。</p><label class="field">选中文字<textarea name="prompt" required>${escapeHtml(text)}</textarea></label><label class="field">中文释义 / 答案<textarea name="answer" placeholder="${translation ? '' : '未识别到自动释义，可选填'}">${escapeHtml(translation)}</textarea></label><label class="field">加入到<select name="notebookId">${options}</select></label>`, fd => {
    const prompt = String(fd.get('prompt') || '').trim(); const answer = String(fd.get('answer') || '').trim(); const notebookId = String(fd.get('notebookId') || ''); const targetBook = findBook(notebookId);
    if (!prompt || !targetBook) { toast('请选择有效复习本并保留文字内容。'); return; }
    if (bookItems(notebookId).some(item => normalizedPrompt(item.prompt) === normalizedPrompt(prompt))) { data.selectedTextNotebookId = notebookId; save(); modalRoot.innerHTML = ''; toast(`“${targetBook.name}”中已有相同内容。`); return; }
    const time = now(); data.items.push({ id:uid(), notebookId, prompt, answer, createdAt:time, updatedAt:time }); data.selectedTextNotebookId = notebookId; save(); modalRoot.innerHTML = ''; toast(`已加入“${targetBook.name}”。`);
  });
  modalRoot.querySelector('button[type="submit"]').textContent = '加入';
  const textArea = modalRoot.querySelector('textarea[name="prompt"]');
  textArea?.addEventListener('keydown', event => event.stopPropagation());
  requestAnimationFrame(() => { if (textArea) { textArea.focus(); textArea.setSelectionRange(textArea.value.length, textArea.value.length); } });
  enableTextareaEditing();
}
function modal(title, inner, onSubmit, className = '') { modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal ${className}"><h2>${title}</h2>${inner}<div class="modal-actions"><button class="button dark" type="submit">保存</button><button class="button" type="button" data-close>取消</button></div></form></div>`; const form = modalRoot.querySelector('form'); form.querySelector('[data-close]').onclick = () => modalRoot.innerHTML = ''; form.onsubmit = e => { e.preventDefault(); onSubmit(new FormData(form)); }; requestAnimationFrame(() => { const input = form.querySelector('[autofocus], input:not([type="checkbox"]):not([type="file"]), textarea, select'); if (input) { input.focus(); if (input instanceof HTMLInputElement && input.type === 'text') input.select(); } }); }
function enlargeImportModal() { requestAnimationFrame(() => { const modalEl = modalRoot.querySelector('.modal'); const textarea = modalRoot.querySelector('textarea[name="bulk"]'); if (!modalEl || !textarea) return; textarea.style.minHeight = `${Math.ceil(textarea.getBoundingClientRect().height * 1.2)}px`; modalEl.style.minHeight = `${Math.ceil(modalEl.getBoundingClientRect().height * 1.2)}px`; }); }
function enableTextareaEditing() {
  modalRoot.querySelectorAll('textarea').forEach(textarea => {
    // 点击输入框下方尚未写内容的可见行时，补出空行并将光标放到该行。
    textarea.addEventListener('pointerdown', event => {
      const rect = textarea.getBoundingClientRect();
      const style = getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
      const paddingTop = Number.parseFloat(style.paddingTop) || 0;
      const targetLine = Math.max(0, Math.floor((event.clientY - rect.top - paddingTop + textarea.scrollTop) / lineHeight));
      const lineCount = textarea.value.split('\n').length;
      if (targetLine < lineCount) return;
      event.preventDefault();
      textarea.value += '\n'.repeat(targetLine - lineCount + 1);
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    textarea.addEventListener('pointerup', () => textarea.focus());
    textarea.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = '    ';
      textarea.value = `${textarea.value.slice(0, start)}${spaces}${textarea.value.slice(end)}`;
      const cursor = start + spaces.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  });
}
function newBook() { modal('新建复习本', `<label class="field">复习本名称<input name="name" maxlength="30" required autofocus placeholder="例如：英语固定搭配" /></label><label class="field">学科分类（可选）<input name="subject" maxlength="20" placeholder="例如：英语、高数、C语言" /></label>`, fd => { const name = String(fd.get('name') || '').trim(); if (!name) return; data.notebooks.push({ id:uid(), name, subject:String(fd.get('subject') || '').trim(), system:false, createdAt:now(), updatedAt:now() }); save(); modalRoot.innerHTML=''; home(); }); }
function renameBook(bookId) { const book = findBook(bookId); if (!book) return; const subjectField = book.system ? '' : `<label class="field">学科分类（可选）<input name="subject" maxlength="20" value="${escapeHtml(bookSubject(book))}" placeholder="例如：英语、高数、C语言" /></label>`; modal(book.system ? '修改复习本名称' : '修改复习本', `<label class="field">复习本名称<input name="name" maxlength="30" required autofocus value="${escapeHtml(book.name)}" /></label>${subjectField}`, fd => { const name = String(fd.get('name') || '').trim(); if (!name) { toast('复习本名称不能为空。'); return; } book.name = name; if (!book.system) book.subject = String(fd.get('subject') || '').trim(); book.updatedAt = now(); save(); modalRoot.innerHTML = ''; management(bookId); }); modalRoot.querySelector('button[type="submit"]').textContent = book.system ? '保存改名' : '保存设置'; }
function notebookMenu() { modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal"><h2>我的复习本</h2><div class="intro-modal"><p class="subtle">录入知识点，随机复习，点击查看答案。</p><button class="button dark" type="button" data-create-book>新建复习本</button></div><div class="modal-actions"><button class="button" type="button" data-close>关闭</button></div></div></div>`; modalRoot.querySelector('[data-close]').onclick = () => modalRoot.innerHTML = ''; modalRoot.querySelector('[data-create-book]').onclick = () => { modalRoot.innerHTML = ''; newBook(); }; }
function forceLowercaseEnabled() { return data.settings?.forceLowercase !== false; }
function directDeleteEnabled() { return data.settings?.directDelete === true; }
function practiceModeEnabled() { return data.settings?.practiceMode === true; }
function globalSettings() {
  const lowercaseChecked = forceLowercaseEnabled() ? 'checked' : '';
  const darkModeChecked = darkModeEnabled() ? 'checked' : '';
  const directDeleteChecked = directDeleteEnabled() ? 'checked' : '';
  const practiceModeChecked = practiceModeEnabled() ? 'checked' : '';
  modal('全局设置', `<label class="setting-toggle"><input type="checkbox" name="forceLowercase" ${lowercaseChecked} /> <span>默认小写</span></label><p class="import-help">开启后，之后批量导入的纯英文词汇和句子会自动转换为小写；关闭后保留导入内容中的大写字母。已有内容不会被改写。</p><label class="setting-toggle"><input type="checkbox" name="darkMode" ${darkModeChecked} /> <span>暗色模式</span></label><p class="import-help">开启后，应用的主背景与主文字颜色互换。</p><label class="setting-toggle"><input type="checkbox" name="directDelete" ${directDeleteChecked} /> <span>直接删除知识点</span></label><p class="import-help">开启后，删除单条知识点时立即执行，不再弹出确认。关闭时保持原有确认提示；批量删除仍会要求确认。</p><label class="setting-toggle"><input type="checkbox" name="practiceMode" ${practiceModeChecked} /> <span>刷题模式</span></label><p class="import-help">开启后，在复习页点击“重点复习”并成功加入其他复习本，会自动删除当前条目并显示下一条。关闭后仅添加，不删除原条目。</p>`, fd => {
    data.settings ||= {};
    data.settings.forceLowercase = fd.get('forceLowercase') === 'on';
    data.settings.darkMode = fd.get('darkMode') === 'on';
    data.settings.directDelete = fd.get('directDelete') === 'on';
    data.settings.practiceMode = fd.get('practiceMode') === 'on';
    save();
    applyTheme();
    modalRoot.innerHTML = '';
    toast('全局设置已保存。');
  });
}
function aboutSystem() {
  const features = [
    '多个复习本的新建、改名、管理、删除与长按拖拽排序。',
    '独立错题本：学习时可将内容加入重点复习。',
    '单条知识点、词汇的添加、编辑、删除。',
    '批量导入词汇：支持编号、制表符或多个空格分隔。',
    '中文在前、英文在后的词汇或句子会自动成为练习翻译：看中文输入英文，错误时显示正确答案，按 Enter 可重新输入，并提高后续复习权重。',
    '英文词汇未填写中文时，本地离线词典自动补充释义。',
    '离线词典未收录时明确提示，不保存不完整词汇。',
    '批量导入纯知识点：每行完整保存，不拆分答案。',
    '批量导入单选题：识别题干、A-D 选项、答案和解析；复习时可作答并查看解析。',
    '单选题点击选项后立即提交并显示对错、正确答案和解析；未选择时不显示答案。',
    '单选题支持专用编辑：可修改题干、A-D 选项、正确答案和解析。',
    '导入去重：重复知识点或词汇会提示并跳过。',
    '批量勾选删除与批量导出。',
    '知识点和答案的搜索功能。',
    '正序、倒序查看，序号随当前排序变化。',
    '每个复习本可单独设置每轮复习数量。',
    '首次开始复习时设置数量，之后默认使用保存的数量。',
    '随机复习优先抽取未出现内容，全部出现前不重复。',
    '学习时可标记“需复习”或“已熟悉”，分别提高或降低后续抽取权重。',
    '快速阅读：先显示题面，再显示答案。',
    '知识点：使用扩展卡片显示长内容，可滚动查看。',
    '上一条、下一条、重点复习，以及学习中修改或从当前复习本删除知识点。',
    '复习页采用紧凑布局，操作按钮位置固定；删除当前内容位于学习页右上角。',
    '学习时选中英文词汇或短语，可加入自选生词本。',
    '生词本选择会记住，并默认使用上次选定的复习本。',
    '离线数学输入：平方、幂、根号、n 次根、分式和常用符号。',
    '数学公式可使用 $...$ 包裹并按数学格式显示。',
    '兼容 \\(...\\)、$...$ 公式写法，并自动显示常用分式、根号、三角函数、无穷和集合数符号。',
    '批量导入、添加和编辑中的多行输入框支持 Tab 插入 4 个空格；点击空白行可直接在该行输入。',
    '近期更新：练习翻译答错后按 Enter 可再次作答；单选题与普通复习页面均优化了操作区布局和小屏幕显示。',
    '近期更新（桌面版）：复习数据保存到“文档\\知识管理系统数据”，图片单独保存在 images 文件夹；清理浏览器数据不会影响桌面版内容。',
    '近期更新：支持 Ctrl + 滚轮缩放界面、Ctrl + 0 恢复默认大小；输入框内不会触发缩放快捷键。',
    '近期更新：累计学习会统计完成的知识点、单选题、翻译和图片复习；设置可开启单条直接删除。',
    '近期更新：学习页面选中任意文字后右键，可原样加入任意复习本，并记住上次选择。',
    '全部数据与词典均可本地离线使用。'
  ];
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal about-modal"><h2>关于系统</h2><div class="about-list"><p>全栈工程师：女神綾波丽</p><p>源码公开使用说明：仅限个人学习与非商业用途；使用、转载或修改版发布时须标注作者并保留许可说明。反馈邮箱：<a href="mailto:2175278237@qq.com">2175278237@qq.com</a>。</p>${features.map((feature, index) => `<p>${index + 1}. ${escapeHtml(feature)}</p>`).join('')}</div><div class="modal-actions"><button class="button" type="button" data-close>关闭</button></div></div></div>`;
  modalRoot.querySelector('[data-close]').onclick = () => modalRoot.innerHTML = '';
}
const mathToolbar = `<div class="math-toolbar" data-math-toolbar><span>数学输入：</span><button type="button" class="button" data-math-insert="$x^{2}$">平方</button><button type="button" class="button" data-math-insert="$x^{n}$">幂</button><button type="button" class="button" data-math-insert="$\\sqrt{x}$">根号</button><button type="button" class="button" data-math-insert="$\\sqrt[n]{x}$">n 次根</button><button type="button" class="button" data-math-insert="$\\frac{a}{b}$">分式</button><button type="button" class="button" data-math-insert="$\\lim_{x\\to0}$">极限</button><button type="button" class="button" data-math-insert="$\\int_a^b f(x)\\,dx$">积分</button><button type="button" class="button" data-math-insert="$\\sum_{i=1}^n$">求和</button><button type="button" class="button" data-math-insert="$\\sin x$">三角</button><button type="button" class="button" data-math-insert="$\\ln x$">对数</button><button type="button" class="button" data-math-insert="≤ ≥ ≠ ∈ π">符号</button></div><p class="import-help">直接输入符号也可以；点击工具栏会插入公式模板。用 <code>$...$</code> 包住公式，例如 <code>$\\frac{a}{b}$</code>，保存后会按数学格式显示。</p>`;
function enableMathToolbar() { const toolbar = modalRoot.querySelector('[data-math-toolbar]'); if (!toolbar) return; let target = modalRoot.querySelector('textarea[name="prompt"]'); modalRoot.querySelectorAll('textarea').forEach(textarea => textarea.addEventListener('focus', () => { target = textarea; })); toolbar.addEventListener('click', event => { const button = event.target.closest('[data-math-insert]'); if (!button || !target) return; const text = button.dataset.mathInsert; const start = target.selectionStart ?? target.value.length; const end = target.selectionEnd ?? start; target.value = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`; target.focus(); const cursor = start + text.length; target.setSelectionRange(cursor, cursor); }); }
function choiceItemModal(bookId, item, onSaved) {
  const options = item.options || {};
  const content = `<div class="choice-editor-content">
    <label class="field">题干<textarea name="prompt" required>${escapeHtml(item.prompt || '')}</textarea></label>
    <div class="choice-edit-grid">
      <label class="field">A 选项<textarea name="optionA" required>${escapeHtml(options.A || '')}</textarea></label>
      <label class="field">B 选项<textarea name="optionB" required>${escapeHtml(options.B || '')}</textarea></label>
      <label class="field">C 选项<textarea name="optionC" required>${escapeHtml(options.C || '')}</textarea></label>
      <label class="field">D 选项<textarea name="optionD" required>${escapeHtml(options.D || '')}</textarea></label>
    </div>
    <label class="field">正确答案<select name="answer"><option value="A" ${item.answer === 'A' ? 'selected' : ''}>A</option><option value="B" ${item.answer === 'B' ? 'selected' : ''}>B</option><option value="C" ${item.answer === 'C' ? 'selected' : ''}>C</option><option value="D" ${item.answer === 'D' ? 'selected' : ''}>D</option></select></label>
    <label class="field">解析<textarea name="analysis" placeholder="填写考点、解析或注意事项">${escapeHtml(item.analysis || '')}</textarea></label>
    ${mathToolbar}
  </div>`;
  modal('编辑单选题', content, fd => {
    const prompt = String(fd.get('prompt') || '').trim();
    const editedOptions = { A:String(fd.get('optionA') || '').trim(), B:String(fd.get('optionB') || '').trim(), C:String(fd.get('optionC') || '').trim(), D:String(fd.get('optionD') || '').trim() };
    if (!prompt || Object.values(editedOptions).some(value => !value)) { toast('请完整填写题干和 A-D 选项。'); return; }
    Object.assign(item, { prompt, options:editedOptions, answer:String(fd.get('answer') || 'A'), analysis:String(fd.get('analysis') || '').trim(), updatedAt:now() });
    save();
    modalRoot.innerHTML = '';
    if (onSaved) onSaved(); else management(bookId);
  }, 'choice-editor-modal');
  enableTextareaEditing();
  enableMathToolbar();
}
async function cropImageBlob(blob, zoom, x, y) {
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = sourceUrl; });
    const width = 1200; const height = 700; const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
    const cropWidth = width / scale; const cropHeight = height / scale;
    const left = Math.max(0, Math.min(image.naturalWidth - cropWidth, (image.naturalWidth - cropWidth) / 2 + Number(x) / 100 * (image.naturalWidth - cropWidth) / 2));
    const top = Math.max(0, Math.min(image.naturalHeight - cropHeight, (image.naturalHeight - cropHeight) / 2 + Number(y) / 100 * (image.naturalHeight - cropHeight) / 2));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(image, left, top, cropWidth, cropHeight, 0, 0, width, height);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
  } finally { URL.revokeObjectURL(sourceUrl); }
}
function imageItemModal(bookId, item, onSaved) {
  const isEditing = Boolean(item); const savedScale = [50, 75, 100].includes(Number(item?.imageScale)) ? Number(item.imageScale) : 100;
  const imageField = isEditing ? `<p class="import-help">可重新选择图片，或直接调整现有图片的裁切区域。</p><label class="field">替换图片（可选）<input name="image" type="file" accept="image/*" /></label>` : `<label class="field">选择图片<input name="image" type="file" accept="image/*" required /></label>`;
  modal(isEditing ? '编辑图片复习' : '导入图片复习', `${imageField}<div class="image-cropper"><div class="image-crop-preview"><img alt="图片裁切预览" /></div><p class="import-help">预览区域就是复习时显示的范围。</p><label class="field">放大裁切<input name="cropZoom" type="range" min="1" max="3" step="0.05" value="1" /></label><label class="field">左右移动<input name="cropX" type="range" min="-100" max="100" value="0" /></label><label class="field">上下移动<input name="cropY" type="range" min="-100" max="100" value="0" /></label></div><label class="field">图片标题<textarea name="prompt" required placeholder="例如：三角函数关系图">${escapeHtml(item?.prompt || '')}</textarea></label><label class="field">图片显示大小<select name="imageScale"><option value="100" ${savedScale === 100 ? 'selected' : ''}>自动适应窗口</option><option value="75" ${savedScale === 75 ? 'selected' : ''}>75%</option><option value="50" ${savedScale === 50 ? 'selected' : ''}>50%</option></select></label><label class="field">答案 / 说明（可选）<textarea name="answer" placeholder="复习时点击后显示">${escapeHtml(item?.answer || '')}</textarea></label><p class="import-help">图片将裁切后保存在当前浏览器的图片数据库中。</p>`, async fd => {
    const prompt = String(fd.get('prompt') || '').trim(); const answer = String(fd.get('answer') || '').trim(); const imageScale = [50, 75, 100].includes(Number(fd.get('imageScale'))) ? Number(fd.get('imageScale')) : 100; const file = fd.get('image');
    if (!prompt) { toast('请填写图片标题。'); return; }
    let source = file instanceof File && file.size ? file : null;
    if (source && !source.type.startsWith('image/')) { toast('只能导入图片文件。'); return; }
    if (source && source.size > 8 * 1024 * 1024) { toast('图片超过 8 MB，请压缩后再导入。'); return; }
    if (!source && item) source = await getImageBlob(item.imageId || item.id, item.imageMime).catch(() => null);
    if (!source) { toast('请选择图片。'); return; }
    try {
      const cropped = await cropImageBlob(source, Number(fd.get('cropZoom')), Number(fd.get('cropX')), Number(fd.get('cropY')));
      if (!cropped) throw new Error('裁切失败');
      const imageId = item?.imageId || item?.id || uid(); await putImageBlob(imageId, cropped);
      const entry = { id:imageId, notebookId:bookId, type:'image', prompt, answer, imageId, imageMime:cropped.type || 'image/jpeg', imageScale, createdAt:now(), updatedAt:now() };
      if (item) Object.assign(item, { prompt, answer, imageId, imageMime:cropped.type || 'image/jpeg', imageScale, imageData:undefined, updatedAt:now() }); else data.items.push(entry);
      save(); modalRoot.innerHTML = ''; if (onSaved) onSaved(); else management(bookId);
    } catch { toast('图片保存失败，请重试。'); }
  }, 'image-editor-modal');
  const form = modalRoot.querySelector('form'); const preview = form.querySelector('.image-crop-preview img'); const controls = ['cropZoom', 'cropX', 'cropY'].map(name => form.elements[name]);
  const updatePreview = () => { const zoom = Number(form.elements.cropZoom.value); const x = Number(form.elements.cropX.value); const y = Number(form.elements.cropY.value); preview.style.transform = `scale(${zoom})`; preview.style.objectPosition = `${50 + x / 2}% ${50 + y / 2}%`; };
  controls.forEach(control => control.addEventListener('input', updatePreview)); updatePreview();
  form.elements.image.addEventListener('change', () => { const file = form.elements.image.files[0]; if (file) { preview.src = URL.createObjectURL(file); preview.onload = () => URL.revokeObjectURL(preview.src); } });
  if (item) getImageBlob(item.imageId || item.id, item.imageMime).then(blob => { if (blob) preview.src = URL.createObjectURL(blob); }).catch(() => { if (item.imageData) preview.src = item.imageData; });
  modalRoot.querySelector('button[type="submit"]').textContent = isEditing ? '保存图片' : '导入图片'; enableTextareaEditing();
}
function itemModal(bookId, item, onSaved) { modal(item ? '编辑知识点' : '添加知识点', `<label class="field">题干 / 知识点<textarea name="prompt" required placeholder="例如：raise ... by 5%">${escapeHtml(item?.prompt || '')}</textarea></label><label class="field">答案（英文词汇留空时自动补充中文）<textarea name="answer" placeholder="例如：将……提高 5%">${escapeHtml(item?.answer || '')}</textarea></label>${mathToolbar}`, fd => { const prompt=fd.get('prompt').trim(); let answer=fd.get('answer').trim(); if (!prompt) return; if (!answer && isLikelyEnglish(prompt)) { answer = lookupOfflineTranslation(prompt); if (!answer) { alert(`“${prompt}”未在本地离线词典中找到中文释义，未保存。`); return; } } if (item) Object.assign(item,{prompt,answer,updatedAt:now()}); else data.items.push({id:uid(), notebookId:bookId,prompt,answer,createdAt:now(),updatedAt:now()}); save(); modalRoot.innerHTML=''; if (onSaved) onSaved(); else management(bookId); }); enableTextareaEditing(); enableMathToolbar(); }
app.addEventListener('click', event => { const button = event.target.closest('button[data-action="edit-item"]'); if (!button) return; const item = data.items.find(entry => entry.id === button.dataset.id); if (item?.type !== 'choice') return; event.preventDefault(); event.stopImmediatePropagation(); choiceItemModal(item.notebookId, item); }, true);
function parseImport(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    line = line.replace(/^\s*\d+\s*[.、)）]\s*/, '');
    const parts = line.split(/\t+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return makeImportedVocabItem(parts[0], parts.slice(1).join(' '));
    const match = line.match(/^(.+?)\s{2,}(.+)$/);
    return match ? makeImportedVocabItem(match[1].trim(), match[2].trim()) : makeImportedVocabItem(line, '');
  }).filter(Boolean).filter(item => item.prompt);
}
function makeImportedVocabItem(first, second) {
  const prompt = normalizeImportedEnglish(first); const answer = normalizeImportedEnglish(second);
  return /[\u4e00-\u9fff]/.test(prompt) && isLikelyEnglish(answer)
    ? { prompt, answer, type:'translation' }
    : { prompt, answer };
}
function bulkImport(bookId) { modal('批量导入词汇', `<p class="import-help">每行一条。可带编号；英文和中文之间用制表符或两个以上空格分开。仅有英文词汇时，将从本地离线词典自动补充中文。<br>若按“中文　在前　英文在后”导入，会自动创建“练习翻译”：复习时看中文输入英文。<br>例：<code>13. drink cans    饮料罐</code> 或 <code>饮料罐    drink cans</code></p><label class="field">粘贴内容<textarea name="bulk" required autofocus placeholder="13. drink cans    饮料罐\n14. cover\n包装/打包    package"></textarea></label>`, fd => { const items = parseImport(fd.get('bulk')); if (!items.length) { toast('没有识别到内容，请检查每行是否含词汇。'); return; } const result = addUniqueImportedItems(bookId, items, '词汇', true); modalRoot.innerHTML=''; if (result.added) toast(`已导入 ${result.added} 条词汇。`); management(bookId); }); enlargeImportModal(); enableTextareaEditing(); }
function parseKnowledgeImport(text) {
  return text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n+/).map(block => block.trim()).filter(Boolean).map(block => ({
    prompt: block.replace(/^\s*\d+\s*[.、)）]\s*/, ''),
    answer: ''
  })).filter(item => item.prompt);
}
function normalizedPrompt(value) { return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase(); }
function isLikelyEnglish(value) { return /[a-z]/i.test(value) && !/[\u4e00-\u9fff]/.test(value) && !/[\\$^_=<>√∫∑]/.test(value); }
function normalizeImportedEnglish(value) { const text = String(value || '').trim(); return forceLowercaseEnabled() && isLikelyEnglish(text) ? text.toLowerCase() : text; }
function lookupOfflineTranslation(prompt) { return window.OFFLINE_DICTIONARY?.[normalizedPrompt(prompt)] || ''; }
function addUniqueImportedItems(bookId, items, label, autoTranslate = false) { const existing = new Set(bookItems(bookId).map(item => normalizedPrompt(item.prompt))); const duplicates = []; const missing = []; const added = []; items.forEach(item => { const key = normalizedPrompt(item.prompt); if (!key || existing.has(key)) { duplicates.push(item.prompt); return; } let entry = item; if (autoTranslate && !entry.answer && isLikelyEnglish(entry.prompt)) { const translation = lookupOfflineTranslation(entry.prompt); if (!translation) { missing.push(entry.prompt); return; } entry = { ...entry, answer:translation }; } existing.add(key); added.push(entry); }); if (added.length) { const time = now(); data.items.push(...added.map(item => ({ id:uid(), notebookId:bookId, ...item, createdAt:time, updatedAt:time }))); save(); } if (duplicates.length) { const shown = duplicates.slice(0, 20).map(prompt => `“${prompt}”重复导入，未导入。`).join('\n'); const more = duplicates.length > 20 ? `\n另有 ${duplicates.length - 20} 条重复内容。` : ''; alert(`${label}重复导入：\n${shown}${more}`); } if (missing.length) { const shown = missing.slice(0, 20).map(prompt => `“${prompt}”未在本地离线词典中找到中文释义，未导入。`).join('\n'); const more = missing.length > 20 ? `\n另有 ${missing.length - 20} 条未收录内容。` : ''; alert(`本地词典未收录：\n${shown}${more}`); } return { added:added.length, duplicates:duplicates.length, missing:missing.length }; }
function bulkKnowledgeImport(bookId) { modal('批量导入知识点', `<p class="import-help">只有“空白行”才分隔下一条知识点；普通换行会保留在同一条知识点中，且全部按纯知识点保存，不会创建答案。<br>不会按空格、<code>|||</code> 或制表符拆分。<br>例：第一条知识点可写多行；中间空一行后，再写第二条知识点。</p><label class="field">粘贴内容<textarea name="bulk" required autofocus placeholder="第一条知识点的第一行\n第一条知识点的第二行\n\n第二条知识点"></textarea></label>`, fd => { const items = parseKnowledgeImport(fd.get('bulk')); if (!items.length) { toast('没有识别到内容，请确认每组均有知识点。'); return; } const result = addUniqueImportedItems(bookId, items, '知识点'); modalRoot.innerHTML=''; if (result.added) toast(`已导入 ${result.added} 条知识点。`); management(bookId); }); enlargeImportModal(); enableTextareaEditing(); }
function parseChoiceImport(text) {
  // 支持换行格式及“题干 A. ... B. ... 答案：...”的连续粘贴格式。
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim()
    .split(/\n\s*\n+/)
    .flatMap(group => group.split(/(?=^\s*\d+\s*[.、)）]\s*)/m))
    .map(block => block.trim())
    .filter(Boolean);
  return blocks.map(block => {
    const answerMatch = /答案\s*[：:]\s*([A-Da-d])/.exec(block);
    const answerStart = answerMatch?.index ?? block.length;
    const analysisMatch = /解析\s*[：:]/.exec(block.slice(answerStart));
    const analysisStart = analysisMatch ? answerStart + analysisMatch.index : block.length;
    const optionMatches = [...block.matchAll(/([A-D])\s*[.、．:：]\s*/g)].filter(match => match.index < answerStart);
    if (optionMatches.length !== 4 || !answerMatch) return null;
    const prompt = block.slice(0, optionMatches[0].index).replace(/^\s*\d+\s*[.、)）]\s*/, '').trim();
    const options = {};
    optionMatches.forEach((match, index) => {
      const nextStart = index === optionMatches.length - 1 ? answerStart : optionMatches[index + 1].index;
      options[match[1]] = block.slice(match.index + match[0].length, nextStart).trim();
    });
    const answer = answerMatch[1].toUpperCase();
    const analysis = analysisMatch ? block.slice(analysisStart + analysisMatch[0].length).trim() : '';
    if (!prompt || !answer || !['A','B','C','D'].every(letter => options[letter] !== undefined)) return null;
    return { type:'choice', prompt, options, answer, analysis };
  }).filter(Boolean);
}
function bulkChoiceImport(bookId) {
  const help = `每题以 <code>1. 题目</code> 开头，选项写为 <code>A.</code>、<code>B.</code>、<code>C.</code>、<code>D.</code>，随后写 <code>答案：B</code> 和 <code>解析：...</code>。选项、答案和解析可以逐行写，也可以连续粘贴；题目之间用空白行分隔。<br>题目、选项和解析均支持 <code>$...$</code> 数学公式，例如 <code>$\\lim_{x\\to0}\\frac{1-\\cos x}{x}$</code>。`;
  const example = `1. $\\lim_{x\\to3}\\frac{x^2+x-12}{x-3}$ 的值为\nA. 0\nB. 3\nC. 7\nD. 不存在\n答案：C\n解析：$x^2+x-12=(x-3)(x+4)$，约分后代入得 7。`;
  modal('批量导入单选题', `<p class="import-help">${help}</p><label class="field">粘贴内容<textarea name="bulk" required autofocus placeholder="${escapeHtml(example)}"></textarea></label>${mathToolbar}`, fd => {
    const items = parseChoiceImport(fd.get('bulk'));
    if (!items.length) { toast('没有识别到完整单选题，请检查题目、A-D 选项和答案格式。'); return; }
    const result = addUniqueImportedItems(bookId, items, '单选题');
    modalRoot.innerHTML = '';
    if (result.added) toast(`已导入 ${result.added} 道单选题。`);
    management(bookId);
  });
  enlargeImportModal(); enableTextareaEditing(); enableMathToolbar();
}
function enableMathToolbar() {
  const toolbar = modalRoot.querySelector('[data-math-toolbar]');
  if (!toolbar) return;
  let target = modalRoot.querySelector('textarea[name="prompt"]') || modalRoot.querySelector('textarea');
  modalRoot.querySelectorAll('textarea').forEach(textarea => textarea.addEventListener('focus', () => { target = textarea; }));
  toolbar.addEventListener('click', event => {
    const button = event.target.closest('[data-math-insert]');
    if (!button || !target) return;
    const text = button.dataset.mathInsert;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.value = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
    target.focus();
    const cursor = start + text.length;
    target.setSelectionRange(cursor, cursor);
  });
}
function renderMath(source = '') {
  const renderPart = value => {
    let html = escapeHtml(value);
    html = html.replace(/\\left/g, '').replace(/\\right/g, '');
    html = html.replace(/\\mathbb\{([RNZQC])\}/g, (_, letter) => ({ R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' }[letter]));
    html = html.replace(/\\(?:mathrm|text|operatorname)\{([^{}]*)\}/g, '$1');
    html = html.replace(/\\sqrt(?:\[([^\]]+)\])?\{([^{}]*)\}/g, (_, index, radicand) => `<span class="math-root">${index ? `<sup>${renderPart(index)}</sup>` : ''}√<span class="math-radicand">${renderPart(radicand)}</span></span>`);
    html = html.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, numerator, denominator) => `<span class="math-fraction"><span>${renderPart(numerator)}</span><span>${renderPart(denominator)}</span></span>`);
    html = html.replace(/\\frac\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, (_, numerator, denominator) => `<span class="math-fraction"><span>${numerator}</span><span>${denominator}</span></span>`);
    html = html.replace(/\^\{([^{}]*)\}/g, (_, exponent) => `<sup>${renderPart(exponent)}</sup>`).replace(/_\{([^{}]*)\}/g, (_, subscript) => `<sub>${renderPart(subscript)}</sub>`);
    html = html.replace(/\^([A-Za-z0-9+\-])/g, '<sup>$1</sup>').replace(/_([A-Za-z0-9+\-])/g, '<sub>$1</sub>');
    html = html.replace(/\\sqrt\s*([A-Za-z0-9])/g, (_, radicand) => `<span class="math-root">√<span class="math-radicand">${radicand}</span></span>`);
    return html.replace(/\\arctan/g, 'arctan').replace(/\\arccos/g, 'arccos').replace(/\\arcsin/g, 'arcsin').replace(/\\tan/g, 'tan').replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos').replace(/\\cot/g, 'cot').replace(/\\sec/g, 'sec').replace(/\\csc/g, 'csc').replace(/\\exp/g, 'exp').replace(/\\log/g, 'log').replace(/\\ln/g, 'ln').replace(/\\sum/g, '∑').replace(/\\prod/g, '∏').replace(/\\int/g, '∫').replace(/\\partial/g, '∂').replace(/\\nabla/g, '∇').replace(/\\Delta/g, 'Δ').replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ').replace(/\\delta/g, 'δ').replace(/\\theta/g, 'θ').replace(/\\lambda/g, 'λ').replace(/\\mu/g, 'μ').replace(/\\sigma/g, 'σ').replace(/\\phi/g, 'φ').replace(/\\omega/g, 'ω').replace(/\\rightarrow/g, '→').replace(/\\to/g, '→').replace(/\\lim/g, 'lim').replace(/\\infty/g, '∞').replace(/\\pm/g, '±').replace(/\\cdot/g, '·').replace(/\\pi/g, 'π').replace(/\\notin/g, '∉').replace(/\\in/g, '∈').replace(/\\leq/g, '≤').replace(/\\le/g, '≤').replace(/\\geq/g, '≥').replace(/\\ge/g, '≥').replace(/\\neq/g, '≠').replace(/\\times/g, '×').replace(/\\div/g, '÷');
  };
  return `<span class="math-display">${renderPart(source)}</span>`;
}
function nl(s = '') {
  const parts = String(s).split(/(\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g);
  return parts.map(part => {
    if (part.startsWith('$') && part.endsWith('$')) return renderMath(part.slice(1, -1));
    if (part.startsWith('\\(') && part.endsWith('\\)')) return renderMath(part.slice(2, -2));
    if (part.startsWith('\\[') && part.endsWith('\\]')) return renderMath(part.slice(2, -2));
    return escapeHtml(part);
  }).join('').replace(/\n/g, '<br>');
}
function exportNotebook(bookId) {
  const book = findBook(bookId); const items = bookItems(bookId);
  if (!book || !items.length) { toast('当前复习本没有可导出的内容。'); return; }
  const content = items.map((item, index) => {
    if (item.type !== 'choice') return item.answer ? `${item.prompt}     ${item.answer}` : item.prompt;
    const options = item.options || {};
    return `${index + 1}.${item.prompt}\r\nA. ${options.A || ''}\r\nB. ${options.B || ''}\r\nC. ${options.C || ''}\r\nD. ${options.D || ''}\r\n答案：${item.answer || ''}\r\n解析：${item.analysis || ''}`;
  }).join('\r\n\r\n');
  const safeName = book.name.replace(/[\\/:*?"<>|]/g, '_'); const date = new Date().toISOString().slice(0, 10);
  const file = new Blob([`\ufeff${content}`], { type:'text/plain;charset=utf-8' }); const link = document.createElement('a'); const url = URL.createObjectURL(file);
  link.href = url; link.download = `${safeName}_${date}.txt`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`已导出 ${items.length} 条知识点。`);
}
function handleClick(event) { const button = event.target.closest('button'); if (!button) return; const { action, id, book, order } = button.dataset; if (action === 'home') { home(); if (location.hash !== '#home') location.hash = '#home'; return; } if (action === 'new-book') newBook(); if (action === 'manage') go(`#manage/${id}`); if (action === 'study') startReview(id); if (action === 'rename-book') renameBook(id); if (action === 'review-settings') reviewSettings(id, false); if (action === 'new-item') itemModal(book); if (action === 'bulk-import') bulkImport(book); if (action === 'bulk-import-knowledge') bulkKnowledgeImport(book); if (action === 'bulk-export') exportNotebook(book); if (action === 'batch-delete') { const selected = bookItems(book).filter(item => selectedIds.has(item.id)); if (!selected.length) { toast('请先勾选要删除的知识点。'); return; } if (confirm(`确定删除已选择的 ${selected.length} 条知识点吗？`)) { const ids = new Set(selected.map(item => item.id)); data.items = data.items.filter(item => !ids.has(item.id)); ids.forEach(id => selectedIds.delete(id)); save(); management(book); } } if (action === 'edit-item') { const item=data.items.find(i=>i.id===id); if (item?.type === 'image') imageItemModal(item.notebookId,item); else itemModal(item.notebookId,item); } if (action === 'delete-item') { const item=data.items.find(i=>i.id===id); if (item && (directDeleteEnabled() || confirm('确定删除这条知识点吗？'))) { data.items=data.items.filter(i=>i.id!==id); selectedIds.delete(item.id); save(); management(item.notebookId); } } if (action === 'delete-book') { const target=findBook(id); if (target && confirm(`确定删除“${target.name}”及其中全部知识点吗？`)) { data.notebooks=data.notebooks.filter(b=>b.id!==id); data.items=data.items.filter(i=>i.notebookId!==id); save(); home(); if (location.hash !== '#home') location.hash = '#home'; } } if (action === 'search') { const q=document.querySelector('#search').value.trim(); go(`#manage/${id}?q=${encodeURIComponent(q)}&order=${order || 'asc'}`); } if (action === 'set-order') { const q=document.querySelector('#search').value.trim(); go(`#manage/${id}?q=${encodeURIComponent(q)}&order=${order === 'desc' ? 'desc' : 'asc'}`); } }
function route() { app.onclick = handleClick; const path=location.hash.slice(1) || 'home'; if (path === 'home') home(); else if (path === 'errors') go(`#manage/${data.errorNotebookId}`); else if (path.startsWith('manage/')) management(path.split(/[/?]/)[1]); else home(); }
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action="filter-subject"]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  activeSubject = button.dataset.subject || 'all';
  home();
}, true);

setNav(); nav.addEventListener('click', event => { const action = event.target.closest('button')?.dataset.nav; if (action === 'notebooks') notebookMenu(); if (action === 'errors') go('#errors'); if (action === 'settings') globalSettings(); if (action === 'about') aboutSystem(); }); window.addEventListener('hashchange', route); initializeImageDatabase().finally(route);
