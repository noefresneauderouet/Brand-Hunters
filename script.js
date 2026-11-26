'use strict';

/* =============================================================================
   Brand Hunters · Scorekeeper
   -----------------------------------------------------------------------------
   • Plain JavaScript: no framework, no library, no build step.
   • Everything is stored in the browser (localStorage).

   Contents
     1. Constants                      7. The hunt (scores, turns, hunters)
     2. Utilities                      8. Timer, alarm, wake lock
     3. Storage (localStorage)         9. Dialogs
     4. State                         10. End of hunt, results, history
     5. Navigation                    11. Rules page
     6. New game                      12. Keyboard, events, start-up
   ========================================================================== */


/* =============================================================================
   1. Constants
   ========================================================================== */

/** localStorage keys (same keys as earlier versions: saved data is kept). */
const STORAGE_KEYS = Object.freeze({
  game: 'compteurPoints.v1.partieEnCours',
  history: 'compteurPoints.v1.historique',
  setup: 'compteurPoints.v1.configuration',
  prefs: 'compteurPoints.v1.preferences',
  bounties: 'compteurPoints.v1.primes',
});

/**
 * Rules videos: a YouTube link (e.g. "https://youtu.be/XXXXXXXXXXX") or the
 * path of a video file placed next to index.html (e.g. "rules.mp4").
 *   desktop: 16:9 video, for computers and tablets in landscape;
 *   mobile:  vertical video (9:16) for phones. Empty = phones get the desktop one.
 * Both empty: “Rules video coming soon”.
 */
const RULES_VIDEOS = Object.freeze({
  desktop: 'https://youtu.be/qfEYmCxW9WQ',
  mobile: '',
});
/** Screens that get the mobile video (same breakpoint as the compact navigation). */
const MOBILE_VIDEO_QUERY = '(max-width: 899px)';


const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const MAX_NAME_LENGTH = 20;
const MAX_POINTS = 1e9;
/** Round timer presets (seconds), reachable with the arrows. Any other value is “custom”. */
const TURN_PRESETS = Object.freeze([30, 45, 50, 60, 75]);
const DEFAULT_TURN_SECONDS = 60;
const MIN_TURN_SECONDS = 5;
const MAX_TURN_SECONDS = 3600;
const HISTORY_LIMIT = 200;
/** If the timer ran out long ago (page closed), only the visual signal is shown. */
const ALARM_GRACE_MS = 5000;
const ALARM_VIBRATION = [300, 120, 300, 120, 600];
/** Last seconds of the round timer that get a “click” (the revolver is cocked). */
const COUNTDOWN_TICKS = 3;

/** The four bounty tiers of the game cards. */
const BOUNTY_TIERS = Object.freeze([
  { key: 'easy', label: 'Pickpocket', stars: 1 },
  { key: 'medium', label: 'Bandit', stars: 2 },
  { key: 'difficult', label: 'Outlaw', stars: 3 },
  { key: 'wanted', label: 'Most Wanted', stars: 5 },
]);
/** Default points; “penalty” is the wrong-answer value (applied as a negative). */
/** Values from the rulebook (Card levels). */
const DEFAULT_BOUNTIES = Object.freeze({ easy: 100, medium: 200, difficult: 300, wanted: 500, bonus: 50, penalty: 50 });
/** Saved bounty values: version 2 = Most Wanted aligned with the rulebook ($500). */
const BOUNTIES_VERSION = 2;
const BOUNTY_LABELS = Object.freeze({ easy: 'Pickpocket', medium: 'Bandit', difficult: 'Outlaw', wanted: 'Most Wanted', bonus: 'Bonus', penalty: 'Wrong answer' });

/** One star colour per hunter (the 4 tier colours first, then western tones). */
const PLAYER_COLORS = Object.freeze([
  '#78B13A', '#F18930', '#E33B3F', '#B640B4', '#2BA89A',
  '#4F86C6', '#E8C547', '#F07AAE', '#F8C787', '#B07A4E',
]);

const ROUTES = Object.freeze(['new', 'hunt', 'results', 'history', 'rules']);
const ROUTE_TITLES = Object.freeze({ new: 'New game', hunt: 'The hunt', results: 'Results', history: 'History', rules: 'Rules' });



/* =============================================================================
   2. Utilities
   ========================================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const range = (n) => Array.from({ length: n }, (_, i) => i);
const roundScore = (n) => Math.round(n * 100) / 100;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Only touches the page when the text really changes (called 4 times per second). */
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad2 = (n) => String(n).padStart(2, '0');

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char]);
}

function isColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color);
}

function safeColor(color) {
  return isColor(color) ? color : '#F8C787';
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

/** Coloured star of a hunter. */
function starIcon(color, extraClass = '') {
  return `<svg class="icon ${extraClass}" style="--c:${safeColor(color)}" aria-hidden="true" focusable="false"><use href="#i-star"></use></svg>`;
}

function starsHtml(count) {
  return `<span class="tier-stars" aria-hidden="true">${icon('star').repeat(count)}</span>`;
}

/** Fisher-Yates shuffle (returns a copy). */
function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function moveItem(items, from, to) {
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

function isPermutation(items, n) {
  return Array.isArray(items) && items.length === n && range(n).every((i) => items.includes(i));
}

const numberFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

/** 1240 → “1,240”, -50 → “−50” (true minus sign). */
function formatNumber(n) {
  return (n < 0 ? '−' : '') + numberFormatter.format(Math.abs(n));
}

/** 200 → “+200”, -50 → “−50”. */
function formatSigned(n) {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + numberFormatter.format(Math.abs(n));
}

function plural(n, word) {
  return `${formatNumber(n)} ${word}${Math.abs(n) === 1 ? '' : 's'}`;
}

function formatPoints(n) {
  return plural(n, 'point');
}

/** Reads a typed number (“12.5”, “12,5”, “−30”, “1,000”). Returns NaN if invalid. */
function parseNumber(text) {
  let cleaned = String(text).trim().replace(/[\s  ]/g, '').replace(/[−–]/g, '-');
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) cleaned = cleaned.replace(/,/g, ''); // 1,000
  cleaned = cleaned.replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return NaN;
  return roundScore(Number(cleaned));
}

/** Hunt clock: “05:42” or “1:05:42”. */
function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Countdown: “01:00” (rounded up to the next second). */
function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** Round timer setting: 90 → “01:30”. */
function formatTimerSetting(seconds) {
  return `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
}

/** Readable duration: “12 min”, “1 h 05”. */
function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${pad2(m)}` : `${h} h`;
}

/** 30 → “30 s”, 90 → “1 min 30”. */
function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${pad2(s)}` : `${m} min`;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function formatDate(timestamp) {
  return dateFormatter.format(new Date(timestamp));
}

function rankLabel(rank) {
  const tens = rank % 100;
  if (tens >= 11 && tens <= 13) return `${rank}th`;
  return `${rank}${{ 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] || 'th'}`;
}

function ruleLabel(winRule) {
  return winRule === 'low' ? 'Lowest score wins' : 'Highest score wins';
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Valid round duration (whole seconds, 5 s to 60 min) or null. */
function sanitizeTurnSeconds(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_TURN_SECONDS && n <= MAX_TURN_SECONDS ? n : null;
}

/** Reads a typed duration: “90”, “90 s”, “1:30”, “01:30” or “1 min 30”. Returns seconds or null. */
function parseTurnDuration(text) {
  const value = String(text).trim().toLowerCase().replace(/\s+/g, '');
  let match = /^(\d{1,4})(s|sec|secs|seconds?)?$/.exec(value);
  if (match) return sanitizeTurnSeconds(Number(match[1]));
  match = /^(\d{1,2})(?::|min|m)([0-5]?\d)?s?$/.exec(value);
  if (match) return sanitizeTurnSeconds(Number(match[1]) * 60 + Number(match[2] || 0));
  return null;
}

/** Round timer setting: { enabled, seconds, custom }. */
function normalizeTurnTimer(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seconds = sanitizeTurnSeconds(source.seconds) ?? DEFAULT_TURN_SECONDS;
  return {
    enabled: source.enabled !== false,
    seconds,
    custom: !TURN_PRESETS.includes(seconds),
  };
}


/* =============================================================================
   3. Storage (localStorage)
   ========================================================================== */

let storageWarningShown = false;

/** Safe access to localStorage: never crashes (private mode, full quota…). */
const store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      if (!storageWarningShown) {
        storageWarningShown = true;
        showToast('Can’t save: the browser storage is full or disabled.', 4500);
      }
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* nothing to do */ }
  },
};

/** Gives each hunter a colour, avoiding the ones already used. */
function assignColors(players) {
  const used = new Set(players.map((p) => p.color).filter(isColor));
  players.forEach((p) => {
    if (isColor(p.color)) return;
    p.color = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0];
    used.add(p.color);
  });
  return players;
}

function nextFreeColor(players) {
  const used = new Set(players.map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[players.length % PLAYER_COLORS.length];
}

function defaultSetup() {
  return {
    players: range(4).map((i) => ({ name: '', color: PLAYER_COLORS[i] })),
    winRule: 'high',
    conditionalPenalties: true,
    turnTimer: { enabled: true, seconds: DEFAULT_TURN_SECONDS, custom: false },
  };
}

/** Next hunt settings (the New game form). Also reads the format of earlier versions. */
function loadSetup() {
  const saved = store.read(STORAGE_KEYS.setup, null);
  const setup = defaultSetup();
  if (!saved || typeof saved !== 'object') return setup;

  let players = null;
  if (Array.isArray(saved.players)) {
    players = saved.players
      .filter((p) => p && typeof p.name === 'string')
      .map((p) => ({ name: p.name.slice(0, MAX_NAME_LENGTH), color: isColor(p.color) ? p.color : null }));
  } else if (Array.isArray(saved.names)) {
    // Earlier version: names + order (+ count)
    const count = clamp(Number.parseInt(saved.count, 10) || 4, MIN_PLAYERS, MAX_PLAYERS);
    const order = isPermutation(saved.order, count) ? saved.order : range(count);
    players = order.map((slot) => ({ name: String(saved.names[slot] || '').slice(0, MAX_NAME_LENGTH), color: PLAYER_COLORS[slot] }));
  }
  if (players && players.length >= MIN_PLAYERS) setup.players = assignColors(players.slice(0, MAX_PLAYERS));

  setup.winRule = saved.winRule === 'low' ? 'low' : 'high';
  setup.conditionalPenalties = saved.conditionalPenalties !== false;
  if (saved.turnTimer) setup.turnTimer = normalizeTurnTimer(saved.turnTimer);
  return setup;
}

function loadBounties() {
  const saved = store.read(STORAGE_KEYS.bounties, null);
  const bounties = { ...DEFAULT_BOUNTIES };
  if (saved && typeof saved === 'object') {
    Object.keys(DEFAULT_BOUNTIES).forEach((key) => {
      const v = Number(saved[key]);
      if (Number.isFinite(v) && v > 0 && v <= MAX_POINTS) bounties[key] = roundScore(v);
    });
    // Saved before the rulebook: Most Wanted was 400 by default, it is now 500.
    if (saved.version !== BOUNTIES_VERSION && bounties.wanted === 400) {
      bounties.wanted = DEFAULT_BOUNTIES.wanted;
      store.write(STORAGE_KEYS.bounties, { ...bounties, version: BOUNTIES_VERSION });
    }
  }
  return bounties;
}

/** Hunt in progress: its shape is checked so damaged data can never crash the app. */
function loadGame() {
  const game = store.read(STORAGE_KEYS.game, null);
  const valid = game && typeof game === 'object'
    && Array.isArray(game.players) && game.players.length >= MIN_PLAYERS
    && game.players.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    && Array.isArray(game.entries)
    && game.clock && typeof game.clock.accMs === 'number'
    && game.turnTimer && typeof game.turnTimer.accMs === 'number';
  if (!valid) return null;

  const ids = new Set(game.players.map((p) => p.id));
  game.entries = game.entries.filter((e) => e && ids.has(e.p) && Number.isFinite(e.v));
  game.current = clamp(game.current | 0, 0, game.players.length - 1);
  game.target = clamp(game.target | 0, 0, game.players.length - 1);
  game.round = Math.max(1, game.round | 0);
  game.winRule = game.winRule === 'low' ? 'low' : 'high';
  game.conditionalPenalties = game.conditionalPenalties === true;
  return game;
}

function loadHistory() {
  const history = store.read(STORAGE_KEYS.history, []);
  return Array.isArray(history)
    ? history.filter((h) => h && typeof h.id === 'string' && Array.isArray(h.players))
    : [];
}

function loadPrefs() {
  const prefs = store.read(STORAGE_KEYS.prefs, null);
  return { sound: !(prefs && prefs.sound === false) };
}

const saveSetup = () => store.write(STORAGE_KEYS.setup, state.setup);
const saveHistory = () => store.write(STORAGE_KEYS.history, state.history);
const saveBounties = () => store.write(STORAGE_KEYS.bounties, { ...state.bounties, version: BOUNTIES_VERSION });
const savePrefs = () => store.write(STORAGE_KEYS.prefs, state.prefs);

function saveGame() {
  if (state.game) store.write(STORAGE_KEYS.game, state.game);
}


/* =============================================================================
   4. State
   ========================================================================== */

const state = {
  route: null,
  setup: loadSetup(),
  game: loadGame(),
  history: loadHistory(),
  bounties: loadBounties(),
  prefs: loadPrefs(),
  tab: 'order',             // hunters card: order | ranking | rounds
  lastResult: null,         // hunt that just ended (results page)
  showSetupErrors: false,   // “name required” errors shown after a first try
  customSign: 1,            // sign of the custom points (+1 or −1)
  customTarget: 0,          // hunter getting the custom points
};

/** Elements updated 4 times per second by the timer. */
const dom = {};


/* =============================================================================
   5. Navigation (#/new, #/hunt, #/results, #/history, #/rules)
   ========================================================================== */

const defaultRoute = () => (state.game ? 'hunt' : 'new');

function routeFromHash() {
  const match = /^#\/(\w+)/.exec(location.hash);
  return match && ROUTES.includes(match[1]) ? match[1] : null;
}

function navigate(route, { replace = false } = {}) {
  const hash = `#/${route}`;
  if (location.hash === hash) {
    showScreen(route);
  } else if (replace) {
    window.history.replaceState(null, '', hash);
    showScreen(route);
  } else {
    location.hash = hash; // → hashchange → showScreen
  }
}

