/* 本地复习本：所有数据保存在当前浏览器的 localStorage。 */
const STORE = 'review-notebook-v1';
const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const modalRoot = document.querySelector('#modal-root');
const toastEl = document.querySelector('#toast');
let toastTimer;
let selectedIds = new Set();

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const now = () => new Date().toISOString();
const escapeHtml = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c]));
const nl = (s = '') => escapeHtml(s).replace(/\n/g, '<br>');

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
function load() { try { return JSON.parse(localStorage.getItem(STORE)) || initialData(); } catch { return initialData(); } }
let data = load();
function save() { localStorage.setItem(STORE, JSON.stringify(data)); }
function findBook(id) { return data.notebooks.find(b => b.id === id); }
function bookItems(id) { return data.items.filter(i => i.notebookId === id); }
function toast(message) { toastEl.textContent = message; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200); }
function setNav() { document.querySelector('.brand').textContent = '知识管理系统'; nav.innerHTML = `<button type="button" data-nav="notebooks">复习本</button><button type="button" data-nav="errors">错题本</button>`; }
function go(hash) { location.hash = hash; }

function home() {
  app.onmouseup = null; app.ontouchend = null;
  const cards = data.notebooks.map(book => {
    const count = bookItems(book.id).length;
    return `<article class="notebook-card ${book.system ? 'error' : ''}" data-book-card="${book.id}">
      <div><h2>${escapeHtml(book.name)}</h2><p class="subtle">${count} 条知识点${book.system ? ' · 重点复习内容' : ''}</p></div>
      <div class="card-actions"><button class="button dark" data-action="study" data-id="${book.id}">开始复习</button><button class="button" data-action="manage" data-id="${book.id}">管理</button></div>
    </article>`;
  }).join('');
  app.innerHTML = `<section class="home-page"><div class="notebook-grid">${cards}</div></section>`;
  enableNotebookReorder();
}
function saveNotebookOrder(grid) {
  const positions = new Map([...grid.querySelectorAll('[data-book-card]')].map((card, index) => [card.dataset.bookCard, index]));
  data.notebooks.sort((a, b) => positions.get(a.id) - positions.get(b.id));
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
  const rows = items.length ? items.map((item, index) => { const serial = sortOrder === 'asc' ? index + 1 : items.length - index; return `<tr><td class="select-cell"><input type="checkbox" data-select-item="${item.id}" ${selectedIds.has(item.id) ? 'checked' : ''} aria-label="选择第 ${serial} 条" /></td><td class="number">${serial}</td><td>${nl(item.prompt)}</td><td class="answer-cell">${nl(item.answer)}</td><td><div class="action-row"><button class="button" data-action="edit-item" data-id="${item.id}">编辑</button><button class="button danger" data-action="delete-item" data-id="${item.id}">删除</button></div></td></tr>`; }).join('') : `<tr><td colspan="5" class="subtle">${filter ? '没有匹配的知识点。' : '还没有知识点，点击“添加知识点”开始录入。'}</td></tr>`;
  const allChecked = items.length && items.every(item => selectedIds.has(item.id));
  app.innerHTML = `<section><div class="page-head"><div><button class="button" data-action="home">← 返回</button><h1 style="margin-top:18px">${escapeHtml(book.name)}</h1><p class="subtle">${bookItems(bookId).length} 条知识点</p></div><div class="action-row"><button class="button dark" data-action="study" data-id="${bookId}">开始复习</button><button class="button" data-action="new-item" data-book="${bookId}">添加知识点</button><button class="button" data-action="bulk-import" data-book="${bookId}">批量导入词汇</button><button class="button" data-action="bulk-import-knowledge" data-book="${bookId}">批量导入知识点</button><button class="button" data-action="bulk-export" data-book="${bookId}">批量导出</button><button class="button danger" data-action="batch-delete" data-book="${bookId}">批量删除</button>${book.system ? '' : '<button class="button danger" data-action="delete-book" data-id="'+bookId+'">删除复习本</button>'}</div></div><div class="toolbar"><input class="search" id="search" value="${escapeHtml(filter)}" placeholder="搜索知识点或答案" /><button class="button" data-action="search" data-id="${bookId}" data-order="${sortOrder}">搜索</button><div class="order-actions"><button class="button ${sortOrder === 'asc' ? 'dark' : ''}" data-action="set-order" data-id="${bookId}" data-order="asc">正序查看</button><button class="button ${sortOrder === 'desc' ? 'dark' : ''}" data-action="set-order" data-id="${bookId}" data-order="desc">倒序查看</button></div></div><div class="table-wrap"><table><thead><tr><th class="select-cell"><input type="checkbox" data-select-all ${allChecked ? 'checked' : ''} aria-label="全选" /></th><th class="number">序号</th><th>题干 / 知识点</th><th>答案</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  app.onchange = event => { const input = event.target; if (input.matches('[data-select-item]')) { input.checked ? selectedIds.add(input.dataset.selectItem) : selectedIds.delete(input.dataset.selectItem); } if (input.matches('[data-select-all]')) { items.forEach(item => input.checked ? selectedIds.add(item.id) : selectedIds.delete(item.id)); management(bookId); } };
}
function reviewSettings(bookId) {
  const book = findBook(bookId); const total = bookItems(bookId).length;
  if (!book) return home();
  if (!total) return study(bookId);
  data.reviewCounts ||= {};
  const savedCount = Math.min(Math.max(Number(data.reviewCounts[bookId]) || Math.min(20, total), 1), total);
  modal('设置每轮复习数量', `<p class="subtle">${escapeHtml(book.name)}共有 ${total} 条知识点。每轮会随机抽取指定数量复习。</p><label class="field">本轮复习数量<input name="count" type="number" min="1" max="${total}" value="${savedCount}" required autofocus /></label><p class="import-help">此数量会记住，下一次开始复习时可继续使用或修改。</p>`, fd => {
    const count = Math.min(Math.max(Number(fd.get('count')) || 1, 1), total);
    data.reviewCounts[bookId] = count; save(); modalRoot.innerHTML = ''; study(bookId, count);
  });
  modalRoot.querySelector('button[type="submit"]').textContent = '开始复习';
}
function study(bookId, roundSize) {
  const book = findBook(bookId); const items = bookItems(bookId);
  if (!book) return home();
  if (!items.length) { app.innerHTML = `<section class="empty"><h2>${escapeHtml(book.name)}还没有内容</h2><p class="subtle">请先添加知识点，再开始复习。</p><button class="button dark" data-action="manage" data-id="${bookId}">去添加知识点</button></section>`; return; }
  const count = Math.min(Math.max(Number(roundSize) || items.length, 1), items.length);
  let order = [...items].sort(() => Math.random() - .5).slice(0, count).map(i => i.id); let position = 0; let revealed = false;
  const renderCard = () => { const item = data.items.find(i => i.id === order[position]); if (!item) return study(bookId); const hasAnswer = Boolean(item.answer.trim()); const cardType = hasAnswer ? '快速阅读' : '知识点'; const nextLabel = hasAnswer && !revealed ? '查看答案 →' : '下一条 →'; app.innerHTML = `<section class="study"><div class="study-top"><button class="button" data-action="home">← 返回</button><span>${escapeHtml(book.name)} · ${position + 1} / ${order.length}</span></div><div class="study-card"><span class="card-type">${cardType}</span><div class="prompt">${nl(item.prompt)}</div></div>${hasAnswer ? `<div class="reveal ${revealed ? '' : 'hidden'}">${revealed ? `<span class="answer">${nl(item.answer)}</span>` : '点击下方“查看答案”'}</div>` : '<div class="reveal placeholder" aria-hidden="true"></div>'}<div class="study-actions"><button class="button" data-action="previous" ${position === 0 ? 'disabled' : ''}>← 上一条</button><button class="button" data-action="mark" data-id="${item.id}">重点复习</button><button class="button dark" data-action="next">${nextLabel}</button></div></section>`; };
  const handleSelectedWord = () => { setTimeout(() => { const selection = window.getSelection(); const selectedText = selection?.toString().trim().replace(/\s+/g, ' '); const node = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement; if (!selectedText || !node?.closest('.study-card, .reveal') || !isLikelyEnglish(selectedText) || modalRoot.innerHTML) return; selection.removeAllRanges(); selectedWordModal(selectedText); }, 0); };
  app.onmouseup = handleSelectedWord; app.ontouchend = handleSelectedWord;
  app.onclick = event => { const button = event.target.closest('button'); if (!button) return; const action = button.dataset.action; if (action === 'previous') { if (position > 0) { position -= 1; revealed = false; renderCard(); } return; } if (action === 'next') { const current = data.items.find(i => i.id === order[position]); if (current?.answer?.trim() && !revealed) { revealed = true; renderCard(); return; } position += 1; if (position >= order.length) { order = [...bookItems(bookId)].sort(() => Math.random() - .5).slice(0, count).map(i => i.id); position = 0; toast(`本轮复习完成，已开始下一轮（${count} 条）。`); } revealed = false; renderCard(); return; } if (action === 'mark') { markImportant(button.dataset.id); return; } if (action === 'home') { app.onclick = handleClick; app.onmouseup = null; app.ontouchend = null; home(); if (location.hash !== '#home') location.hash = '#home'; } };
  renderCard();
}
function markImportant(itemId) { const item = data.items.find(i => i.id === itemId); const errorId = data.errorNotebookId; if (!item || !errorId) return; const exists = data.items.some(i => i.notebookId === errorId && i.sourceId === itemId); if (!exists) { data.items.push({ ...item, id: uid(), notebookId: errorId, sourceId: itemId, createdAt: now(), updatedAt: now() }); save(); toast('已加入错题本。'); } else toast('该内容已在错题本中。'); }
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
function modal(title, inner, onSubmit) { modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal"><h2>${title}</h2>${inner}<div class="modal-actions"><button class="button dark" type="submit">保存</button><button class="button" type="button" data-close>取消</button></div></form></div>`; const form = modalRoot.querySelector('form'); form.querySelector('[data-close]').onclick = () => modalRoot.innerHTML = ''; form.onsubmit = e => { e.preventDefault(); onSubmit(new FormData(form)); }; }
function enlargeImportModal() { requestAnimationFrame(() => { const modalEl = modalRoot.querySelector('.modal'); const textarea = modalRoot.querySelector('textarea[name="bulk"]'); if (!modalEl || !textarea) return; textarea.style.minHeight = `${Math.ceil(textarea.getBoundingClientRect().height * 1.2)}px`; modalEl.style.minHeight = `${Math.ceil(modalEl.getBoundingClientRect().height * 1.2)}px`; }); }
function newBook() { modal('新建复习本', `<label class="field">复习本名称<input name="name" maxlength="30" required autofocus placeholder="例如：英语固定搭配" /></label>`, fd => { const name = fd.get('name').trim(); if (!name) return; data.notebooks.push({ id:uid(), name, system:false, createdAt:now(), updatedAt:now() }); save(); modalRoot.innerHTML=''; home(); }); }
function notebookMenu() { modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal"><h2>我的复习本</h2><div class="intro-modal"><p class="subtle">录入知识点，随机复习，点击查看答案。</p><button class="button dark" type="button" data-create-book>新建复习本</button></div><div class="modal-actions"><button class="button" type="button" data-close>关闭</button></div></div></div>`; modalRoot.querySelector('[data-close]').onclick = () => modalRoot.innerHTML = ''; modalRoot.querySelector('[data-create-book]').onclick = () => { modalRoot.innerHTML = ''; newBook(); }; }
function itemModal(bookId, item) { modal(item ? '编辑知识点' : '添加知识点', `<label class="field">题干 / 知识点<textarea name="prompt" required placeholder="例如：raise ... by 5%">${escapeHtml(item?.prompt || '')}</textarea></label><label class="field">答案（英文词汇留空时自动补充中文）<textarea name="answer" placeholder="例如：将……提高 5%">${escapeHtml(item?.answer || '')}</textarea></label>`, fd => { const prompt=fd.get('prompt').trim(); let answer=fd.get('answer').trim(); if (!prompt) return; if (!answer && isLikelyEnglish(prompt)) { answer = lookupOfflineTranslation(prompt); if (!answer) { alert(`“${prompt}”未在本地离线词典中找到中文释义，未保存。`); return; } } if (item) Object.assign(item,{prompt,answer,updatedAt:now()}); else data.items.push({id:uid(), notebookId:bookId,prompt,answer,createdAt:now(),updatedAt:now()}); save(); modalRoot.innerHTML=''; management(bookId); }); }
function parseImport(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    line = line.replace(/^\s*\d+\s*[.、)）]\s*/, '');
    const parts = line.split(/\t+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { prompt:parts[0], answer:parts.slice(1).join(' ') };
    const match = line.match(/^(.+?)\s{2,}(.+)$/);
    return match ? { prompt:match[1].trim(), answer:match[2].trim() } : { prompt:line, answer:'' };
  }).filter(Boolean).filter(item => item.prompt);
}
function bulkImport(bookId) { modal('批量导入词汇', `<p class="import-help">每行一条。可带编号；英文和中文之间用制表符或两个以上空格分开。仅有英文词汇时，将从本地离线词典自动补充中文。<br>例：<code>13. drink cans    饮料罐</code></p><label class="field">粘贴内容<textarea name="bulk" required autofocus placeholder="13. drink cans    饮料罐\n14. cover\n15. package        包装/打包"></textarea></label>`, fd => { const items = parseImport(fd.get('bulk')); if (!items.length) { toast('没有识别到内容，请检查每行是否含词汇。'); return; } const result = addUniqueImportedItems(bookId, items, '词汇', true); modalRoot.innerHTML=''; if (result.added) toast(`已导入 ${result.added} 条词汇。`); management(bookId); }); enlargeImportModal(); }
function parseKnowledgeImport(text) {
  return text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n+/).map(block => block.trim()).filter(Boolean).map(block => ({
    prompt: block.replace(/^\s*\d+\s*[.、)）]\s*/, ''),
    answer: ''
  })).filter(item => item.prompt);
}
function normalizedPrompt(value) { return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase(); }
function isLikelyEnglish(value) { return /[a-z]/i.test(value) && !/[\u4e00-\u9fff]/.test(value); }
function lookupOfflineTranslation(prompt) { return window.OFFLINE_DICTIONARY?.[normalizedPrompt(prompt)] || ''; }
function addUniqueImportedItems(bookId, items, label, autoTranslate = false) { const existing = new Set(bookItems(bookId).map(item => normalizedPrompt(item.prompt))); const duplicates = []; const missing = []; const added = []; items.forEach(item => { const key = normalizedPrompt(item.prompt); if (!key || existing.has(key)) { duplicates.push(item.prompt); return; } let entry = item; if (autoTranslate && !entry.answer && isLikelyEnglish(entry.prompt)) { const translation = lookupOfflineTranslation(entry.prompt); if (!translation) { missing.push(entry.prompt); return; } entry = { ...entry, answer:translation }; } existing.add(key); added.push(entry); }); if (added.length) { const time = now(); data.items.push(...added.map(item => ({ id:uid(), notebookId:bookId, ...item, createdAt:time, updatedAt:time }))); save(); } if (duplicates.length) { const shown = duplicates.slice(0, 20).map(prompt => `“${prompt}”重复导入，未导入。`).join('\n'); const more = duplicates.length > 20 ? `\n另有 ${duplicates.length - 20} 条重复内容。` : ''; alert(`${label}重复导入：\n${shown}${more}`); } if (missing.length) { const shown = missing.slice(0, 20).map(prompt => `“${prompt}”未在本地离线词典中找到中文释义，未导入。`).join('\n'); const more = missing.length > 20 ? `\n另有 ${missing.length - 20} 条未收录内容。` : ''; alert(`本地词典未收录：\n${shown}${more}`); } return { added:added.length, duplicates:duplicates.length, missing:missing.length }; }
function bulkKnowledgeImport(bookId) { modal('批量导入知识点', `<p class="import-help">只有“空白行”才分隔下一条知识点；普通换行会保留在同一条知识点中，且全部按纯知识点保存，不会创建答案。<br>不会按空格、<code>|||</code> 或制表符拆分。<br>例：第一条知识点可写多行；中间空一行后，再写第二条知识点。</p><label class="field">粘贴内容<textarea name="bulk" required autofocus placeholder="第一条知识点的第一行\n第一条知识点的第二行\n\n第二条知识点"></textarea></label>`, fd => { const items = parseKnowledgeImport(fd.get('bulk')); if (!items.length) { toast('没有识别到内容，请确认每组均有知识点。'); return; } const result = addUniqueImportedItems(bookId, items, '知识点'); modalRoot.innerHTML=''; if (result.added) toast(`已导入 ${result.added} 条知识点。`); management(bookId); }); enlargeImportModal(); }
function exportNotebook(bookId) { const book = findBook(bookId); const items = bookItems(bookId); if (!book || !items.length) { toast('当前复习本没有可导出的内容。'); return; } const content = items.map(item => item.answer ? `${item.prompt}     ${item.answer}` : item.prompt).join('\r\n'); const safeName = book.name.replace(/[\\/:*?"<>|]/g, '_'); const date = new Date().toISOString().slice(0, 10); const file = new Blob([`\ufeff${content}`], { type:'text/plain;charset=utf-8' }); const link = document.createElement('a'); const url = URL.createObjectURL(file); link.href = url; link.download = `${safeName}_${date}.txt`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`已导出 ${items.length} 条知识点。`); }
function handleClick(event) { const button = event.target.closest('button'); if (!button) return; const { action, id, book, order } = button.dataset; if (action === 'home') { home(); if (location.hash !== '#home') location.hash = '#home'; return; } if (action === 'new-book') newBook(); if (action === 'manage') go(`#manage/${id}`); if (action === 'study') reviewSettings(id); if (action === 'new-item') itemModal(book); if (action === 'bulk-import') bulkImport(book); if (action === 'bulk-import-knowledge') bulkKnowledgeImport(book); if (action === 'bulk-export') exportNotebook(book); if (action === 'batch-delete') { const selected = bookItems(book).filter(item => selectedIds.has(item.id)); if (!selected.length) { toast('请先勾选要删除的知识点。'); return; } if (confirm(`确定删除已选择的 ${selected.length} 条知识点吗？`)) { const ids = new Set(selected.map(item => item.id)); data.items = data.items.filter(item => !ids.has(item.id)); ids.forEach(id => selectedIds.delete(id)); save(); management(book); } } if (action === 'edit-item') { const item=data.items.find(i=>i.id===id); itemModal(item.notebookId,item); } if (action === 'delete-item') { const item=data.items.find(i=>i.id===id); if (item && confirm('确定删除这条知识点吗？')) { data.items=data.items.filter(i=>i.id!==id); selectedIds.delete(item.id); save(); management(item.notebookId); } } if (action === 'delete-book') { const target=findBook(id); if (target && confirm(`确定删除“${target.name}”及其中全部知识点吗？`)) { data.notebooks=data.notebooks.filter(b=>b.id!==id); data.items=data.items.filter(i=>i.notebookId!==id); save(); home(); if (location.hash !== '#home') location.hash = '#home'; } } if (action === 'search') { const q=document.querySelector('#search').value.trim(); go(`#manage/${id}?q=${encodeURIComponent(q)}&order=${order || 'asc'}`); } if (action === 'set-order') { const q=document.querySelector('#search').value.trim(); go(`#manage/${id}?q=${encodeURIComponent(q)}&order=${order === 'desc' ? 'desc' : 'asc'}`); } }
function route() { app.onclick = handleClick; const path=location.hash.slice(1) || 'home'; if (path === 'home') home(); else if (path === 'errors') go(`#manage/${data.errorNotebookId}`); else if (path.startsWith('manage/')) management(path.split(/[/?]/)[1]); else home(); }
setNav(); nav.addEventListener('click', event => { const action = event.target.closest('button')?.dataset.nav; if (action === 'notebooks') notebookMenu(); if (action === 'errors') go('#errors'); }); window.addEventListener('hashchange', route); route();
