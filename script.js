(() => {
  'use strict';

  /* ============================================================
     1. Константы и тексты
     ============================================================ */

  const API_BASE = 'https://dummyjson.com/users/';
  const DEFAULT_IDS = [1, 2, 3];
  const MAX_IDS_COUNT = 5;
  const MAX_DELAY = 5000;

  const INVALID_IDS_TEXT =
    'Некорректные параметры: ids должен содержать от 1 до 5 ' +
    'положительных целых чисел, разделённых запятыми. Запросы не выполнялись.';

  /* ============================================================
     2. Ссылки на DOM и общее состояние
     ============================================================ */

  const summaryEl = document.getElementById('summary');
  const usersEl = document.getElementById('users');
  const cancelBtn = document.getElementById('cancel');

  const searchParams = new URLSearchParams(window.location.search);

  const appState = {
    isRunning: false,
  };

  /* ============================================================
     3. Разбор параметров адресной строки
     ============================================================ */

  function parseIds(raw) {
    if (raw === null) {
      return { ok: true, ids: DEFAULT_IDS.slice() };
    }

    const parts = raw.split(',');
    if (parts.length > MAX_IDS_COUNT) {
      return { ok: false };
    }

    const ids = [];
    for (const part of parts) {
      const value = part.trim();
      if (!/^\d+$/.test(value)) {
        return { ok: false };
      }
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) {
        return { ok: false };
      }
      ids.push(id);
    }

    return { ok: true, ids };
  }

  function parseDelay(raw) {
    if (raw === null) return 0;

    const value = raw.trim();
    if (!/^\d+$/.test(value)) return 0;

    const delay = Number(value);
    if (!Number.isFinite(delay)) return 0;

    return Math.min(delay, MAX_DELAY);
  }

  /* ============================================================
     4. Работа с DOM: summary и карточки
     ============================================================ */

  function setSummary(state, text) {
    summaryEl.dataset.state = state;
    summaryEl.textContent = text;
  }

  function createPlaceholder(id) {
    const article = document.createElement('article');
    article.dataset.id = String(id);
    article.dataset.state = 'loading';

    const message = document.createElement('span');
    message.className = 'message';
    message.textContent = 'Загрузка…';
    article.append(message);

    return article;
  }

  function resetCard(article, state) {
    article.replaceChildren();
    article.dataset.state = state;
  }

  function renderSuccess(article, user) {
    resetCard(article, 'success');

    const fullName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const name = document.createElement('h2');
    name.className = 'name';
    name.textContent = fullName || 'Без имени';

    const address = user?.email || '';

    const email = document.createElement('a');
    email.className = 'email';
    email.textContent = address;
    email.setAttribute('href', 'mailto:' + address);

    const city = document.createElement('span');
    city.className = 'city';
    city.textContent = user?.address?.city || '—';

    const company = document.createElement('span');
    company.className = 'company';
    company.textContent = user?.company?.name || '—';

    article.append(name, email, city, company);
  }

  function renderMessage(article, state, text) {
    resetCard(article, state);

    const message = document.createElement('span');
    message.className = 'message';
    message.textContent = text;

    article.append(message);
  }

  /* ============================================================
     5. Fetch API
     ============================================================ */

  async function fetchUser(id, delay, signal) {
    const url =
      API_BASE +
      encodeURIComponent(id) +
      '?delay=' +
      encodeURIComponent(delay);

    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    return response.json();
  }

  function isAbortReason(reason) {
    return Boolean(reason) && reason.name === 'AbortError';
  }

  /* ============================================================
     6. Основной сценарий
     ============================================================ */

  async function run() {
    const idsResult = parseIds(searchParams.get('ids'));

    if (!idsResult.ok) {
      setSummary('error', INVALID_IDS_TEXT);
      return;
    }

    const ids = idsResult.ids;
    const delay = parseDelay(searchParams.get('delay'));

    const controller = new AbortController();
    appState.isRunning = true;

    cancelBtn.addEventListener('click', () => {
      if (appState.isRunning) {
        controller.abort();
      }
    });

    // Карточки создаются заранее — порядок совпадает с порядком ids.
    const articles = ids.map((id) => createPlaceholder(id));
    usersEl.replaceChildren(...articles);

    setSummary('loading', 'Загрузка...');

    // Все запросы стартуют одновременно.
    const results = await Promise.allSettled(
      ids.map((id) => fetchUser(id, delay, controller.signal))
    );

    appState.isRunning = false;

    let loaded = 0;
    let failed = 0;
    let aborted = 0;

    results.forEach((result, index) => {
      const article = articles[index];

      if (result.status === 'fulfilled') {
        loaded += 1;
        renderSuccess(article, result.value);
        return;
      }

      if (isAbortReason(result.reason)) {
        aborted += 1;
        renderMessage(article, 'aborted', 'Запрос отменён');
        return;
      }

      failed += 1;
      const text = result.reason?.message || 'Ошибка запроса';
      renderMessage(article, 'error', text);
    });

    const total = results.length;

    if (aborted > 0) {
      setSummary(
        'aborted',
        `Запросы отменены. Загружено: ${loaded}; отменено: ${aborted}; ошибок: ${failed}`
      );
    } else if (loaded === total) {
      setSummary('success', `Загружено: ${loaded}; ошибок: 0`);
    } else if (loaded === 0) {
      setSummary('error', `Загружено: 0; ошибок: ${failed}`);
    } else {
      setSummary('partial', `Загружено: ${loaded}; ошибок: ${failed}`);
    }
  }

  run();
})();