function showScreen(requested, { initial = false } = {}) {
  let route = requested;
  if (route === 'hunt' && !state.game) route = 'new';
  if (route === 'results' && !state.lastResult) route = defaultRoute();
  if (route !== requested) {
    window.history.replaceState(null, '', `#/${route}`);
  }

  const changed = state.route !== route;
  state.route = route;
  $$('.screen').forEach((screen) => { screen.hidden = screen.dataset.screen !== route; });
  $$('.nav-link').forEach((link) => {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#nav-hunt').hidden = !state.game;
  document.title = `${ROUTE_TITLES[route]} · Brand Hunters`;

  if (route === 'new') renderSetup();
  else if (route === 'hunt') renderHunt();
  else if (route === 'results') renderResults();
  else if (route === 'history') renderHistory();
  else if (route === 'rules') renderRules();

  if (changed) {
    window.scrollTo(0, 0);
    if (!initial) {
      const title = $(`.screen[data-screen="${route}"] h1`);
      if (title) {
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
      }
    }
  }
  syncRuntime();
}


/* =============================================================================
   6. New game
   ========================================================================== */

function renderSetup() {
  const s = state.setup;
  $('#resume-banner').hidden = !state.game;
  $('#player-count').textContent = s.players.length;
  $('[data-action="count-dec"]').disabled = s.players.length <= MIN_PLAYERS;
  $('[data-action="count-inc"]').disabled = s.players.length >= MAX_PLAYERS;
  renderNameList();
  renderTimerSetting('setup');
  renderSetupBounty();
  checkRadio('winRule', s.winRule);
  $('#conditional-penalties').checked = s.conditionalPenalties;
}

function checkRadio(name, value) {
  $$(`input[name="${name}"]`).forEach((input) => { input.checked = input.value === String(value); });
}

/* --- Hunters' names ------------------------------------------------------ */

function hunterLabel(index) {
  return state.setup.players[index].name.trim() || `Player ${index + 1}`;
}

function renderNameList() {
  const players = state.setup.players;
  $('#name-list').innerHTML = players.map((p, i) => {
    const label = escapeHtml(hunterLabel(i));
    return `
      <li class="name-row" data-index="${i}">
        ${starIcon(p.color, 'name-star')}
        <input class="name-input" id="name-${i}" type="text" data-name-index="${i}" value="${escapeHtml(p.name)}"
          maxlength="${MAX_NAME_LENGTH}" autocomplete="off" autocapitalize="words" spellcheck="false"
          enterkeyhint="${i === players.length - 1 ? 'done' : 'next'}" placeholder="Player ${i + 1}"
          aria-label="Name of hunter ${i + 1}" aria-describedby="name-error-${i}">
        <button type="button" class="icon-btn drag-handle" data-drag-handle data-index="${i}" aria-label="Move ${label} (arrow keys)">${icon('grip')}</button>
        <button type="button" class="icon-btn" data-action="remove-player" data-index="${i}" aria-label="Remove ${label}"${players.length <= MIN_PLAYERS ? ' disabled' : ''}>${icon('trash')}</button>
        <p class="field-error" id="name-error-${i}"></p>
      </li>`;
  }).join('');
  updateNameErrors();
}

const NAME_ERRORS = {
  required: 'Enter a name.',
  duplicate: 'This name is already taken (add an initial, for example).',
};

/** For each hunter: null or an error code (“required”, “duplicate”). */
function getNameErrors() {
  const players = state.setup.players;
  const errors = players.map(() => null);
  const firstIndex = new Map();
  players.forEach((p, i) => {
    const name = p.name.trim();
    if (!name) {
      errors[i] = 'required';
      return;
    }
    const key = name.toLocaleLowerCase('en');
    if (firstIndex.has(key)) {
      errors[i] = 'duplicate';
      errors[firstIndex.get(key)] = 'duplicate';
    } else {
      firstIndex.set(key, i);
    }
  });
  return errors;
}

function updateNameErrors() {
  const errors = getNameErrors();
  errors.forEach((error, i) => {
    const input = $(`#name-${i}`);
    const message = $(`#name-error-${i}`);
    if (!input || !message) return;
    // Duplicates are shown at once; empty names after a first attempt.
    const visible = error === 'duplicate' || (error === 'required' && state.showSetupErrors);
    input.setAttribute('aria-invalid', visible ? 'true' : 'false');
    message.textContent = visible ? NAME_ERRORS[error] : '';
  });
  return errors;
}

function onNameInput(input) {
  const index = Number(input.dataset.nameIndex);
  state.setup.players[index].name = input.value.slice(0, MAX_NAME_LENGTH);
  updateNameErrors();
  saveSetup();
}

function setPlayerCount(count) {
  const players = state.setup.players;
  const next = clamp(count, MIN_PLAYERS, MAX_PLAYERS);
  if (next === players.length) return;
  while (players.length < next) players.push({ name: '', color: nextFreeColor(players) });
  while (players.length > next) players.pop();
  saveSetup();
  renderSetup();
}

function removePlayer(index) {
  const players = state.setup.players;
  if (players.length <= MIN_PLAYERS || !players[index]) return;
  players.splice(index, 1);
  saveSetup();
  renderSetup();
}

/** “Shuffle”: random turn order, always different from the current one. */
function shuffleHunters() {
  const players = state.setup.players;
  const before = players.map((p) => p.color).join();
  let next = shuffle(players);
  for (let tries = 0; tries < 20 && next.map((p) => p.color).join() === before; tries++) next = shuffle(players);
  state.setup.players = next;
  saveSetup();
  renderNameList();
  const list = $('#name-list');
  list.classList.remove('is-shuffled');
  void list.offsetWidth; // restarts the animation
  list.classList.add('is-shuffled');
}

function moveHunter(index, delta, focusHandle = false) {
  const players = state.setup.players;
  const to = index + delta;
  if (to < 0 || to >= players.length) return;
  moveItem(players, index, to);
  saveSetup();
  renderNameList();
  const row = $(`#name-list .name-row[data-index="${to}"]`);
  if (row) row.classList.add('is-moved');
  if (focusHandle) {
    const handle = $(`#name-list [data-drag-handle][data-index="${to}"]`);
    if (handle) handle.focus({ preventScroll: true });
  }
}

/** Drag and drop (touch and mouse) with the ⠿ handle. */
function initNameDrag() {
  const list = $('#name-list');

  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();

    const item = handle.closest('.name-row');
    const items = Array.from(list.children);
    const from = items.indexOf(item);
    const rects = items.map((el) => el.getBoundingClientRect());
    const step = items.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
    const startY = event.clientY;
    let to = from;

    item.classList.add('is-dragging');
    list.classList.add('is-sorting');
    try { handle.setPointerCapture(event.pointerId); } catch { /* ignored */ }

    const onMove = (moveEvent) => {
      const min = -from * step - step / 2;
      const max = (items.length - 1 - from) * step + step / 2;
      const dy = clamp(moveEvent.clientY - startY, min, max);
      item.style.transform = `translateY(${dy}px)`;
      to = clamp(Math.round(from + dy / step), 0, items.length - 1);
      items.forEach((el, i) => {
        if (el === item) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -step;
        if (from > to && i >= to && i < from) shift = step;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };

    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      list.classList.remove('is-sorting');
      if (to !== from) {
        moveItem(state.setup.players, from, to);
        saveSetup();
      }
      renderNameList();
      const moved = $(`#name-list .name-row[data-index="${to}"]`);
      if (moved && to !== from) moved.classList.add('is-moved');
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  });
}

/* --- Round timer (New game + hunt settings) ------------------------------ */

const TIMER_SCOPES = { setup: '#setup-timer', settings: '#settings-timer' };
const TIMER_HELP = 'Arrows: Off, 30, 45, 50, 60 or 75 s. Or type any time (e.g. 90 or 1:30).';

function timerSettingHtml(scope) {
  return `
    <div class="time-stepper">
      <button type="button" class="round-btn" data-action="timer-step" data-dir="-1" aria-label="Shorter round timer">${icon('prev')}</button>
      <input class="time-field" id="${scope}-time" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="off"
        maxlength="8" aria-label="Round timer duration" aria-describedby="${scope}-time-help">
      <button type="button" class="round-btn" data-action="timer-step" data-dir="1" aria-label="Longer round timer">${icon('next')}</button>
    </div>
    <p class="time-help" id="${scope}-time-help">${TIMER_HELP}</p>`;
}

function getTimerConfig(scope) {
  if (scope === 'settings') {
    const timer = state.game.turnTimer;
    return normalizeTurnTimer({ enabled: timer.enabled, seconds: Math.round(timer.durationMs / 1000) });
  }
  return state.setup.turnTimer;
}

function renderTimerSetting(scope, { force = false } = {}) {
  const box = $(TIMER_SCOPES[scope]);
  if (!box || (scope === 'settings' && !state.game)) return;
  if (!box.childElementCount) box.innerHTML = timerSettingHtml(scope);

  const config = getTimerConfig(scope);
  const field = $('.time-field', box);
  if (force || document.activeElement !== field) {
    field.value = config.enabled ? formatTimerSetting(config.seconds) : 'OFF';
    field.classList.toggle('is-off', !config.enabled);
  }
  const value = config.enabled ? config.seconds : 0;
  const [shorter, longer] = $$('[data-action="timer-step"]', box);
  shorter.disabled = value === 0;
  longer.disabled = value >= TURN_PRESETS[TURN_PRESETS.length - 1];
}

function setTimerHelp(box, error) {
  const help = $('.time-help', box);
  help.classList.toggle('is-error', Boolean(error));
  help.textContent = error || TIMER_HELP;
}

function applyTimerConfig(scope, changes) {
  const config = normalizeTurnTimer({ ...getTimerConfig(scope), ...changes });
  if (scope === 'settings') {
    setGameTurnTimer(config);
  } else {
    state.setup.turnTimer = config;
    saveSetup();
  }
  renderTimerSetting(scope, { force: true });
}

/** Arrows: Off → 30 → 45 → 50 → 60 → 75 s (a custom value jumps to the nearest preset). */
function stepTimer(button) {
  const scope = button.closest('[data-timer-scope]').dataset.timerScope;
  const config = getTimerConfig(scope);
  const steps = [0, ...TURN_PRESETS];
  const value = config.enabled ? config.seconds : 0;
  const dir = Number(button.dataset.dir);
  const next = dir > 0 ? steps.find((v) => v > value) : steps.slice().reverse().find((v) => v < value);
  if (next === undefined) return;
  setTimerHelp($(TIMER_SCOPES[scope]), null);
  applyTimerConfig(scope, next === 0 ? { enabled: false } : { enabled: true, seconds: next });
}

/** Typed duration, applied when the field is left (or with Enter). */
function commitTimerField(field) {
  const box = field.closest('[data-timer-scope]');
  const scope = box.dataset.timerScope;
  const raw = field.value.trim().toLowerCase();
  if (!raw) {
    renderTimerSetting(scope, { force: true });
    return;
  }
  if (['off', '0', '0:00', '00:00'].includes(raw)) {
    setTimerHelp(box, null);
    applyTimerConfig(scope, { enabled: false });
    return;
  }
  const seconds = parseTurnDuration(raw);
  if (seconds === null) {
    renderTimerSetting(scope, { force: true });
    setTimerHelp(box, 'Enter a time between 5 s and 60 min (e.g. 90 or 1:30).');
    return;
  }
  setTimerHelp(box, null);
  applyTimerConfig(scope, { enabled: true, seconds });
}

/* --- Bounty preview ------------------------------------------------------ */

function renderSetupBounty() {
  const b = state.bounties;
  const tiles = BOUNTY_TIERS.map((t) => `
    <button type="button" class="tier tier-${t.key}" data-action="edit-bounties" aria-label="${t.label}: ${formatPoints(b[t.key])} (edit)">
      ${starsHtml(t.stars)}<span class="tier-label">${t.label}</span><span class="tier-value">${formatSigned(b[t.key])}</span>
    </button>`).join('');
  $('#setup-bounty').innerHTML = `
    <div class="tier-row">${tiles}</div>
    <div class="extra-row">
      <button type="button" class="pill-btn pill-btn-bonus" data-action="edit-bounties"><span>Bonus</span><b class="pill-value">${formatSigned(b.bonus)}</b></button>
      <button type="button" class="pill-btn pill-btn-wrong" data-action="edit-bounties"><span>Wrong answer</span><b class="pill-value">${formatSigned(-b.penalty)}</b></button>
    </div>`;
}

/** Fills the New game form with the hunters and settings of a hunt. */
function prefillSetup({ players, winRule, turnTimer, conditionalPenalties }) {
  state.setup = {
    players: assignColors(players.slice(0, MAX_PLAYERS).map((p) => ({
      name: String(p.name).slice(0, MAX_NAME_LENGTH),
      color: isColor(p.color) ? p.color : null,
    }))),
    winRule: winRule === 'low' ? 'low' : 'high',
    conditionalPenalties: conditionalPenalties !== false,
    turnTimer: normalizeTurnTimer(turnTimer || state.setup.turnTimer),
  };
  while (state.setup.players.length < MIN_PLAYERS) {
    state.setup.players.push({ name: '', color: nextFreeColor(state.setup.players) });
  }
  state.showSetupErrors = false;
  saveSetup();
}

async function startGame() {
  state.showSetupErrors = true;
  const errors = updateNameErrors();
  const firstError = errors.findIndex(Boolean);
  if (firstError !== -1) {
    const input = $(`#name-${firstError}`);
    input.focus();
    input.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    showToast('Check the hunters’ names.');
    return;
  }
  if (state.game) {
    const confirmed = await confirmDialog({
      title: 'A hunt is in progress',
      message: 'Starting a new hunt ends the current one without saving it.',
      confirmLabel: 'Start new hunt',
      danger: true,
    });
    if (!confirmed) return;
    discardGame();
  }

  const s = state.setup;
  const now = Date.now();
  state.game = {
    version: 2,
    id: uid(),
    startedAt: now,
    winRule: s.winRule,
    conditionalPenalties: s.conditionalPenalties,
    players: s.players.map((p, i) => ({ id: `p${i}`, name: p.name.trim(), color: p.color })),
    current: 0,
    target: 0,
    round: 1,
    entries: [],
    clock: { accMs: 0, since: now },
    turnTimer: {
      enabled: s.turnTimer.enabled,
      durationMs: s.turnTimer.seconds * 1000,
      custom: s.turnTimer.custom,
      accMs: 0,
      since: null, // waits for “Start”
      expired: false,
    },
  };
  state.tab = 'order';
  state.showSetupErrors = false;
  saveGame();
  navigate('hunt');
}


/* =============================================================================
   7. The hunt
   ========================================================================== */

/** Number of the current turn (one turn = one hunter's go), counted from the start. */
const turnIndex = (game) => (game.round - 1) * game.players.length + game.current;

/** Wrong-answer entry (older versions had no category: their negative entries were wrong answers). */
const isWrongAnswer = (e) => e.c === 'penalty' || (e.c === undefined && e.v < 0);

/*
 * Wrong answers (Brand Hunters rule), for each hunter and each turn:
 *   • they only count if the hunter finds, i.e. scores points that turn;
 *   • they never take away more than the points won that turn
 *     (+200 and 8 wrong answers = −200 of penalties, so the turn is worth 0).
 * Each entry therefore has a status:
 *   counted   → fully included in the total;
 *   partial   → only part of it counts (the turn's limit was reached);
 *   capped    → not counted: the turn's limit was already reached;
 *   pending   → current turn, the bounty is not (yet) found;
 *   cancelled → turn over without finding: the penalty is dropped.
 * Custom points always count as typed. Everything is computed from the entries
 * (nothing is deleted), so “Previous hunter” and “Undo” always leave the scores right.
 */
function computeScores(game, { finished = false } = {}) {
  const totals = {};
  const pending = {};
  game.players.forEach((p) => { totals[p.id] = 0; pending[p.id] = 0; });
  const statuses = game.entries.map(() => 'counted');
  const amounts = game.entries.map((e) => e.v); // what each entry really adds

  if (game.conditionalPenalties) {
    const turns = new Map(); // `${turn}|${hunter}` → { k, gain, wrong: [entry indexes] }
    game.entries.forEach((e, i) => {
      if (e.k === undefined) return; // entries from the very first version: always counted
      const key = `${e.k}|${e.p}`;
      if (!turns.has(key)) turns.set(key, { k: e.k, gain: 0, wrong: [] });
      const turn = turns.get(key);
      if (e.v > 0) turn.gain = roundScore(turn.gain + e.v);
      else if (isWrongAnswer(e)) turn.wrong.push(i);
    });

    const current = turnIndex(game);
    turns.forEach((turn) => {
      if (!turn.wrong.length) return;
      if (turn.gain <= 0) {
        const status = turn.k === current && !finished ? 'pending' : 'cancelled';
        turn.wrong.forEach((i) => { statuses[i] = status; amounts[i] = 0; });
        return;
      }
      let room = turn.gain; // a hunter never loses more than they won this turn
      turn.wrong.forEach((i) => {
        const loss = Math.min(-game.entries[i].v, room);
        room = roundScore(room - loss);
        amounts[i] = loss > 0 ? -loss : 0;
        statuses[i] = loss === -game.entries[i].v ? 'counted' : (loss > 0 ? 'partial' : 'capped');
      });
    });
  }

  game.entries.forEach((e, i) => {
    if (!(e.p in totals)) return;
    if (statuses[i] === 'pending') pending[e.p] = roundScore(pending[e.p] + e.v);
    else totals[e.p] = roundScore(totals[e.p] + amounts[i]);
  });
  return { totals, pending, statuses, amounts };
}

function getTotals(game, options) {
  return computeScores(game, options).totals;
}

/** Hunters with pending penalties: [{ name, amount }]. */
function pendingPenalties(game) {
  const { pending } = computeScores(game);
  return game.players.filter((p) => pending[p.id] < 0).map((p) => ({ name: p.name, amount: pending[p.id] }));
}

function describePenalties(list) {
  return list.map((item) => `${item.name} ${formatSigned(item.amount)}`).join(', ');
}

/** Sports ranking: equal scores share a rank (1, 1, 3…). */
function computeRanking(game, totals = getTotals(game)) {
  const direction = game.winRule === 'low' ? 1 : -1;
  const rows = game.players.map((p, index) => ({ ...p, index, score: totals[p.id] }));
  rows.sort((a, b) => (a.score - b.score) * direction || a.index - b.index);
  let rank = 0;
  rows.forEach((row, i) => {
    if (i === 0 || row.score !== rows[i - 1].score) rank = i + 1;
    row.rank = rank;
  });
  return rows;
}

function renderHunt() {
  const g = state.game;
  if (!g) return;
  const scores = computeScores(g);
  const ranking = computeRanking(g, scores.totals);
  $('#round-badge').textContent = `Round ${g.round}`;
  renderCurrentHunter(g, scores);
  renderPointsCard(g);
  renderTabs();
  renderHunterList(g, scores);
  renderRanking(g, ranking);
  renderRounds(g, scores);
  renderTimerControls();
  tick();
}

function renderCurrentHunter(g, scores) {
  const current = g.players[g.current];
  const target = g.players[g.target];
  $('#current-hunter').innerHTML = `${starIcon(current.color)}<span class="hunter-pill-name">${escapeHtml(current.name)}</span>`;
  $('#prev-btn').disabled = g.round <= 1 && g.current === 0;

  const notes = [];
  if (scores.pending[current.id] < 0) {
    notes.push(`${formatSigned(scores.pending[current.id])} pending · counts if the bounty is found, up to the points won`);
  }
  let html = notes.map(escapeHtml).join('');
  if (g.target !== g.current) {
    const what = roleOf(g, g.target) === 'vulture' ? 'Ambush by' : 'Witness share for';
    html += `${html ? '<br>' : ''}${what} ${starIcon(target.color, 'icon-inline')} <strong>${escapeHtml(target.name)}</strong> · <button type="button" class="link-btn" data-action="reset-target">back to ${escapeHtml(current.name)}</button>`;
  }
  $('#current-note').innerHTML = html;
}

function renderPointsCard(g) {
  const b = state.bounties;
  const role = roleOf(g, g.target);
  const card = $('.points-card');
  card.classList.toggle('is-ambush', role === 'vulture');
  card.classList.toggle('is-witness', role === 'witness');

  // Who scores: one chip per player, with their role this turn
  $('#points-targets').innerHTML = g.players.map((p, i) => {
    const r = roleOf(g, i);
    const selected = i === g.target;
    return `
      <button type="button" class="target-chip role-chip${selected ? ' is-selected' : ''}" data-action="select-player" data-index="${i}" aria-pressed="${selected}">
        ${starIcon(p.color)}<span>${escapeHtml(p.name)}</span><small class="role-tag role-${r}">${ROLE_LABELS[r]}</small>
      </button>`;
  }).join('');
  keepChipInView($('#points-targets'), $('#points-targets .is-selected'));

  const missed = missedThisTurn(g);
  $('#points-mode').innerHTML = role === 'vulture'
    ? '<b>Ambush!</b> Half of the card’s bounty. Wrong guess: no penalty.'
    : role === 'witness'
      ? `<b>Witness share:</b> half of the bounty left${missed ? ` (after ${formatSigned(-missed)} of missed shots)` : ''}.`
      : '';

  const share = { vulture: ' (ambush: half of the bounty)', witness: ' (Witness share: half of the bounty left)', hunter: '' }[role];
  $('#bounty-grid').innerHTML = BOUNTY_TIERS.map((t) => {
    const value = tileValue(g, t.key);
    return `
    <button type="button" class="tier tier-${t.key}" data-action="add-bounty" data-key="${t.key}" aria-label="${t.label}: add ${formatPoints(value)}${share}"${value > 0 ? '' : ' disabled'}>
      ${starsHtml(t.stars)}<span class="tier-label">${t.label}</span><span class="tier-value">${formatSigned(value)}</span>
    </button>`;
  }).join('');
  $('#bonus-btn').innerHTML = `<span>Bonus</span><b class="pill-value">${formatSigned(b.bonus)}</b>`;
  $('#bonus-btn').setAttribute('aria-label', `Bonus: add ${formatPoints(b.bonus)}`);
  const wrong = $('#wrong-btn');
  if (role === 'vulture') {
    // A wrong ambush costs nothing: back to the Hunter
    wrong.innerHTML = '<span>Wrong</span><b class="pill-value">No penalty</b>';
    wrong.setAttribute('aria-label', 'Wrong ambush: no penalty, back to the Hunter');
  } else {
    wrong.innerHTML = `<span>Wrong</span><b class="pill-value">${formatSigned(-b.penalty)}</b>`;
    wrong.setAttribute('aria-label', `Wrong answer: ${formatSigned(-b.penalty)}`);
  }
  wrong.disabled = role === 'witness'; // missed shots belong to the Hunter
  $('#undo-btn').disabled = g.entries.length === 0;
}

function renderTabs() {
  $$('.hunters-card [role="tab"]').forEach((tab) => {
    const selected = tab.dataset.tab === state.tab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $('#panel-order').hidden = state.tab !== 'order';
  $('#panel-ranking').hidden = state.tab !== 'ranking';
  $('#panel-rounds').hidden = state.tab !== 'rounds';
}

function setTab(tab) {
  if (!['order', 'ranking', 'rounds'].includes(tab)) return;
  state.tab = tab;
  renderTabs();
  if (tab === 'rounds') {
    const row = $('#rounds-wrap .is-current-round');
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
}

function renderHunterList(g, scores) {
  const { totals, pending } = scores;
  $('#hunter-list').innerHTML = g.players.map((p, i) => {
    const isCurrent = i === g.current;
    const isTarget = i === g.target;
    const classes = ['hunter-row', isCurrent && 'is-current', isTarget && 'is-target'].filter(Boolean).join(' ');
    const waiting = pending[p.id] < 0
      ? `<span class="badge-pending" title="Counts only if the bounty is found this turn">${formatSigned(pending[p.id])} pending</span>`
      : '';
    return `
      <li>
        <button type="button" class="${classes}" data-action="select-player" data-index="${i}" data-player-id="${escapeHtml(p.id)}" aria-pressed="${isTarget}"${isCurrent ? ' aria-current="true"' : ''}>
          ${starIcon(p.color)}
          <span class="hunter-name">${escapeHtml(p.name)}</span>
          ${waiting}
          <span class="score-pill">${formatNumber(totals[p.id])}</span>
        </button>
      </li>`;
  }).join('');
}

/** Adds the gap to the leader to each row. */
function withGaps(rows, hasScores) {
  const leader = rows[0] ? rows[0].score : 0;
  return rows.map((row) => {
    let gap = '';
    if (hasScores) gap = row.rank === 1 ? 'Leading' : `${formatPoints(Math.abs(roundScore(row.score - leader)))} behind`;
    return { ...row, gap };
  });
}

function rankingRowHtml(row) {
  return `
    <li class="rank-row${row.rank === 1 ? ' is-first' : ''}">
      <span class="rank-pos" data-rank="${Math.min(row.rank, 4)}">${row.rank}</span>
      ${starIcon(row.color)}
      <span class="rank-name">${escapeHtml(row.name)}${row.gap ? `<small>${escapeHtml(row.gap)}</small>` : ''}</span>
      <span class="rank-score">${formatNumber(row.score)}</span>
    </li>`;
}

function renderRanking(g, ranking) {
  $('#ranking-rule').textContent = `${ruleLabel(g.winRule)} · live`;
  $('#ranking-list').innerHTML = withGaps(ranking, g.entries.length > 0).map(rankingRowHtml).join('');
}

/** Score sheet: one row per round, one column per hunter. */
function renderRounds(g, scores) {
  const { totals, statuses, amounts } = scores;
  const rounds = g.entries.reduce((max, e) => Math.max(max, e.r), g.round);
  const cells = new Map();
  g.entries.forEach((e, i) => {
    const key = `${e.r}|${e.p}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ v: e.v, amount: amounts[i], status: statuses[i] });
  });
  const titles = {
    pending: 'Pending: counts if the bounty is found',
    cancelled: 'Not counted: bounty not found',
    capped: 'Not counted: you can’t lose more than the points won',
  };
  const itemHtml = (item) => {
    if (item.status === 'counted') return formatSigned(item.v);
    if (item.status === 'partial') {
      return `<span class="is-partial" title="Only ${formatSigned(item.amount)} counted: you can’t lose more than the points won">${formatSigned(item.amount)}</span>`;
    }
    return `<span class="is-${item.status}" title="${titles[item.status]}">${formatSigned(item.v)}</span>`;
  };

  const head = g.players.map((p) => `
    <th scope="col"><span class="rounds-player">${starIcon(p.color)}<span>${escapeHtml(p.name)}</span></span></th>`).join('');
  const totalRow = g.players.map((p) => `<td>${formatNumber(totals[p.id])}</td>`).join('');

  let body = '';
  for (let r = 1; r <= rounds; r++) {
    body += `<tr${r === g.round ? ' class="is-current-round"' : ''}><th scope="row">${r}</th>`;
    g.players.forEach((p) => {
      const items = cells.get(`${r}|${p.id}`);
      if (!items) {
        body += '<td class="is-empty">·</td>';
        return;
      }
      const counts = items.some((item) => item.status === 'counted' || item.status === 'partial');
      const sum = roundScore(items.reduce((total, item) => total + item.amount, 0));
      const showDetail = items.length > 1 || items.some((item) => item.status !== 'counted');
      const detail = showDetail ? `<span class="cell-detail">${items.map(itemHtml).join(' ')}</span>` : '';
      const cls = !counts ? 'is-void' : (sum < 0 ? 'is-neg' : 'is-pos');
      body += `<td class="${cls}"><span class="cell-sum">${counts ? formatSigned(sum) : '0'}</span>${detail}</td>`;
    });
    body += '</tr>';
  }

  $('#rounds-note').textContent = !g.entries.length
    ? 'No points yet.'
    : `Points scored in each round.${g.conditionalPenalties ? ' Struck-through values: wrong answers not counted (bounty not found, or more than the points won).' : ''}`;
  $('#rounds-wrap').innerHTML = `
    <table class="rounds">
      <thead>
        <tr><th scope="col">Round</th>${head}</tr>
        <tr class="rounds-totals"><th scope="row">Total</th>${totalRow}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function selectTarget(index) {
  const g = state.game;
  if (!g || !Number.isInteger(index) || index < 0 || index >= g.players.length || index === g.target) return;
  g.target = index;
  saveGame();
  renderHunt();
}


/* --- Roles: Witness share and Ambush --------------------------------------
   The Witness sits on the Hunter's left: the next hunter in turn order. All
   the other players are Vultures. Rulebook:
     Witness: half of the bounty left (card bounty − missed shots this turn);
     Vulture: half of the card's original bounty after a successful ambush;
     wrong ambush: no penalty.
   -------------------------------------------------------------------------- */

const ROLE_LABELS = Object.freeze({ hunter: 'Hunter', witness: 'Witness', vulture: 'Vulture' });

function roleOf(g, index) {
  if (index === g.current) return 'hunter';
  if (index === (g.current + 1) % g.players.length) return 'witness';
  return 'vulture';
}

/** Missed shots of the Hunter during this turn (positive amount). */
function missedThisTurn(g) {
  const k = turnIndex(g);
  const hunterId = g.players[g.current].id;
  return roundScore(g.entries
    .filter((e) => e.k === k && e.p === hunterId && isWrongAnswer(e))
    .reduce((sum, e) => sum - e.v, 0));
}

/** Scrolls a row of chips sideways (never the page) so the chosen one is visible. */
function keepChipInView(row, chip) {
  if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
  const rowBox = row.getBoundingClientRect();
  const box = chip.getBoundingClientRect();
  if (box.left < rowBox.left + 16) row.scrollLeft -= rowBox.left + 16 - box.left;
  else if (box.right > rowBox.right - 16) row.scrollLeft += box.right - (rowBox.right - 16);
}

/** What a bounty tile gives to the selected player. */
function tileValue(g, key) {
  const full = state.bounties[key];
  const role = roleOf(g, g.target);
  if (role === 'vulture') return roundScore(full / 2);
  if (role === 'witness') return roundScore(Math.max(0, full - missedThisTurn(g)) / 2);
  return full;
}

/** Wrong ambush: no penalty, the points go back to the Hunter. */
function missAmbush() {
  const g = state.game;
  const vulture = g.players[g.target];
  g.target = g.current;
  saveGame();
  renderHunt();
  showToast(`Missed ambush · no penalty for ${vulture.name}`);
}

function addBounty(key, pressedButton = null) {
  const g = state.game;
  if (!g) return;
  const role = roleOf(g, g.target);
  const isTier = BOUNTY_TIERS.some((t) => t.key === key);
  if (key === 'penalty' && role !== 'hunter') {
    if (role === 'vulture') missAmbush();
    return;
  }
  if (isTier && role !== 'hunter') {
    // Ambush or Witness share: half, then the points go back to the Hunter
    const note = role === 'vulture' ? `Ambush! · half of ${BOUNTY_LABELS[key]}` : `Witness share · ${BOUNTY_LABELS[key]}`;
    addPoints(tileValue(g, key), key, { note, backToHunter: true });
    return;
  }
  const value = key === 'penalty' ? -state.bounties.penalty : state.bounties[key];
  addPoints(value, key);
  const button = pressedButton || (BOUNTY_TIERS.some((t) => t.key === key)
    ? $(`#bounty-grid [data-key="${key}"]`)
    : $(key === 'bonus' ? '#bonus-btn' : '#wrong-btn'));
  if (button) {
    button.classList.remove('is-pressed');
    void button.offsetWidth;
    button.classList.add('is-pressed');
  }
}

function addPoints(value, category = 'custom', { note = '', backToHunter = false } = {}) {
  const g = state.game;
  if (!g || !Number.isFinite(value) || value === 0) return;
  const player = g.players[g.target];
  const points = roundScore(value);
  const before = computeScores(g);
  // k = turn of the entry (used by the wrong-answer rule)
  g.entries.push({ p: player.id, v: points, r: g.round, k: turnIndex(g), c: category, t: Date.now() });
  const after = computeScores(g);
  if (backToHunter) g.target = g.current;
  saveGame();
  renderHunt();

  const last = g.entries.length - 1;
  const status = after.statuses[last];
  const change = roundScore(after.totals[player.id] - before.totals[player.id]); // real effect on the total
  animateScore(player.id, points, { muted: status === 'pending' || change === 0, bump: change !== 0 });

  const head = `${formatSigned(points)} for ${player.name}`;
  const label = BOUNTY_TIERS.some((t) => t.key === category) ? ` · ${BOUNTY_LABELS[category]}` : '';
  if (note) {
    showToast(`${head} · ${note}`, 2400);
  } else if (status === 'pending') {
    showToast(`${head} · pending`);
  } else if (status === 'capped') {
    showToast(`${head} · not counted (can’t lose more than the points won)`, 2800);
  } else if (status === 'partial') {
    showToast(`${head} · only ${formatSigned(after.amounts[last])} counted (max = points won)`, 2800);
  } else if (points > 0 && change < points) {
    // Scoring brings the turn's wrong answers into play (up to the points won)
    const penalties = roundScore(change - points);
    const capped = after.statuses.some((s, i) => (s === 'capped' || s === 'partial')
      && g.entries[i].p === player.id && g.entries[i].k === g.entries[last].k);
    showToast(`${head}${label} · penalties ${formatSigned(penalties)}${capped ? ' (max = points won)' : ''}`, 2800);
  } else {
    showToast(`${head}${label}`);
  }
}

function animateScore(playerId, value, { muted = false, bump = true } = {}) {
  const row = $(`#hunter-list .hunter-row[data-player-id="${CSS.escape(playerId)}"]`);
  if (!row) return;
  if (bump) $('.score-pill', row).classList.add('is-bumped');
  const delta = document.createElement('span');
  delta.className = `float-delta ${muted ? 'is-pending' : (value < 0 ? 'is-neg' : 'is-pos')}`;
  delta.textContent = formatSigned(value);
  row.append(delta);
  setTimeout(() => delta.remove(), 1000);
}

function undoLastEntry() {
  const g = state.game;
  if (!g || !g.entries.length) return;
  const entry = g.entries.pop();
  saveGame();
  renderHunt();
  const player = g.players.find((p) => p.id === entry.p);
  showToast(`Undone: ${formatSigned(entry.v)} for ${player ? player.name : '?'}`);
}

/** “Next hunter” (+1) or “previous” (−1). A new round starts after the last hunter. */
function changeTurn(direction) {
  const g = state.game;
  if (!g) return;
  const count = g.players.length;
  if (direction < 0 && g.round <= 1 && g.current === 0) return;
  // Read before moving: penalties still pending now are dropped (bounty not found)
  const cancelled = pendingPenalties(g);
  let next = g.current + direction;
  if (next >= count) {
    next = 0;
    g.round += 1;
  } else if (next < 0) {
    next = count - 1;
    g.round -= 1;
  }
  g.current = next;
  g.target = next;
  resetTurnTimer(g); // full time, waiting for “Start”
  saveGame();
  renderHunt();
  if (cancelled.length) showToast(`Penalties cancelled: ${describePenalties(cancelled)}`, 3000);
}


/* =============================================================================
   8. Timer, alarm, wake lock
   -----------------------------------------------------------------------------
   Times are computed from timestamps (Date.now()), not by counting ticks: they
   stay right if the phone sleeps or the page is reloaded.
     clock     = { accMs, since }   time already counted + start of the current run
     turnTimer = { enabled, durationMs, accMs, since, expired }
   since === null means “stopped”. The hunt clock runs from the start of the
   hunt. The round timer only runs once “Start” is pressed: it is reset and
   stopped at each new hunter, so every hunter starts when ready.
   ========================================================================== */

const isPaused = (g) => g.clock.since == null;
const elapsedSince = (since, now) => (since == null ? 0 : Math.max(0, now - since));
const gameElapsed = (g, now = Date.now()) => g.clock.accMs + elapsedSince(g.clock.since, now);
const turnElapsed = (g, now = Date.now()) => g.turnTimer.accMs + elapsedSince(g.turnTimer.since, now);

/** Round timer: 'off' | 'ready' (full, waiting for Start) | 'running' | 'paused' | 'expired'. */
function turnState(g) {
  const timer = g.turnTimer;
  if (!timer.enabled) return 'off';
  if (timer.expired) return 'expired';
  if (timer.since != null) return 'running';
  return timer.accMs > 0 ? 'paused' : 'ready';
}

/** What the big ring button stops: the round timer, or the hunt clock when there is none. */
function isHuntRunning(g) {
  const turn = turnState(g);
  if (turn === 'off' || turn === 'expired') return !isPaused(g);
  return turn === 'running';
}

/** Pause: stops the hunt clock and the round timer. */
function pauseClock(g, now = Date.now()) {
  if (!isPaused(g)) {
    g.clock.accMs = gameElapsed(g, now);
    g.clock.since = null;
  }
  if (g.turnTimer.since != null) {
    g.turnTimer.accMs = turnElapsed(g, now);
    g.turnTimer.since = null;
  }
}

/** Start / resume: the hunt clock and, if there is one, the round timer. */
function startClock(g, now = Date.now()) {
  if (isPaused(g)) g.clock.since = now;
  if (g.turnTimer.enabled && g.turnTimer.since == null) g.turnTimer.since = now;
}

/** Full time again, stopped: waits for “Start”. */
function resetTurnTimer(g) {
  g.turnTimer.accMs = 0;
  g.turnTimer.since = null;
  g.turnTimer.expired = false;
}

/** The big ring button: Start / Pause / Resume. */
function togglePause() {
  const g = state.game;
  if (!g) return;
  if (isHuntRunning(g)) pauseClock(g);
  else startClock(g);
  saveGame();
  renderTimerControls();
  tick();
}

function restartTurnTimer() {
  const g = state.game;
  if (!g || !g.turnTimer.enabled) return;
  resetTurnTimer(g);
  saveGame();
  renderTimerControls();
  tick();
}

/**
 * Changes the round timer during a hunt. A new duration resets it: it then
 * waits for “Start”. Returns true if something changed.
 */
function setGameTurnTimer({ enabled, seconds, custom }) {
  const g = state.game;
  if (!g) return false;
  const timer = g.turnTimer;
  const durationMs = seconds * 1000;
  const changed = enabled !== timer.enabled || (enabled && durationMs !== timer.durationMs);
  timer.enabled = enabled;
  timer.durationMs = durationMs;
  timer.custom = custom;
  if (changed) resetTurnTimer(g);
  state.setup.turnTimer = normalizeTurnTimer({ enabled, seconds }); // kept for the next hunt
  saveSetup();
  saveGame();
  renderTimerControls();
  tick();
  return changed;
}

function renderTimerControls() {
  const g = state.game;
  if (!g) return;
  const running = isHuntRunning(g);
  const turn = turnState(g);
  const pauseBtn = $('#pause-btn');
  pauseBtn.innerHTML = icon(running ? 'pause' : 'play');
  pauseBtn.setAttribute('aria-label', running ? 'Pause' : turn === 'ready' ? 'Start the round timer' : 'Resume');
  dom.timer.classList.toggle('is-running', running);
  dom.timer.classList.toggle('is-ready', turn === 'ready');
  dom.timer.classList.toggle('is-paused', !running && turn !== 'ready');
  // The time can be changed right on the timer while it isn't counting down
  dom.timer.classList.toggle('is-editable', ['off', 'ready', 'paused'].includes(turn));
  const soundBtn = $('#sound-btn');
  soundBtn.innerHTML = icon(state.prefs.sound ? 'volume' : 'volume-off');
  soundBtn.setAttribute('aria-label', state.prefs.sound ? 'Sound on (tap to mute)' : 'Sound off (tap to turn on)');
  soundBtn.setAttribute('aria-pressed', String(state.prefs.sound));
}

/** Runs 4 times per second: time display, ring, end of the round. */
function tick() {
  const g = state.game;
  if (!g) return;
  const now = Date.now();
  const timer = g.turnTimer;
  const huntTime = formatClock(gameElapsed(g, now));

  if (!timer.enabled) {
    dom.timerTime.textContent = huntTime;
    setText(dom.timerCaption, isPaused(g) ? 'Hunt time · paused' : 'Hunt time');
    dom.timer.classList.add('is-off');
    dom.timer.classList.remove('is-warning', 'is-expired');
    return;
  }

  const elapsed = turnElapsed(g, now);
  const remaining = Math.max(0, timer.durationMs - elapsed);
  countdownSound(g, remaining);
  if (remaining === 0 && !timer.expired) {
    timer.expired = true;
    saveGame();
    triggerAlarm(elapsed - timer.durationMs > ALARM_GRACE_MS);
  }

  const fraction = remaining / timer.durationMs;
  dom.timerTime.textContent = formatCountdown(remaining);
  const turn = turnState(g);
  setText(dom.timerCaption, turn === 'expired' ? 'Time’s up!'
    : turn === 'ready' ? 'Press start'
      : turn === 'paused' ? 'Paused' : `Hunt ${huntTime}`);
  dom.timerProgress.style.strokeDasharray = `${(fraction * 100).toFixed(2)} 100`;
  // Knob at the end of the arc: the gauge goes from 150° to 390° (open at the bottom)
  const angle = ((150 + 240 * fraction) * Math.PI) / 180;
  dom.timerKnob.setAttribute('cx', (100 + 80 * Math.cos(angle)).toFixed(2));
  dom.timerKnob.setAttribute('cy', (100 + 80 * Math.sin(angle)).toFixed(2));
  dom.timer.classList.remove('is-off');
  dom.timer.classList.toggle('is-warning', !timer.expired && remaining <= Math.min(10000, timer.durationMs * 0.25));
  dom.timer.classList.toggle('is-expired', timer.expired);
}

let tickInterval = null;

/** Starts/stops the timer loop and the wake lock depending on whether a hunt exists. */
function syncRuntime() {
  if (state.game) {
    if (!tickInterval) tickInterval = setInterval(tick, 250);
    requestWakeLock();
  } else {
    clearInterval(tickInterval);
    tickInterval = null;
    releaseWakeLock();
  }
}

/* --- Alarm: visual signal + sound (Web Audio) + vibration ---------------- */

let lastCountdownTick = null; // second (3, 2, 1) already clicked

/** A revolver click at 3, 2 and 1 seconds from the end. */
function countdownSound(g, remaining) {
  const seconds = Math.ceil(remaining / 1000);
  if (turnState(g) !== 'running' || seconds > COUNTDOWN_TICKS || seconds < 1) {
    if (seconds > COUNTDOWN_TICKS) lastCountdownTick = null;
    return;
  }
  if (lastCountdownTick === seconds) return;
  lastCountdownTick = seconds;
  if (state.prefs.sound) playSound((ctx, out, t0) => soundClick(ctx, out, t0, seconds === 1));
}

function triggerAlarm(silent) {
  if (silent) return; // ran out while the page was closed: visual signal only
  flashScreen();
  if (state.prefs.sound) playSound(soundTimeUp);
  if ('vibrate' in navigator) {
    try { navigator.vibrate(ALARM_VIBRATION); } catch { /* not supported */ }
  }
}

function flashScreen() {
  const flash = document.createElement('div');
  flash.className = 'alarm-flash';
  flash.setAttribute('aria-hidden', 'true');
  document.body.append(flash);
  setTimeout(() => flash.remove(), 3200);
}

let audioContext = null;

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) {
    try { audioContext = new AudioCtx(); } catch { return null; }
  }
  if (audioContext.state !== 'running') audioContext.resume().catch(() => {});
  return audioContext;
}

/** Mobile browsers (iOS above all) only allow sound after a tap: unlock it early. */
function primeAudio() {
  const g = state.game;
  if (!g || !g.turnTimer.enabled || !state.prefs.sound) return;
  if (audioContext && audioContext.state === 'running') return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.start(0);
  } catch { /* ignored */ }
}

/* --- Western sounds, made with Web Audio (no sound files) -----------------
   Each sound is a function (ctx, out, t0): it plays on any AudioContext,
   including an OfflineAudioContext (to record or test it).
   -------------------------------------------------------------------------- */

/** Connects nodes one after the other (older Safari: connect() returns nothing). */
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

const soundOutputs = new WeakMap();
const noiseBuffers = new WeakMap();

/** Master output: a compressor makes the sounds punchy without clipping. */
function soundOutput(ctx) {
  if (!soundOutputs.has(ctx)) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 8;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.2;
    const volume = ctx.createGain();
    volume.gain.value = 0.9;
    chain(compressor, volume, ctx.destination);
    soundOutputs.set(ctx, compressor);
  }
  return soundOutputs.get(ctx);
}

/** 2 seconds of white noise, made once per context. */
function noiseSource(ctx) {
  if (!noiseBuffers.has(ctx)) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffers.get(ctx);
  return source;
}

/** Envelope: silence → peak in `attack` s → silence after `decay` s more. */
function envelope(param, t0, peak, attack, decay) {
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(peak, t0 + attack);
  param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

/** Revolver hammer being cocked: a dry metal click on a small wooden body. */
function soundClick(ctx, out, t0, accent = false) {
  const noise = noiseSource(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = accent ? 3600 : 2800;
  band.Q.value = 2.2;
  const clickGain = ctx.createGain();
  envelope(clickGain.gain, t0, accent ? 1 : 0.8, 0.001, 0.04);
  chain(noise, band, clickGain, out);
  noise.start(t0, Math.random());
  noise.stop(t0 + 0.06);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(accent ? 1500 : 1100, t0);
  body.frequency.exponentialRampToValueAtTime(accent ? 1000 : 750, t0 + 0.08);
  const bodyGain = ctx.createGain();
  envelope(bodyGain.gain, t0, accent ? 0.55 : 0.4, 0.002, 0.09);
  chain(body, bodyGain, out);
  body.start(t0);
  body.stop(t0 + 0.12);
}

/** Time's up: a revolver shot echoing in the canyon, then a ricochet. */
function soundTimeUp(ctx, out, t0) {
  // Canyon echo: a delay that repeats the shot, softer and duller each time
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.34;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 1400;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const echoSend = ctx.createGain();
  echoSend.gain.value = 0.45;
  chain(echoSend, echo, echoTone, feedback, echo);
  echoTone.connect(out);

  // Crack: a burst of noise, bright then dull
  const crack = noiseSource(ctx);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(8000, t0);
  tone.frequency.exponentialRampToValueAtTime(500, t0 + 0.45);
  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.0001, t0);
  crackGain.gain.exponentialRampToValueAtTime(1, t0 + 0.003);
  crackGain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.09);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
  chain(crack, tone, crackGain);
  crackGain.connect(out);
  crackGain.connect(echoSend);
  crack.start(t0, Math.random());
  crack.stop(t0 + 0.85);

  // Boom: the low thump of the shot
  const boom = ctx.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(170, t0);
  boom.frequency.exponentialRampToValueAtTime(45, t0 + 0.28);
  const boomGain = ctx.createGain();
  envelope(boomGain.gain, t0, 0.9, 0.004, 0.32);
  boom.connect(boomGain);
  boomGain.connect(out);
  boomGain.connect(echoSend);
  boom.start(t0);
  boom.stop(t0 + 0.4);

  // Ricochet: a whistle that falls, with a little wobble (“piiiooou”)
  const r0 = t0 + 0.14;
  const whistle = ctx.createOscillator();
  whistle.type = 'sine';
  whistle.frequency.setValueAtTime(2700, r0);
  whistle.frequency.exponentialRampToValueAtTime(620, r0 + 0.62);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 26;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = 55;
  chain(wobble, wobbleDepth, whistle.frequency);
  const whistleGain = ctx.createGain();
  whistleGain.gain.setValueAtTime(0.0001, r0);
  whistleGain.gain.exponentialRampToValueAtTime(0.3, r0 + 0.03);
  whistleGain.gain.setValueAtTime(0.3, r0 + 0.25);
  whistleGain.gain.exponentialRampToValueAtTime(0.0001, r0 + 0.68);
  chain(whistle, whistleGain, out);
  whistleGain.connect(echoSend);
  whistle.start(r0);
  wobble.start(r0);
  whistle.stop(r0 + 0.7);
  wobble.stop(r0 + 0.7);
}

/** Plays a sound on the page's AudioContext. */
function playSound(sound) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    sound(ctx, soundOutput(ctx), ctx.currentTime + 0.03);
  } catch { /* old browser: no sound */ }
}

function setSoundPref(enabled) {
  state.prefs.sound = enabled;
  savePrefs();
  if (enabled) playSound((ctx, out, t0) => soundClick(ctx, out, t0, true)); // short test click
  renderTimerControls();
}

function toggleSound() {
  setSoundPref(!state.prefs.sound);
  showToast(state.prefs.sound ? 'Sound on' : 'Sound off');
}

/* --- Keep the screen on (Screen Wake Lock API) --------------------------- */

let wakeLock = null;
let wakeLockPending = false;

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock || wakeLockPending) return;
  if (document.visibilityState !== 'visible' || !state.game) return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!state.game) {
      lock.release().catch(() => {});
    } else {
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
    }
  } catch {
    wakeLock = null; // refused (battery saver, hidden tab…)
  } finally {
    wakeLockPending = false;
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  const lock = wakeLock;
  wakeLock = null;
  lock.release().catch(() => {});
}

