(() => {
  'use strict';

  const STORAGE_KEY = 'moji-novel-workbench-v1';
  let LOCAL_DEFAULTS = {};

  async function loadLocalDefaults() {
    try {
      const response = await fetch('config.local.json', { cache: 'no-store' });
      if (!response.ok) return {};
      const data = await response.json();
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);

  const countChars = (text) => String(text || '').replace(/\s+/g, '').length;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  }

  function nowText(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('zh-CN', { hour12: false });
    } catch {
      return String(ts);
    }
  }

  function createDefaultState() {
    return {
      version: 1,
      settings: {
        baseUrl: LOCAL_DEFAULTS.baseUrl || 'https://api.deepseek.com/v1',
        apiKey: String(LOCAL_DEFAULTS.apiKey || ''),
        model: LOCAL_DEFAULTS.model || 'deepseek-chat',
        temperature: 1,
        maxTokens: 4096,
        autoSummary: true,
      },
      project: {
        title: '',
        world: '',
        style: '',
        pov: '第三人称',
        characters: [],
        rollingSummary: '',
        chapters: [],
      },
      ui: {
        activeChapterId: null,
        activeTab: 'chapters',
      },
    };
  }

  function normalizeState(raw) {
    const defaults = createDefaultState();
    if (!raw || typeof raw !== 'object') return defaults;

    const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const settings = {
      ...defaults.settings,
      ...rawSettings,
      temperature: clampNumber(rawSettings.temperature, 0, 1.5, 1),
      maxTokens: Math.round(clampNumber(rawSettings.maxTokens, 256, 32000, 4096)),
      autoSummary: rawSettings.autoSummary !== false,
    };

    const rawProject = raw.project && typeof raw.project === 'object' ? raw.project : {};
    const characters = Array.isArray(rawProject.characters)
      ? rawProject.characters.map((item) => ({
          id: String(item?.id || uid()),
          name: String(item?.name || ''),
          role: String(item?.role || ''),
          personality: String(item?.personality || ''),
        }))
      : [];

    const chapters = Array.isArray(rawProject.chapters)
      ? rawProject.chapters.map((item) => {
          const status = String(item?.status || 'draft');
          return {
            id: String(item?.id || uid()),
            title: String(item?.title || ''),
            brief: String(item?.brief || ''),
            style: String(item?.style || ''),
            targetWords: Math.round(clampNumber(item?.targetWords, 200, 20000, 1500)),
            content: String(item?.content || ''),
            summary: String(item?.summary || ''),
            summaryBase: typeof item?.summaryBase === 'string' ? item.summaryBase : '',
            prompt: item?.prompt && typeof item.prompt === 'object'
              ? {
                  system: String(item.prompt.system || ''),
                  user: String(item.prompt.user || ''),
                  style: String(item.prompt.style || ''),
                  model: String(item.prompt.model || ''),
                  temperature: item.prompt.temperature,
                  createdAt: Number(item.prompt.createdAt) || 0,
                }
              : null,
            status: status === 'generating' ? (item?.content ? 'stopped' : 'draft') : status,
            createdAt: Number(item?.createdAt) || Date.now(),
          };
        })
      : [];

    const rawUi = raw.ui && typeof raw.ui === 'object' ? raw.ui : {};
    const activeTab = ['chapters', 'summary', 'setup'].includes(rawUi.activeTab)
      ? rawUi.activeTab
      : 'chapters';

    return {
      version: 1,
      settings,
      project: {
        title: String(rawProject.title || ''),
        world: String(rawProject.world || ''),
        style: String(rawProject.style || ''),
        pov: String(rawProject.pov || '第三人称'),
        characters,
        rollingSummary: String(rawProject.rollingSummary || ''),
        chapters,
      },
      ui: {
        activeChapterId: rawUi.activeChapterId ? String(rawUi.activeChapterId) : null,
        activeTab,
      },
    };
  }

  function applyLocalDefaults(state) {
    const settings = state.settings;
    const isDeepSeekBase = !settings.baseUrl || /deepseek\.com/i.test(settings.baseUrl);
    if (!settings.apiKey && LOCAL_DEFAULTS.apiKey && isDeepSeekBase) {
      settings.apiKey = String(LOCAL_DEFAULTS.apiKey);
      if (!settings.model && LOCAL_DEFAULTS.model) settings.model = String(LOCAL_DEFAULTS.model);
    }
    return state;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return applyLocalDefaults(normalizeState(raw ? JSON.parse(raw) : null));
    } catch {
      return applyLocalDefaults(createDefaultState());
    }
  }

  function buildSampleProject() {
    return {
      title: '雨夜钟声',
      world:
        '民国十七年的江南小城，梅雨连绵。城中有座废弃的钟楼，传说子夜会敲响不存在的钟声。巡警不敢靠近，只有看门人的女儿苏婉还住在钟楼旁的旧宅。',
      style:
        '冷峻克制的悬疑笔调，短句为主，多用环境与细节暗示情绪；对白简练，不直接解释人物心理。',
      pov: '第三人称',
      characters: [
        {
          id: uid(),
          name: '沈砚',
          role: '私家侦探',
          personality:
            '冷静寡言，观察入微，对旧案有执念；不轻易信人，却会在关键时刻护短。说话简短，习惯用反问。',
        },
        {
          id: uid(),
          name: '苏婉',
          role: '钟楼看门人的女儿',
          personality:
            '外柔内刚，记性极好，怕黑却常在夜里出门；说话爱绕弯子，习惯用旧事转移话题。',
        },
      ],
      rollingSummary: '',
      chapters: [
        {
          id: uid(),
          title: '钟声',
          brief:
            '雨夜，沈砚收到一封没有署名的信，信里只有钟楼的地图与一行字：“第七声钟响时，别回头。”他冒雨前往钟楼，在门廊下遇见等在那里的苏婉。苏婉声称自己只是来关窗，但沈砚发现她手里攥着第二封信。',
          style: '',
          targetWords: 1500,
          content: '',
          summary: '',
          summaryBase: '',
          prompt: null,
          status: 'draft',
          createdAt: Date.now(),
        },
      ],
    };
  }

  let state = null;
  let saveTimer = null;
  let generating = false;
  let summarizing = false;
  let abortController = null;
  let toastTimer = null;
  let testingApi = false;

  const project = () => state.project;
  const chapters = () => state.project.chapters;

  function activeChapter() {
    return chapters().find((item) => item.id === state.ui.activeChapterId) || null;
  }

  function activeIndex() {
    return chapters().findIndex((item) => item.id === state.ui.activeChapterId);
  }

  /* ---------- 持久化 ---------- */

  function setSync(text, isSaving = false) {
    const el = $('sync-state');
    el.textContent = text;
    el.classList.toggle('saving', isSaving);
  }

  function persist() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSync('已保存');
    } catch (err) {
      setSync('保存失败');
      toast('本地存储写入失败：' + err.message, 'error', 5000);
    }
  }

  function persistSoon() {
    setSync('保存中…', true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 500);
  }

  /* ---------- 公共 UI ---------- */

  function toast(message, type = 'info', duration = 2600) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, duration);
  }

  function openModal(id) {
    $(id).classList.remove('hidden');
  }

  function closeModal(id) {
    $(id).classList.add('hidden');
  }

  function setTab(tab, silent = false) {
    state.ui.activeTab = tab;
    $$('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
    if (tab === 'summary') renderSummaryPanel();
    if (tab === 'setup') renderSetup();
    if (!silent) persist();
  }

  /* ---------- 渲染 ---------- */

  function renderHeader() {
    const input = $('novel-title');
    if (input.value !== project().title) input.value = project().title;
  }

  function updateStylePlaceholder() {
    const globalStyle = project().style.trim();
    const preview = globalStyle.length > 28 ? globalStyle.slice(0, 28) + '…' : globalStyle;
    $('chapter-style').placeholder = preview
      ? '留空则使用全局文风：' + preview
      : '留空则使用默认文风（朴素自然）';
  }

  function renderChapterList() {
    const list = $('chapter-list');
    if (!chapters().length) {
      list.innerHTML = '<li class="chapter-empty">还没有章节。<br>点击上方按钮开始第一章。</li>';
      return;
    }
    list.innerHTML = chapters()
      .map((chapter, index) => {
        const active = chapter.id === state.ui.activeChapterId;
        const count = countChars(chapter.content);
        const dotClass = chapter.status === 'generating'
          ? 'generating'
          : chapter.summary
            ? 'has-summary'
            : '';
        const sub = chapter.status === 'generating'
          ? '正在生成…'
          : `${count} 字${chapter.summary ? ' · 已总结' : ''}`;
        return `
          <li class="chapter-item${active ? ' active' : ''}" data-id="${esc(chapter.id)}">
            <span class="chapter-num">${String(index + 1).padStart(2, '0')}</span>
            <span class="chapter-main">
              <span class="chapter-name">${esc(chapter.title.trim() || '未命名章节')}</span>
              <span class="chapter-sub">${sub}</span>
            </span>
            <span class="chapter-dot ${dotClass}" title="${chapter.summary ? '已有摘要' : '暂无摘要'}"></span>
          </li>`;
      })
      .join('');
  }

  function renderEditor() {
    const chapter = activeChapter();
    const empty = $('editor-empty');
    const editor = $('editor');

    if (!chapter) {
      empty.classList.remove('hidden');
      editor.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    editor.classList.remove('hidden');

    $('chapter-no').textContent = `第 ${activeIndex() + 1} 章`;

    const titleInput = $('chapter-title');
    if (titleInput.value !== chapter.title) titleInput.value = chapter.title;

    const styleInput = $('chapter-style');
    if (styleInput.value !== chapter.style) styleInput.value = chapter.style;
    updateStylePlaceholder();

    const wordsInput = $('chapter-words');
    if (Number(wordsInput.value) !== chapter.targetWords) wordsInput.value = chapter.targetWords;

    const briefInput = $('chapter-brief');
    if (briefInput.value !== chapter.brief) briefInput.value = chapter.brief;

    const contentInput = $('chapter-content');
    if (contentInput.value !== chapter.content) contentInput.value = chapter.content;

    updateWordCount();
    refreshActionState();
  }

  function updateWordCount() {
    const count = countChars($('chapter-content').value);
    $('word-count').textContent = count.toLocaleString('zh-CN') + ' 字';
  }

  function refreshActionState() {
    const generateBtn = $('btn-generate');
    const stopBtn = $('btn-stop');
    const summarizeBtn = $('btn-summarize');
    const newBtn = $('btn-new-chapter');

    generateBtn.disabled = generating || summarizing;
    generateBtn.textContent = generating ? '生成中…' : '生成本章';
    stopBtn.classList.toggle('hidden', !generating);
    summarizeBtn.disabled = generating || summarizing || !activeChapter();
    summarizeBtn.textContent = summarizing ? '总结中…' : '重新总结本章';
    newBtn.disabled = generating;
    $('btn-empty-new').disabled = generating;
    $('btn-delete-chapter').disabled = generating || summarizing;

    $('chapter-content').readOnly = generating;
    $('chapter-title').readOnly = generating;
    $('chapter-style').readOnly = generating;
    $('chapter-words').readOnly = generating;
    $('chapter-brief').readOnly = generating;

    $('generate-state').textContent = generating
      ? '正在生成本章，请稍候…'
      : summarizing
        ? '正在更新情节梗概…'
        : '';
  }

  function renderSummaryPanel() {
    const textarea = $('rolling-summary');
    if (document.activeElement !== textarea) {
      textarea.value = project().rollingSummary;
    }

    const list = $('chapter-summaries');
    if (!chapters().length) {
      list.innerHTML = '<p class="hint">还没有章节。</p>';
      return;
    }

    list.innerHTML = chapters()
      .map((chapter, index) => {
        const titleText = `第 ${index + 1} 章${chapter.title.trim() ? ' · ' + chapter.title.trim() : ''}`;
        return `
          <button class="summary-item" type="button" data-id="${esc(chapter.id)}">
            <span class="summary-item-head">
              <span>${esc(titleText)}</span>
              <span class="summary-arrow">→</span>
            </span>
            <span class="summary-item-text${chapter.summary ? '' : ' muted'}">${chapter.summary ? esc(chapter.summary) : '尚未生成摘要，可在章节页手动总结'}</span>
          </button>`;
      })
      .join('');
  }

  function renderSetup() {
    const world = $('setup-world');
    if (document.activeElement !== world) world.value = project().world;
    const style = $('setup-style');
    if (document.activeElement !== style) style.value = project().style;
    $('setup-pov').value = project().pov;
    renderCharacters();
    updateStylePlaceholder();
  }

  function renderCharacters() {
    const wrap = $('character-list');
    if (!project().characters.length) {
      wrap.innerHTML = '<p class="hint">还没有人物。添加人物后，生成时会带上他们的性格设定。</p>';
      return;
    }
    wrap.innerHTML = project().characters
      .map(
        (character) => `
          <div class="character-card" data-cid="${esc(character.id)}">
            <div class="character-head">
              <input class="input" data-field="name" value="${esc(character.name)}" placeholder="姓名" maxlength="30">
              <button class="icon-btn" type="button" data-action="remove-character" title="删除人物">×</button>
            </div>
            <input class="input" data-field="role" value="${esc(character.role)}" placeholder="身份 / 定位" maxlength="40">
            <textarea class="textarea" data-field="personality" rows="3" placeholder="性格、欲望、说话方式、与他人的关系……">${esc(character.personality)}</textarea>
          </div>`,
      )
      .join('');
  }

  function renderAll() {
    if (chapters().length && !activeChapter()) {
      state.ui.activeChapterId = chapters()[0].id;
    }
    renderHeader();
    renderChapterList();
    renderEditor();
    renderSummaryPanel();
    renderSetup();
  }

  /* ---------- 章节操作 ---------- */

  function selectChapter(id) {
    if (generating) {
      toast('请先停止当前生成，再切换章节', 'error');
      return;
    }
    state.ui.activeChapterId = id;
    persist();
    renderChapterList();
    renderEditor();
  }

  function newChapter() {
    if (generating || summarizing) {
      toast('当前有任务进行中，请稍后再新建章节', 'error');
      return;
    }
    const chapter = {
      id: uid(),
      title: '',
      brief: '',
      style: '',
      targetWords: 1500,
      content: '',
      summary: '',
      summaryBase: project().rollingSummary,
      prompt: null,
      status: 'draft',
      createdAt: Date.now(),
    };
    chapters().push(chapter);
    state.ui.activeChapterId = chapter.id;
    persist();
    renderChapterList();
    renderEditor();
    setTab('chapters', true);
    $('chapter-brief').focus();
    toast(`已新建第 ${chapters().length} 章`, 'info', 1800);
  }

  function deleteCurrentChapter() {
    if (generating || summarizing) {
      toast('当前有任务进行中，请稍后再删除', 'error');
      return;
    }
    const chapter = activeChapter();
    if (!chapter) return;
    const index = activeIndex();
    const label = chapter.title.trim() || `第 ${index + 1} 章`;
    if (!confirm(`确定删除「${label}」？正文和摘要都会一起删除，无法恢复。`)) return;

    const wasLast = index === chapters().length - 1;
    let rolledBack = false;
    if (wasLast && chapter.summary && typeof chapter.summaryBase === 'string') {
      project().rollingSummary = chapter.summaryBase;
      rolledBack = true;
    }

    project().chapters.splice(index, 1);
    state.ui.activeChapterId = (chapters()[index] || chapters()[index - 1] || {}).id || null;

    persist();
    renderChapterList();
    renderEditor();
    renderSummaryPanel();
    if (rolledBack) toast('已删除本章，故事梗概回退到该章之前', 'info', 3200);
  }

  /* ---------- 提示词 ---------- */

  function buildChapterPrompt(chapter, index) {
    const p = project();
    const chapterNo = index + 1;
    const style =
      chapter.style.trim() || p.style.trim() || '朴素自然，注重人物心理与环境细节';
    const characterLines = p.characters
      .map((character) => {
        const name = character.name.trim();
        if (!name) return null;
        const role = character.role.trim();
        const traits = character.personality.trim();
        return `- ${name}${role ? `（${role}）` : ''}${traits ? `：${traits}` : ''}`;
      })
      .filter(Boolean);
    const characterText = characterLines.length
      ? characterLines.join('\n')
      : '（暂无人物设定，请依据情节合理塑造）';
    const previous = p.chapters[index - 1];
    const previousTail = previous?.content ? previous.content.trim().slice(-600) : '';

    const system = `你是一位资深中文小说作家。请为长篇小说《${p.title.trim() || '未命名小说'}》撰写第${chapterNo}章正文。

【文风要求】
${style}

【叙事人称】
${p.pov || '第三人称'}

【世界观设定】
${p.world.trim() || '（未特别设定）'}

【人物设定】
${characterText}

【写作准则】
1. 严格贴合人物性格与既有剧情，人物言行不得脱离设定；
2. 自然承接前文，不复述已有情节，不提前写完后续剧情；
3. 只推进“本章情节要点”给出的内容，可适度补充细节；
4. 只输出本章正文，不写标题、章节号、大纲、说明或任何元信息；
5. 多用动作、对话与细节，少用空泛抒情，语言具体、有画面感；
6. 篇幅约 ${chapter.targetWords || 1500} 字。`;

    const user = `【故事到目前为止的梗概】
${p.rollingSummary.trim() || '（故事刚刚开始，暂无前情。）'}

【上一章结尾（仅供衔接，不要照抄）】
${previousTail || '（无）'}

【本章】
第${chapterNo}章${chapter.title.trim() ? `　${chapter.title.trim()}` : ''}

【本章情节要点】
${chapter.brief.trim() || '（未填写具体要点，请依据梗概自然推进，并为下一章留下钩子。）'}

请开始创作本章正文。`;

    return { system, user, style, chapterNo };
  }

  function openPromptModal() {
    const chapter = activeChapter();
    if (!chapter) return;

    const stored = chapter.prompt;
    let prompt;
    let meta;
    if (stored) {
      prompt = stored;
      meta = `上次生成本章所用提示词 · ${nowText(stored.createdAt)} · 模型 ${stored.model || '—'} · 温度 ${Number.isFinite(Number(stored.temperature)) ? Number(stored.temperature) : '—'}`;
    } else {
      prompt = buildChapterPrompt(chapter, activeIndex());
      meta = '尚未生成 · 以下是根据当前设定将要发送的提示词';
    }

    $('prompt-meta').textContent = meta;
    $('prompt-system').textContent = prompt.system || '';
    $('prompt-user').textContent = prompt.user || '';
    openModal('prompt-modal');
  }

  async function copyPrompt() {
    const text = `【系统提示词】\n${$('prompt-system').textContent}\n\n【用户提示词】\n${$('prompt-user').textContent}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('完整提示词已复制', 'success');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        toast('完整提示词已复制', 'success');
      } catch {
        toast('复制失败，请手动选择文本', 'error');
      }
      area.remove();
    }
  }

  /* ---------- API 调用 ---------- */

  function apiPayload(extra) {
    const s = state.settings;
    return {
      baseUrl: s.baseUrl,
      apiKey: s.apiKey,
      model: s.model,
      ...extra,
    };
  }

  async function readError(response) {
    let message = '';
    try {
      const data = await response.json();
      message = data?.error || '';
    } catch {
      message = `请求失败（HTTP ${response.status}）`;
    }
    return message || `请求失败（HTTP ${response.status}）`;
  }

  async function streamChat({ messages, temperature, maxTokens, onDelta, signal }) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        apiPayload({
          messages,
          temperature,
          maxTokens,
          stream: true,
        }),
      ),
      signal,
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }
    if (!response.body) throw new Error('浏览器不支持流式响应');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let json;
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          if (json?.error) {
            throw new Error(json.error?.message || String(json.error));
          }
          const choice = json?.choices?.[0];
          const delta = choice?.delta?.content ?? choice?.message?.content ?? '';
          if (delta) onDelta(delta);
        }
      }
    }
  }

  async function chatOnce({ messages, temperature, maxTokens }) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        apiPayload({
          messages,
          temperature,
          maxTokens,
          stream: false,
        }),
      ),
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    if (data?.error) throw new Error(data.error);
    return String(data?.content || '');
  }

  function validateApiConfig({ requireModel = true } = {}) {
    const s = state.settings;
    if (!s.baseUrl.trim()) throw new Error('请先在 API 设置中填写 API 地址');
    if (!s.apiKey.trim()) throw new Error('请先在 API 设置中填写 API Key');
    if (requireModel && !s.model.trim()) throw new Error('请先在 API 设置中填写模型名称');
  }

  /* ---------- 章节生成 ---------- */

  async function generateCurrentChapter() {
    const chapter = activeChapter();
    if (!chapter || generating || summarizing) return;

    try {
      validateApiConfig();
    } catch (err) {
      toast(err.message, 'error', 4000);
      openApiModal();
      return;
    }

    if (!chapter.brief.trim()) {
      const proceed = confirm('本章还没有填写情节要点，AI 只会依据梗概自然推进。继续生成吗？');
      if (!proceed) return;
    }

    if (chapter.content.trim()) {
      const proceed = confirm('本章已有正文，重新生成会覆盖现有内容。继续吗？');
      if (!proceed) return;
    }

    const index = activeIndex();
    const prompt = buildChapterPrompt(chapter, index);
    chapter.prompt = {
      system: prompt.system,
      user: prompt.user,
      style: prompt.style,
      model: state.settings.model,
      temperature: state.settings.temperature,
      createdAt: Date.now(),
    };
    chapter.content = '';
    chapter.summary = '';
    chapter.status = 'generating';

    const contentArea = $('chapter-content');
    contentArea.value = '';
    updateWordCount();

    generating = true;
    refreshActionState();
    renderChapterList();
    persist();

    abortController = new AbortController();
    let succeeded = false;

    try {
      await streamChat({
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: state.settings.temperature,
        maxTokens: state.settings.maxTokens,
        signal: abortController.signal,
        onDelta: (delta) => {
          const stickToBottom =
            contentArea.scrollHeight - contentArea.scrollTop - contentArea.clientHeight < 48;
          chapter.content += delta;
          contentArea.value = chapter.content;
          if (stickToBottom) contentArea.scrollTop = contentArea.scrollHeight;
          updateWordCount();
          persistSoon();
        },
      });

      if (chapter.content.trim()) {
        chapter.status = 'done';
        succeeded = true;
        toast('本章生成完成', 'success');
      } else {
        chapter.status = 'error';
        toast('模型没有返回内容，请检查模型名称与参数', 'error', 5000);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        chapter.status = chapter.content.trim() ? 'stopped' : 'draft';
        toast('已停止生成，保留已生成的部分', 'info', 3000);
      } else {
        chapter.status = 'error';
        toast('生成失败：' + err.message, 'error', 6000);
      }
    } finally {
      abortController = null;
      generating = false;
      refreshActionState();
      persist();
      renderChapterList();
      renderSummaryPanel();
    }

    if (succeeded && state.settings.autoSummary && chapter.content.trim()) {
      await updateStorySummary(chapter);
    }
  }

  function stopGeneration() {
    if (abortController) abortController.abort();
  }

  /* ---------- 情节总结 ---------- */

  function buildSummaryPrompt(chapter, base) {
    const index = chapters().indexOf(chapter) + 1;
    const title = chapter.title.trim();
    const system = '你是一名严谨的小说编辑，负责维护长篇小说的情节档案。你只输出规定格式的内容，不写任何额外解释。';
    const user = `【已有的累计故事梗概】
${base.trim() || '（这是故事的开篇，尚无累计梗概。）'}

【第${index}章${title ? `　${title}` : ''}正文】
${chapter.content.trim()}

请完成以下任务，并严格按格式输出：
<chapter_summary>概括本章的关键事件、人物变化与留下的悬念，100-180字</chapter_summary>
<story_summary>把本章并入已有梗概，输出“故事到目前为止”的累计梗概：按时间顺序、400-600字，保留重要伏笔和未解决的冲突，只写已经发生的内容</story_summary>`;
    return { system, user };
  }

  function parseSummaryOutput(text) {
    const chapterMatch = text.match(/<chapter_summary>([\s\S]*?)<\/chapter_summary>/i);
    const storyMatch = text.match(/<story_summary>([\s\S]*?)<\/story_summary>/i);
    if (chapterMatch || storyMatch) {
      return {
        chapterSummary: (chapterMatch?.[1] || '').trim(),
        storySummary: (storyMatch?.[1] || '').trim(),
      };
    }
    const clean = text.replace(/<[^>]+>/g, '').trim();
    return {
      chapterSummary: clean.slice(0, 300),
      storySummary: clean,
    };
  }

  async function updateStorySummary(chapter) {
    if (!chapter || !chapter.content.trim()) {
      toast('本章还没有正文，无法总结', 'error');
      return;
    }
    if (generating || summarizing) return;

    try {
      validateApiConfig();
    } catch (err) {
      toast(err.message, 'error', 4000);
      openApiModal();
      return;
    }

    const base = typeof chapter.summaryBase === 'string' ? chapter.summaryBase : project().rollingSummary;

    summarizing = true;
    refreshActionState();
    try {
      const { system, user } = buildSummaryPrompt(chapter, base);
      const output = await chatOnce({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        maxTokens: 2000,
      });

      const { chapterSummary, storySummary } = parseSummaryOutput(output);
      if (!chapterSummary && !storySummary) {
        throw new Error('模型没有返回可用的摘要内容');
      }

      chapter.summary = chapterSummary || chapter.summary;
      chapter.summaryBase = base;

      const isLast = chapters().indexOf(chapter) === chapters().length - 1;
      if (isLast && storySummary) {
        project().rollingSummary = storySummary;
      }

      persist();
      renderSummaryPanel();
      renderChapterList();

      if (isLast) {
        toast('故事梗概已更新', 'success');
      } else {
        toast('本章摘要已更新（累计梗概只随最新一章推进）', 'info', 3600);
      }
    } catch (err) {
      toast('总结失败：' + err.message, 'error', 6000);
    } finally {
      summarizing = false;
      refreshActionState();
    }
  }

  /* ---------- API 设置弹窗 ---------- */

  function openApiModal() {
    const s = state.settings;
    $('api-base').value = s.baseUrl;
    $('api-key').value = s.apiKey;
    $('api-model').value = s.model;
    $('api-temperature').value = String(s.temperature);
    $('temp-value').textContent = Number(s.temperature).toFixed(1);
    $('api-maxtokens').value = String(s.maxTokens);
    $('api-autosum').checked = s.autoSummary !== false;
    $('api-test-result').textContent = '';
    $('api-test-result').className = 'test-result';
    openModal('api-modal');
  }

  function readApiForm({ requireModel = true } = {}) {
    const baseUrl = $('api-base').value.trim();
    const apiKey = $('api-key').value.trim();
    const model = $('api-model').value.trim();

    if (!baseUrl) throw new Error('请填写 API 地址');
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('API 地址格式不正确，需要以 http:// 或 https:// 开头');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('API 地址必须是 http 或 https');
    }
    if (!apiKey) throw new Error('请填写 API Key');
    if (requireModel && !model) throw new Error('请填写模型名称');

    return {
      baseUrl,
      apiKey,
      model,
      temperature: clampNumber($('api-temperature').value, 0, 1.5, 1),
      maxTokens: Math.round(clampNumber($('api-maxtokens').value, 256, 32000, 4096)),
      autoSummary: $('api-autosum').checked,
    };
  }

  function saveApiSettings() {
    try {
      const config = readApiForm();
      Object.assign(state.settings, config);
      persist();
      closeModal('api-modal');
      toast('API 设置已保存', 'success');
    } catch (err) {
      toast(err.message, 'error', 4000);
    }
  }

  function setTestResult(message, type = '') {
    const el = $('api-test-result');
    el.textContent = message;
    el.className = 'test-result' + (type ? ' ' + type : '');
  }

  async function probeApi(config) {
    const payloadBase = { baseUrl: config.baseUrl, apiKey: config.apiKey };
    let modelsError = '';

    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBase),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data && !data.error) {
        const models = Array.isArray(data.models) ? data.models : [];
        if (models.length) {
          $('model-list').innerHTML = models
            .map((model) => `<option value="${esc(model)}"></option>`)
            .join('');
          return {
            message: `连接成功，检测到 ${models.length} 个模型。可从输入框下拉选择模型名称。`,
            type: 'ok',
          };
        }
        return { message: '连接成功。上游未返回模型列表，可直接填写模型名称。', type: 'ok' };
      }
      modelsError = data?.error || `模型列表请求失败（HTTP ${response.status}）`;
    } catch (err) {
      modelsError = err.message;
    }

    if (!config.model) {
      return {
        message:
          (modelsError ? modelsError + '\n' : '') +
          '无法获取模型列表，请填写模型名称后再测试对话接口。',
        type: 'error',
      };
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payloadBase,
          model: config.model,
          messages: [{ role: 'user', content: '请只回复：连接成功' }],
          temperature: 0,
          maxTokens: 32,
          stream: false,
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data && !data.error) {
        return { message: '连接成功，模型可以正常回复。', type: 'ok' };
      }
      return {
        message:
          (modelsError ? `模型列表获取失败：${modelsError}\n` : '') +
          (data?.error || `对话接口请求失败（HTTP ${response.status}）`),
        type: 'error',
      };
    } catch (err) {
      return {
        message: (modelsError ? `模型列表获取失败：${modelsError}\n` : '') + err.message,
        type: 'error',
      };
    }
  }

  async function testApiConnection() {
    if (testingApi) return;

    let config;
    try {
      config = readApiForm({ requireModel: false });
    } catch (err) {
      setTestResult(err.message, 'error');
      return;
    }

    testingApi = true;
    const button = $('btn-test-api');
    button.disabled = true;
    button.textContent = '测试中…';
    setTestResult('正在连接…');

    try {
      const result = await probeApi(config);
      setTestResult(result.message, result.type);
    } catch (err) {
      setTestResult('连接失败：' + err.message, 'error');
    } finally {
      testingApi = false;
      button.disabled = false;
      button.textContent = '测试连接';
    }
  }

  /* ---------- 导出 ---------- */

  function exportNovel() {
    if (!chapters().length) {
      toast('还没有章节可以导出', 'error');
      return;
    }
    const title = project().title.trim() || '未命名小说';
    const body = chapters()
      .map((chapter, index) => {
        const heading = `第${index + 1}章${chapter.title.trim() ? `　${chapter.title.trim()}` : ''}`;
        return `${heading}\n\n${chapter.content.trim() || '（本章尚无正文）'}`;
      })
      .join('\n\n\n');
    const text = `《${title}》\n\n${body}\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('已导出为 txt 文件', 'success');
  }

  /* ---------- 示例 ---------- */

  function loadSampleProject() {
    if (generating || summarizing) {
      toast('当前有任务进行中，请稍后再载入示例', 'error');
      return;
    }
    if (!confirm('载入示例项目会覆盖当前小说的设定、章节与梗概（API 设置保留）。确定继续吗？')) return;

    state.project = buildSampleProject();
    state.ui.activeChapterId = state.project.chapters[0].id;
    state.ui.activeTab = 'chapters';
    persist();
    renderAll();
    setTab('chapters', true);
    toast('示例项目已载入，配置 API Key 后即可生成', 'success', 3600);
  }

  /* ---------- 事件绑定 ---------- */

  function bindEvents() {
    $('novel-title').addEventListener('input', (event) => {
      project().title = event.target.value;
      persistSoon();
    });

    $$('.tab').forEach((button) => {
      button.addEventListener('click', () => setTab(button.dataset.tab));
    });

    $('btn-new-chapter').addEventListener('click', newChapter);
    $('btn-empty-new').addEventListener('click', newChapter);
    $('btn-empty-sample').addEventListener('click', loadSampleProject);
    $('btn-sample').addEventListener('click', loadSampleProject);
    $('btn-export').addEventListener('click', exportNovel);
    $('btn-api').addEventListener('click', openApiModal);
    $('btn-save-api').addEventListener('click', saveApiSettings);
    $('btn-test-api').addEventListener('click', testApiConnection);
    $('btn-generate').addEventListener('click', generateCurrentChapter);
    $('btn-stop').addEventListener('click', stopGeneration);
    $('btn-delete-chapter').addEventListener('click', deleteCurrentChapter);
    $('btn-view-prompt').addEventListener('click', openPromptModal);
    $('btn-copy-prompt').addEventListener('click', copyPrompt);
    $('btn-summarize').addEventListener('click', () => {
      const chapter = activeChapter();
      if (chapter) updateStorySummary(chapter);
    });

    $('btn-add-character').addEventListener('click', () => {
      project().characters.push({ id: uid(), name: '', role: '', personality: '' });
      persist();
      renderCharacters();
      const inputs = $$('#character-list [data-field="name"]');
      inputs[inputs.length - 1]?.focus();
    });

    $('character-list').addEventListener('input', (event) => {
      const card = event.target.closest('[data-cid]');
      const field = event.target.dataset.field;
      if (!card || !field) return;
      const character = project().characters.find((item) => item.id === card.dataset.cid);
      if (!character) return;
      character[field] = event.target.value;
      persistSoon();
    });

    $('character-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="remove-character"]');
      if (!button) return;
      const card = button.closest('[data-cid]');
      if (!card) return;
      const character = project().characters.find((item) => item.id === card.dataset.cid);
      if (!character) return;
      if (!confirm(`删除人物「${character.name.trim() || '未命名'}」？`)) return;
      project().characters = project().characters.filter((item) => item.id !== character.id);
      persist();
      renderCharacters();
    });

    $('chapter-list').addEventListener('click', (event) => {
      const item = event.target.closest('[data-id]');
      if (!item) return;
      selectChapter(item.dataset.id);
    });

    $('chapter-summaries').addEventListener('click', (event) => {
      const item = event.target.closest('[data-id]');
      if (!item) return;
      if (generating) {
        toast('请先停止当前生成，再切换章节', 'error');
        return;
      }
      state.ui.activeChapterId = item.dataset.id;
      persist();
      renderChapterList();
      renderEditor();
      setTab('chapters', true);
    });

    $('chapter-title').addEventListener('input', (event) => {
      const chapter = activeChapter();
      if (!chapter) return;
      chapter.title = event.target.value;
      persistSoon();
      renderChapterList();
    });

    $('chapter-style').addEventListener('input', (event) => {
      const chapter = activeChapter();
      if (!chapter) return;
      chapter.style = event.target.value;
      persistSoon();
    });

    $('chapter-words').addEventListener('input', (event) => {
      const chapter = activeChapter();
      if (!chapter) return;
      const value = Number(event.target.value);
      if (Number.isFinite(value) && value > 0) {
        chapter.targetWords = Math.round(clampNumber(value, 200, 20000, 1500));
        persistSoon();
      }
    });

    $('chapter-words').addEventListener('blur', (event) => {
      const chapter = activeChapter();
      if (!chapter) return;
      event.target.value = String(chapter.targetWords);
    });

    $('chapter-brief').addEventListener('input', (event) => {
      const chapter = activeChapter();
      if (!chapter) return;
      chapter.brief = event.target.value;
      persistSoon();
    });

    $('chapter-brief').addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        generateCurrentChapter();
      }
    });

    $('chapter-content').addEventListener('input', (event) => {
      const chapter = activeChapter();
      if (!chapter) return;
      chapter.content = event.target.value;
      updateWordCount();
      persistSoon();
    });

    $('rolling-summary').addEventListener('input', (event) => {
      project().rollingSummary = event.target.value;
      // 手动修改梗概时，让尚未总结的最新一章使用这份新梗概作为基准
      const last = chapters()[chapters().length - 1];
      if (last && !last.summary && !summarizing) last.summaryBase = project().rollingSummary;
      persistSoon();
    });

    $('setup-world').addEventListener('input', (event) => {
      project().world = event.target.value;
      persistSoon();
    });

    $('setup-style').addEventListener('input', (event) => {
      project().style = event.target.value;
      persistSoon();
      updateStylePlaceholder();
    });

    $('setup-pov').addEventListener('change', (event) => {
      project().pov = event.target.value;
      persistSoon();
    });

    $('api-temperature').addEventListener('input', (event) => {
      $('temp-value').textContent = Number(event.target.value).toFixed(1);
    });

    $$('[data-close]').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.dataset.close));
    });

    $$('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        $$('.modal').forEach((modal) => {
          if (!modal.classList.contains('hidden')) closeModal(modal.id);
        });
      }
    });

    window.addEventListener('beforeunload', () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        persist();
      }
    });
  }

  function init() {
    if (chapters().length && !activeChapter()) {
      state.ui.activeChapterId = chapters()[0].id;
    }
    renderAll();
    bindEvents();
    setTab(state.ui.activeTab || 'chapters', true);
  }

  async function boot() {
    LOCAL_DEFAULTS = await loadLocalDefaults();
    state = loadState();
    init();
  }

  boot();
})();