function getWakeLockStatus() {
  if (!('wakeLock' in navigator)) {
    return window.isSecureContext
      ? 'This browser can’t keep the screen on: check your phone’s sleep setting.'
      : 'To keep the screen on, the site must be opened over HTTPS.';
  }
  return wakeLock
    ? 'The screen stays on during the hunt.'
    : 'Keeping the screen on isn’t available right now (battery saver?).';
}


/* =============================================================================
   9. Dialogs
   ========================================================================== */

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

/** Confirmation: resolves with true (OK) or false. */
function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  const dialog = $('#confirm-dialog');
  const ok = $('#confirm-ok');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  ok.textContent = confirmLabel;
  ok.classList.toggle('pill-btn-minus', danger);
  ok.classList.toggle('pill-btn-sand', !danger);
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
  });
}

/* --- Custom points ------------------------------------------------------- */

function openCustomDialog({ sign = 1, text = '' } = {}) {
  const g = state.game;
  if (!g) return;
  const input = $('#custom-value');
  state.customSign = sign < 0 ? -1 : 1;
  state.customTarget = g.target;
  input.value = text;
  renderCustomTargets();
  updateCustomPreview();
  openDialog($('#custom-dialog'));
  input.focus();
  input.setSelectionRange(text.length, text.length);
}

function renderCustomTargets() {
  const g = state.game;
  $('#custom-targets').innerHTML = g.players.map((p, i) => {
    const selected = i === state.customTarget;
    return `<button type="button" class="target-chip${selected ? ' is-selected' : ''}" data-action="custom-target" data-index="${i}" data-keep-focus aria-pressed="${selected}">
      ${starIcon(p.color)}${escapeHtml(p.name)}</button>`;
  }).join('');
}

function onCustomInput(input) {
  // A typed “-” or “+” switches the sign; the field keeps the absolute value.
  if (/[-−–]/.test(input.value)) state.customSign = -1;
  else if (input.value.includes('+')) state.customSign = 1;
  const cleaned = input.value.replace(/[-−–+]/g, '');
  if (cleaned !== input.value) input.value = cleaned;
  updateCustomPreview();
}

function getCustomValue() {
  const abs = parseNumber($('#custom-value').value);
  const valid = Number.isFinite(abs) && abs > 0 && abs <= MAX_POINTS;
  return valid ? state.customSign * abs : null;
}

function updateCustomPreview() {
  const g = state.game;
  if (!g) return;
  const negative = state.customSign < 0;
  const signButton = $('#custom-sign');
  signButton.textContent = negative ? '−' : '+';
  signButton.classList.toggle('is-neg', negative);

  const value = getCustomValue();
  const submit = $('#custom-submit');
  submit.disabled = value === null;
  submit.classList.toggle('pill-btn-plus', !negative);
  submit.classList.toggle('pill-btn-minus', negative);
  submit.textContent = value === null
    ? (negative ? 'Remove' : 'Add')
    : `${negative ? 'Remove' : 'Add'} ${formatNumber(Math.abs(value))}`;

  const player = g.players[state.customTarget];
  const { totals, pending } = computeScores(g);
  const total = totals[player.id];
  let preview = `${player.name}: ${formatNumber(total)}`;
  if (value !== null) {
    // Exact result: the same calculation on the entries plus this one
    const simulated = { ...g, entries: [...g.entries, { p: player.id, v: value, r: g.round, k: turnIndex(g), c: 'custom' }] };
    const next = computeScores(simulated).totals[player.id];
    preview += ` → ${formatNumber(next)}`;
    const penalties = roundScore(next - total - value);
    if (penalties < 0) preview += ` (incl. ${formatSigned(penalties)} penalties)`;
  } else if (pending[player.id] < 0) {
    preview += ` · ${formatSigned(pending[player.id])} pending`;
  }
  $('#custom-preview').textContent = preview;
}

function toggleCustomSign() {
  state.customSign = -state.customSign;
  updateCustomPreview();
}

function selectCustomTarget(index) {
  const g = state.game;
  if (!g || index < 0 || index >= g.players.length) return;
  state.customTarget = index;
  renderCustomTargets();
  updateCustomPreview();
}

function submitCustomValue() {
  const g = state.game;
  const value = getCustomValue();
  if (!g || value === null) {
    $('#custom-value').focus();
    return;
  }
  g.target = state.customTarget;
  $('#custom-dialog').close('ok');
  addPoints(value, 'custom');
}

/* --- Bounty values ------------------------------------------------------- */

function renderBountyFields(values) {
  const fields = [
    ...BOUNTY_TIERS.map((t) => ({ key: t.key, label: t.label, swatch: `tier-${t.key}` })),
    { key: 'bonus', label: 'Bonus', swatch: '' },
    { key: 'penalty', label: 'Wrong answer', swatch: 'tier-difficult', negative: true },
  ];
  $('#bounty-fields').innerHTML = fields.map((f) => `
    <label class="bounty-field">
      <span class="bounty-field-label"><span class="bounty-swatch ${f.swatch}"${f.swatch ? '' : ' style="--t1:#FBE3C8;--t2:#F8C787"'}></span>${f.label}</span>
      <span class="${f.negative ? 'bounty-field-sign' : ''}">
        <input class="input" type="text" inputmode="decimal" autocomplete="off" data-bounty-key="${f.key}" value="${escapeHtml(String(values[f.key]))}" aria-label="${f.label} points">
      </span>
    </label>`).join('');
}

function setBountyMessage(text, isError = false) {
  const message = $('#bounty-message');
  message.textContent = text;
  message.classList.toggle('is-error', isError);
}

function openBountyDialog() {
  renderBountyFields(state.bounties);
  setBountyMessage('');
  openDialog($('#bounty-dialog'));
}

function resetBountyFields() {
  renderBountyFields(DEFAULT_BOUNTIES);
  setBountyMessage('Default values restored: press “Save” to keep them.');
}

function saveBountyDialog() {
  const next = {};
  let firstInvalid = null;
  $$('#bounty-fields input[data-bounty-key]').forEach((input) => {
    const value = parseNumber(input.value.replace(/[-−–+]/g, ''));
    const valid = Number.isFinite(value) && value > 0 && value <= MAX_POINTS;
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!valid) firstInvalid = firstInvalid || input;
    else next[input.dataset.bountyKey] = value;
  });
  if (firstInvalid) {
    setBountyMessage('Each value must be a number greater than 0.', true);
    firstInvalid.focus();
    return;
  }
  state.bounties = { ...DEFAULT_BOUNTIES, ...next };
  saveBounties();
  $('#bounty-dialog').close('ok');
  if (state.route === 'new') renderSetupBounty();
  if (state.route === 'hunt') renderHunt();
  showToast('Bounty values saved');
}

/* --- Round timer picker (tap the time on The hunt) ----------------------- */

function openTimerPicker() {
  const g = state.game;
  if (!g) return;
  const timer = g.turnTimer;
  const seconds = Math.round(timer.durationMs / 1000);
  const current = timer.enabled ? seconds : 0;
  $('#time-chips').innerHTML = [...TURN_PRESETS, 0].map((value) => `
    <button type="button" class="time-chip${value === 0 ? ' time-chip-off' : ''}" data-action="pick-turn-time" data-seconds="${value}"
      aria-pressed="${value === current}">${value ? `${value} s` : 'Off'}</button>`).join('');
  const custom = $('#timer-custom');
  custom.value = timer.enabled && !TURN_PRESETS.includes(seconds) ? formatTimerSetting(seconds) : '';
  setCustomTimeError(null);
  openDialog($('#timer-dialog'));
}

function setCustomTimeError(error) {
  const help = $('#timer-custom-help');
  help.classList.toggle('is-error', Boolean(error));
  help.textContent = error || 'Seconds (90) or minutes:seconds (1:30), from 5 s to 60 min.';
  $('#timer-custom').setAttribute('aria-invalid', error ? 'true' : 'false');
}

/** Applies a round time (0 = no round timer) and closes the picker. */
function pickTurnTime(seconds) {
  const g = state.game;
  if (!g) return;
  const config = seconds
    ? normalizeTurnTimer({ enabled: true, seconds })
    : normalizeTurnTimer({ enabled: false, seconds: Math.round(g.turnTimer.durationMs / 1000) });
  const changed = setGameTurnTimer(config);
  $('#timer-dialog').close('ok');
  if (!changed) return;
  showToast(config.enabled ? `Round timer: ${formatTurnSeconds(config.seconds)} · press start` : 'Round timer off');
}

function submitCustomTime() {
  const raw = $('#timer-custom').value.trim().toLowerCase();
  if (['off', '0', '0:00', '00:00'].includes(raw)) {
    pickTurnTime(0);
    return;
  }
  const seconds = raw ? parseTurnDuration(raw) : null;
  if (seconds === null) {
    setCustomTimeError('Enter a time between 5 s and 60 min (e.g. 90 or 1:30).');
    $('#timer-custom').focus();
    return;
  }
  pickTurnTime(seconds);
}

/** 45 → “45 s”, 90 → “1:30”, 120 → “2 min”. */
function formatTurnSeconds(seconds) {
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
}

/* --- Hunt settings ------------------------------------------------------- */

function openSettings() {
  const g = state.game;
  if (!g) return;
  renderTimerSetting('settings', { force: true });
  setTimerHelp($('#settings-timer'), null);
  $('#settings-conditional').checked = Boolean(g.conditionalPenalties);
  $('#settings-sound').checked = state.prefs.sound;
  $('#wake-status').textContent = getWakeLockStatus();
  openDialog($('#settings-dialog'));
}



/* =============================================================================
   10. End of hunt, results and history
   ========================================================================== */

/** Compact summary of a hunt, as saved in the history. */
function buildResult(game, now = Date.now()) {
  const totals = getTotals(game, { finished: true }); // pending penalties = cancelled
  const ranking = computeRanking(game, totals);
  const rankById = new Map(ranking.map((row) => [row.id, row.rank]));
  const lastEntryRound = game.entries.reduce((max, e) => Math.max(max, e.r), 0);
  const roundStarted = game.current > 0 || game.entries.some((e) => e.r === game.round);
  const rounds = Math.max(1, lastEntryRound, roundStarted ? game.round : game.round - 1);
  return {
    id: game.id,
    startedAt: game.startedAt,
    endedAt: now,
    durationMs: gameElapsed(game, now),
    rounds,
    winRule: game.winRule,
    conditionalPenalties: Boolean(game.conditionalPenalties),
    turnTimer: {
      enabled: Boolean(game.turnTimer.enabled),
      seconds: Math.round(game.turnTimer.durationMs / 1000),
    },
    players: game.players.map((p) => ({ name: p.name, color: p.color, score: totals[p.id], rank: rankById.get(p.id) })),
    winners: ranking.filter((row) => row.rank === 1).map((row) => row.name),
  };
}

function discardGame() {
  state.game = null;
  store.remove(STORAGE_KEYS.game);
  syncRuntime();
}

async function endGame() {
  const g = state.game;
  if (!g) return;
  const hasScores = g.entries.length > 0;
  const waiting = pendingPenalties(g);
  const confirmed = await confirmDialog({
    title: 'End the hunt?',
    message: (hasScores
      ? 'The final ranking will be shown and the hunt saved in the history.'
      : 'No points were scored: this hunt won’t be saved in the history.')
      + (waiting.length ? ` Pending penalties (${describePenalties(waiting)}) will be cancelled.` : ''),
    confirmLabel: 'End game',
  });
  if (!confirmed || !state.game) return;

  const result = buildResult(g);
  if (hasScores) {
    state.history.unshift(result);
    state.history = state.history.slice(0, HISTORY_LIMIT);
    saveHistory();
  }
  state.lastResult = { ...result, saved: hasScores };
  discardGame();
  navigate('results');
}

async function abandonGame() {
  const g = state.game;
  if (!g) return;
  const confirmed = await confirmDialog({
    title: 'Abandon the hunt?',
    message: 'Scores from this hunt will be lost and it won’t be saved in the history.',
    confirmLabel: 'Abandon',
    danger: true,
  });
  if (!confirmed || !state.game) return;
  prefillSetup(buildResult(g));
  discardGame();
  navigate('new');
  showToast('Hunt abandoned');
}

function sortedByRank(players) {
  return players
    .map((p, index) => ({ ...p, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
}

function renderResults() {
  const result = state.lastResult;
  if (!result) return;
  const ranked = sortedByRank(result.players);
  const winners = ranked.filter((p) => p.rank === 1);

  // WANTED poster: the winner, with their score as the bounty.
  let kicker;
  let name;
  let text;
  if (!result.saved) {
    kicker = 'Hunt over';
    name = 'No winner';
    text = 'No points were scored: this hunt isn’t saved.';
  } else if (winners.length === 1) {
    kicker = 'Winner of the hunt';
    name = winners[0].name;
    text = `${winners[0].name} wins the hunt!`;
  } else {
    kicker = `Tie between ${winners.length} hunters`;
    name = joinNames(winners.map((w) => w.name));
    text = 'It’s a tie! The bounty is shared.';
  }
  const title = $('#results-title');
  $('#results-kicker').textContent = kicker;
  title.textContent = name;
  title.classList.toggle('is-long', name.length > 12);
  $('#results-sub').textContent = text;
  $('#wanted-row').hidden = !result.saved;
  $('#wanted-bounty').textContent = result.saved ? formatPoints(winners[0].score) : '';

  $('#final-ranking').innerHTML = withGaps(ranked, result.saved).map(rankingRowHtml).join('');
  $('#results-meta').innerHTML = [
    `${icon('stopwatch')}${formatDuration(result.durationMs)}`,
    `${icon('flag')}${plural(result.rounds, 'round')}`,
    `${icon('trophy')}${result.winRule === 'low' ? 'Lowest wins' : 'Highest wins'}`,
    `${icon('saved')}${result.saved ? 'Saved' : 'Not saved'}`,
  ].map((content) => `<span class="pill">${content}</span>`).join('');
}

function renderHistory() {
  const history = state.history;
  $('#history-empty').hidden = history.length > 0;
  $('#history-tools').hidden = history.length === 0;

  $('#history-list').innerHTML = history.map((h) => {
    const ranked = sortedByRank(h.players);
    const winners = Array.isArray(h.winners) && h.winners.length
      ? h.winners
      : ranked.filter((p) => p.rank === 1).map((p) => p.name);
    const winnerScore = ranked[0] ? ranked[0].score : 0;
    const winnerText = winners.length > 1 ? `Tie: ${joinNames(winners)}` : `${winners[0] || '—'} wins`;
    const scores = ranked.map((p) => `
      <li>
        <span class="rank-pos" data-rank="${Math.min(p.rank, 4)}">${p.rank}</span>
        ${starIcon(p.color)}
        <span class="history-name">${escapeHtml(p.name)}</span>
        <span class="history-score">${formatNumber(p.score)}</span>
      </li>`).join('');
    const rounds = Number.isFinite(h.rounds) ? ` · ${plural(h.rounds, 'round')}` : '';
    return `
      <li class="card history-item">
        <div class="history-head">
          <time datetime="${new Date(h.endedAt).toISOString()}">${escapeHtml(formatDate(h.endedAt))}</time>
          <span class="history-meta">${formatDuration(h.durationMs || 0)}${rounds} · ${h.winRule === 'low' ? 'lowest wins' : 'highest wins'}</span>
        </div>
        <p class="history-winner">${icon('trophy')}<span>${escapeHtml(winnerText)} · ${formatPoints(winnerScore)}</span></p>
        <ol class="history-scores">${scores}</ol>
        <div class="history-actions">
          <button type="button" class="pill-btn" data-action="replay-history" data-id="${escapeHtml(h.id)}">${icon('restart')}<span>Play again</span></button>
          <button type="button" class="pill-btn pill-btn-danger" data-action="delete-history" data-id="${escapeHtml(h.id)}">${icon('trash')}<span>Delete</span></button>
        </div>
      </li>`;
  }).join('');
}

async function deleteHistoryItem(id) {
  const item = state.history.find((h) => h.id === id);
  if (!item) return;
  const confirmed = await confirmDialog({
    title: 'Delete this hunt?',
    message: `The hunt of ${formatDate(item.endedAt)} will be permanently removed from the history.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  state.history = state.history.filter((h) => h.id !== id);
  saveHistory();
  renderHistory();
  showToast('Hunt deleted');
}

async function clearHistory() {
  if (!state.history.length) return;
  const confirmed = await confirmDialog({
    title: 'Clear the whole history?',
    message: `${plural(state.history.length, 'hunt')} will be permanently deleted.`,
    confirmLabel: 'Clear all',
    danger: true,
  });
  if (!confirmed) return;
  state.history = [];
  saveHistory();
  renderHistory();
  showToast('History cleared');
}

/** “Play again”: New game form filled with the same hunters and settings. */
function replay(record) {
  if (!record) return;
  prefillSetup(record);
  navigate('new');
  showToast('Same hunters and settings: shuffle if you like, then start the hunt!', 3500);
}

async function replayFromHistory(id) {
  const item = state.history.find((h) => h.id === id);
  if (!item) return;
  if (state.game) {
    const confirmed = await confirmDialog({
      title: 'A hunt is in progress',
      message: 'To play this hunt again, the current hunt will be abandoned (without saving it).',
      confirmLabel: 'Abandon and replay',
      danger: true,
    });
    if (!confirmed) return;
    discardGame();
  }
  replay(item);
}

/** “New game” from the results: same number of hunters, empty names. */
function clearNamesForNewGame() {
  state.setup.players.forEach((p) => { p.name = ''; });
  state.showSetupErrors = false;
  saveSetup();
}


/* =============================================================================
   11. Rules page
   ========================================================================== */

function youtubeId(url) {
  const match = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return match ? match[1] : null;
}

const mobileVideoMedia = window.matchMedia ? window.matchMedia(MOBILE_VIDEO_QUERY) : null;
let renderedRulesVideo = null; // URL in the player (so a playing video isn't reloaded)

/** The video for this screen: the mobile one on a phone, if there is one. */
function rulesVideo() {
  const mobile = RULES_VIDEOS.mobile.trim();
  if (mobile && mobileVideoMedia && mobileVideoMedia.matches) return { url: mobile, vertical: true };
  return { url: RULES_VIDEOS.desktop.trim() || mobile, vertical: !RULES_VIDEOS.desktop.trim() && Boolean(mobile) };
}

function renderRules() {
  const { url, vertical } = rulesVideo();
  if (renderedRulesVideo === url) return;
  renderedRulesVideo = url;
  const frame = $('#rules-video');
  frame.classList.toggle('is-vertical', vertical);
  const id = youtubeId(url);
  if (id) {
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&amp;playsinline=1" title="Brand Hunters rules video" loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  } else if (url) {
    frame.innerHTML = `<video src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>`;
  } else {
    frame.innerHTML = `
      <div class="video-soon">
        <span class="video-soon-icon">${icon('play')}</span>
        <p class="video-soon-title">Rules video coming soon</p>
        <p class="card-hint">We’re filming it! It will appear right here.</p>
      </div>`;
  }
}



/* =============================================================================
   12. Keyboard, events and start-up
   ========================================================================== */

let toastTimeout = null;

function showToast(message, duration = 1800) {
  const toast = $('#toast');
  if (!toast) return;
  // Above the “Start the hunt” / “Next hunter” bar when it sticks to the bottom (phones)
  const bar = $('.screen:not([hidden]) .next-bar, .screen:not([hidden]) .cta-bar');
  if (bar && getComputedStyle(bar).position === 'sticky') toast.style.setProperty('--toast-offset', `${bar.offsetHeight + 4}px`);
  else toast.style.removeProperty('--toast-offset');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), duration);
}


/** Every action triggered by a [data-action] element. */
const ACTIONS = {
  // New game
  'count-dec': () => setPlayerCount(state.setup.players.length - 1),
  'count-inc': () => setPlayerCount(state.setup.players.length + 1),
  'remove-player': (el) => removePlayer(Number(el.dataset.index)),
  'shuffle': shuffleHunters,
  'timer-step': (el) => stepTimer(el),
  'edit-bounties': openBountyDialog,
  // The hunt
  'select-player': (el) => selectTarget(Number(el.dataset.index)),
  'reset-target': () => state.game && selectTarget(state.game.current),
  'add-bounty': (el) => addBounty(el.dataset.key, el),
  'undo': undoLastEntry,
  'next-player': () => changeTurn(1),
  'prev-player': () => changeTurn(-1),
  'toggle-pause': togglePause,
  'restart-turn-timer': restartTurnTimer,
  'open-timer-picker': openTimerPicker,
  'pick-turn-time': (el) => pickTurnTime(Number(el.dataset.seconds)),
  'toggle-sound': toggleSound,
  'tab': (el) => setTab(el.dataset.tab),
  'open-settings': openSettings,
  'end-game': endGame,
  'abandon-game': abandonGame,
  // Custom points
  'open-custom': () => openCustomDialog(),
  'custom-sign': toggleCustomSign,
  'custom-target': (el) => selectCustomTarget(Number(el.dataset.index)),
  // Bounty values
  'reset-bounties': resetBountyFields,
  // Dialogs
  'close-dialog': (el) => el.closest('dialog').close('cancel'),
  // Results and history
  'replay-last': () => replay(state.lastResult),
  'new-game': clearNamesForNewGame,
  'replay-history': (el) => replayFromHistory(el.dataset.id),
  'delete-history': (el) => deleteHistoryItem(el.dataset.id),
  'clear-history': clearHistory,
};

function onClick(event) {
  const element = event.target.closest('[data-action]');
  if (!element || element.disabled) return;
  const action = ACTIONS[element.dataset.action];
  if (!action) return;
  if (element.hasAttribute('data-close-settings')) $('#settings-dialog').close('cancel');
  action(element, event);
}

function onInput(event) {
  const target = event.target;
  if (target.matches('[data-name-index]')) onNameInput(target);
  else if (target.id === 'custom-value') onCustomInput(target);
  else if (target.matches('[data-bounty-key]')) target.removeAttribute('aria-invalid');
  else if (target.id === 'timer-custom') setCustomTimeError(null);
}

function onChange(event) {
  const target = event.target;
  if (target.name === 'winRule') {
    state.setup.winRule = target.value === 'low' ? 'low' : 'high';
    saveSetup();
  } else if (target.id === 'conditional-penalties') {
    state.setup.conditionalPenalties = target.checked;
    saveSetup();
  } else if (target.id === 'settings-conditional') {
    if (state.game) {
      state.game.conditionalPenalties = target.checked;
      state.setup.conditionalPenalties = target.checked; // kept for the next hunt
      saveSetup();
      saveGame();
      renderHunt();
    }
  } else if (target.id === 'settings-sound') {
    setSoundPref(target.checked);
  } else if (target.matches('.time-field')) {
    commitTimerField(target);
  }
}

function onKeydown(event) {
  const target = event.target;

  // Enter in the round timer: applies the time without starting the hunt.
  if (event.key === 'Enter' && target.matches && target.matches('.time-field')) {
    event.preventDefault();
    target.blur();
    return;
  }

  // Enter in a name: next hunter instead of submitting the form.
  if (event.key === 'Enter' && target.matches && target.matches('[data-name-index]')) {
    event.preventDefault();
    const next = $(`#name-${Number(target.dataset.nameIndex) + 1}`);
    if (next) next.focus();
    else target.blur();
    return;
  }

  // ↑ / ↓ on a ⠿ handle: moves the hunter in the turn order.
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && target.matches && target.matches('[data-drag-handle]')) {
    event.preventDefault();
    moveHunter(Number(target.dataset.index), event.key === 'ArrowUp' ? -1 : 1, true);
    return;
  }

  // ← / → between the score tabs.
  if (target.getAttribute && target.getAttribute('role') === 'tab' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const tabs = $$('.hunters-card [role="tab"]');
    const index = tabs.indexOf(target);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setTab(next.dataset.tab);
    next.focus();
  }
}

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', primeAudio, { passive: true });

  // Phone ↔ computer size (window resized, tablet turned): the right rules video
  if (mobileVideoMedia && RULES_VIDEOS.mobile.trim()) {
    const onVideoMediaChange = () => { if (state.route === 'rules') renderRules(); };
    if (mobileVideoMedia.addEventListener) mobileVideoMedia.addEventListener('change', onVideoMediaChange);
    else if (mobileVideoMedia.addListener) mobileVideoMedia.addListener(onVideoMediaChange); // older Safari
  }

  // Keeps the keyboard open when tapping “±” or a hunter in the custom points window.
  document.addEventListener('mousedown', (event) => {
    if (event.target.closest('[data-keep-focus]')) event.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      requestWakeLock(); // the lock is released automatically when the page is hidden
    }
  });

  window.addEventListener('hashchange', () => showScreen(routeFromHash() || defaultRoute()));

  $('#setup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    startGame();
  });
  $('#timer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitCustomTime();
  });
  $('#custom-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitCustomValue();
  });
  $('#bounty-form').addEventListener('submit', (event) => {
    event.preventDefault();
    saveBountyDialog();
  });

  // A tap on the dimmed background closes the window.
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('cancel');
    });
  });

  initNameDrag();
}

function init() {
  dom.timer = $('#timer');
  dom.timerTime = $('#timer-time');
  dom.timerCaption = $('#timer-caption');
  dom.timerProgress = $('#timer-progress');
  dom.timerKnob = $('#timer-knob');

  bindEvents();

  // A hunt in progress is resumed automatically after closing or reloading the page.
  const route = routeFromHash() || defaultRoute();
  window.history.replaceState(null, '', `#/${route}`);
  showScreen(route, { initial: true });
}

init();
