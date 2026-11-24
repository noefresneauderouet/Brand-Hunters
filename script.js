'use strict';

/* =============================================================================
   Compteur de points — logique de l'application
   -----------------------------------------------------------------------------
   • JavaScript natif : aucun framework, aucune bibliothèque, aucune compilation.
   • Toutes les données restent dans le navigateur (localStorage).

   Sommaire
     1. Constantes                     6. Écran « Partie »
     2. Utilitaires                    7. Chronomètre, minuteur, alarme, Wake Lock
     3. Stockage (localStorage)        8. Dialogues
     4. État de l'application          9. Fin de partie, résultats, historique
     5. Écran « Configuration »       10. Navigation, événements, démarrage
   ========================================================================== */


/* =============================================================================
   1. Constantes
   ========================================================================== */

/** Clés localStorage : un préfixe commun + une version du format des données. */
const STORAGE_KEYS = Object.freeze({
  game: 'compteurPoints.v1.partieEnCours',
  history: 'compteurPoints.v1.historique',
  quickButtons: 'compteurPoints.v1.boutonsRapides',
  setup: 'compteurPoints.v1.configuration',
  prefs: 'compteurPoints.v1.preferences',
});

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const MAX_NAME_LENGTH = 20;
const DEFAULT_QUICK_BUTTONS = Object.freeze([100, 200, 300, 500, -50]);
const MAX_QUICK_BUTTONS = 12;
const MAX_POINTS = 1e9;
/** Durées de tour proposées (en secondes) ; toute autre durée est « personnalisée ». */
const TURN_PRESETS = Object.freeze([30, 45, 50, 60, 75]);
const DEFAULT_TURN_SECONDS = 60;
const MIN_TURN_SECONDS = 5;
const MAX_TURN_SECONDS = 3600;
const HISTORY_LIMIT = 200;
/** Si le minuteur a expiré il y a plus longtemps (page fermée), on ne sonne pas. */
const ALARM_GRACE_MS = 5000;
const ALARM_VIBRATION = [300, 120, 300, 120, 600];
/** [début (s), durée (s), fréquence (Hz)] */
const ALARM_BEEPS = [[0, 0.16, 880], [0.24, 0.16, 880], [0.48, 0.16, 880], [0.8, 0.55, 1175]];
/** Une couleur par place de joueur (saisie 1 → couleur 1, etc.). */
const PLAYER_COLORS = Object.freeze([
  '#e5484d', '#3e63dd', '#30a46c', '#f76b15', '#8e4ec6',
  '#0d9488', '#d6409f', '#b7791f', '#0284c7', '#6b7280',
]);
/** Au-delà de cette largeur : mise en page « ordinateur » (classement affiché en permanence). */
const DESKTOP_QUERY = window.matchMedia('(min-width: 900px)');
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);


/* =============================================================================
   2. Utilitaires
   ========================================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const range = (n) => Array.from({ length: n }, (_, i) => i);
const roundScore = (n) => Math.round(n * 100) / 100;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = () => DESKTOP_QUERY.matches;

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char]);
}

function safeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6b7280';
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

function initial(name) {
  const first = Array.from(String(name).trim())[0];
  return first ? first.toLocaleUpperCase('fr-FR') : '?';
}

/** Mélange de Fisher-Yates (renvoie une copie). */
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

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** 1240 → « 1 240 », -50 → « −50 » (vrai signe moins). */
function formatNumber(n) {
  return (n < 0 ? '−' : '') + numberFormatter.format(Math.abs(n));
}

/** 200 → « +200 », -50 → « −50 ». */
function formatSigned(n) {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + numberFormatter.format(Math.abs(n));
}

function formatPoints(n) {
  return `${formatNumber(n)} ${Math.abs(n) >= 2 ? 'points' : 'point'}`;
}

function plural(n, word) {
  return `${n} ${word}${Math.abs(n) >= 2 ? 's' : ''}`;
}

/** Lit un nombre saisi en français (« 12,5 », « −30 », « 1 000 »). Renvoie NaN si invalide. */
function parseNumber(text) {
  const cleaned = String(text)
    .trim()
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
    .replace(/[−–]/g, '-');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return NaN;
  return roundScore(Number(cleaned));
}

function numberToInput(n) {
  return String(n).replace('.', ',');
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Chronomètre : « 05:42 » ou « 1:05:42 ». */
function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Compte à rebours : « 0:45 » (arrondi à la seconde supérieure). */
function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

/** Durée lisible : « 12 min », « 1 h 05 ». */
function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'moins d’1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${pad2(m)}` : `${h} h`;
}

/** 30 → « 30 s », 90 → « 1 min 30 ». */
function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${pad2(s)}` : `${m} min`;
}

/** Durée de tour valide (nombre entier de secondes, de 5 s à 60 min) ou null. */
function sanitizeTurnSeconds(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_TURN_SECONDS && n <= MAX_TURN_SECONDS ? n : null;
}

/** Lit une durée saisie : « 90 », « 90 s », « 1:30 » ou « 1 min 30 ». Renvoie des secondes ou null. */
function parseTurnDuration(text) {
  const value = String(text).trim().toLowerCase().replace(/\s+/g, '');
  let match = /^(\d{1,4})(s|sec|secondes?)?$/.exec(value);
  if (match) return sanitizeTurnSeconds(Number(match[1]));
  match = /^(\d{1,2})(?::|min|m)([0-5]?\d)?s?$/.exec(value);
  if (match) return sanitizeTurnSeconds(Number(match[1]) * 60 + Number(match[2] || 0));
  return null;
}

/** Réglage du minuteur par tour : { enabled, seconds, custom }. */
function normalizeTurnTimer(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seconds = sanitizeTurnSeconds(source.seconds) ?? DEFAULT_TURN_SECONDS;
  return {
    enabled: Boolean(source.enabled),
    seconds,
    custom: source.custom === true || !TURN_PRESETS.includes(seconds),
  };
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function formatDate(timestamp, capitalize = true) {
  const text = dateFormatter.format(new Date(timestamp));
  return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function rankLabel(rank) {
  return rank === 1 ? '1er' : `${rank}e`;
}

function ruleLabel(winRule) {
  return winRule === 'low' ? 'Le score le plus bas gagne' : 'Le score le plus haut gagne';
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}


/* =============================================================================
   3. Stockage (localStorage)
   ========================================================================== */

let storageWarningShown = false;

/** Accès sécurisé à localStorage : ne plante jamais (mode privé, quota plein…). */
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
        showToast('Sauvegarde impossible : le stockage du navigateur est plein ou désactivé.', 4500);
      }
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* rien à faire */ }
  },
};

function defaultSetup() {
  return {
    count: 4,
    names: Array(MAX_PLAYERS).fill(''),
    orderMode: 'random',
    order: shuffle(range(4)),
    winRule: 'high',
    turnTimer: { enabled: false, seconds: DEFAULT_TURN_SECONDS, custom: false },
  };
}

/** Configuration de la prochaine partie (brouillon du formulaire). */
function loadSetup() {
  const saved = store.read(STORAGE_KEYS.setup, null);
  const setup = defaultSetup();
  if (!saved || typeof saved !== 'object') return setup;

  setup.count = clamp(Number.parseInt(saved.count, 10) || setup.count, MIN_PLAYERS, MAX_PLAYERS);
  setup.names = range(MAX_PLAYERS).map((i) => {
    const name = Array.isArray(saved.names) ? saved.names[i] : '';
    return typeof name === 'string' ? name.slice(0, MAX_NAME_LENGTH) : '';
  });
  setup.orderMode = saved.orderMode === 'manual' ? 'manual' : 'random';
  setup.order = isPermutation(saved.order, setup.count)
    ? saved.order.slice()
    : (setup.orderMode === 'random' ? shuffle(range(setup.count)) : range(setup.count));
  setup.winRule = saved.winRule === 'low' ? 'low' : 'high';
  setup.turnTimer = normalizeTurnTimer(saved.turnTimer);
  return setup;
}

/** Positifs croissants d'abord, puis négatifs (−10, −50, −100…). */
function sortQuickButtons(values) {
  return values.slice().sort((a, b) => {
    if ((a > 0) !== (b > 0)) return a > 0 ? -1 : 1;
    return Math.abs(a) - Math.abs(b);
  });
}

function sanitizeQuickButtons(values) {
  if (!Array.isArray(values)) return null;
  const clean = values
    .map(Number)
    .filter((v) => Number.isFinite(v) && v !== 0 && Math.abs(v) <= MAX_POINTS)
    .map(roundScore);
  const unique = [...new Set(clean)].slice(0, MAX_QUICK_BUTTONS);
  return unique.length ? sortQuickButtons(unique) : null;
}

function loadQuickButtons() {
  return sanitizeQuickButtons(store.read(STORAGE_KEYS.quickButtons, null)) || DEFAULT_QUICK_BUTTONS.slice();
}

/** Partie en cours : on vérifie sa forme pour ne jamais planter sur des données abîmées. */
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
const saveQuickButtons = () => store.write(STORAGE_KEYS.quickButtons, state.quickButtons);
const savePrefs = () => store.write(STORAGE_KEYS.prefs, state.prefs);

function saveGame() {
  if (state.game) store.write(STORAGE_KEYS.game, state.game);
}


/* =============================================================================
   4. État de l'application
   ========================================================================== */

const state = {
  screen: 'setup',
  returnScreen: 'setup',     // écran à retrouver en quittant l'historique
  setup: loadSetup(),
  game: loadGame(),
  history: loadHistory(),
  quickButtons: loadQuickButtons(),
  prefs: loadPrefs(),
  tab: 'players',            // onglet affiché pendant la partie
  lastResult: null,          // partie qui vient de se terminer (écran résultats)
  showSetupErrors: false,    // erreurs « obligatoire » visibles après un 1er essai
  customSign: 1,             // signe de la saisie libre (+1 ou −1)
  customTarget: 0,           // joueur visé par la saisie libre
};

/** Éléments mis à jour 4 fois par seconde par le chronomètre. */
const dom = {};


/* =============================================================================
   5. Écran « Configuration »
   ========================================================================== */

function renderSetup() {
  const s = state.setup;
  $('#player-count').textContent = s.count;
  $('[data-action="count-dec"]').disabled = s.count <= MIN_PLAYERS;
  $('[data-action="count-inc"]').disabled = s.count >= MAX_PLAYERS;
  renderNameInputs();
  renderOrderList();
  checkRadio('orderMode', s.orderMode);
  checkRadio('winRule', s.winRule);
  renderTimerPicker('setup');
}

function checkRadio(name, value) {
  $$(`input[name="${name}"]`).forEach((input) => {
    input.checked = input.value === String(value);
  });
}

/** Les champs ne sont créés/supprimés qu'au besoin, pour ne pas perdre le focus. */
function renderNameInputs() {
  const s = state.setup;
  const list = $('#name-list');

  while (list.children.length > s.count) list.lastElementChild.remove();
  for (let i = list.children.length; i < s.count; i++) {
    const item = document.createElement('li');
    item.className = 'name-item';
    item.innerHTML = `
      <span class="avatar" style="--c:${PLAYER_COLORS[i]}" aria-hidden="true"></span>
      <div class="name-field">
        <label class="visually-hidden" for="name-${i}">Prénom du joueur ${i + 1}</label>
        <input class="input" id="name-${i}" type="text" data-name-index="${i}"
          maxlength="${MAX_NAME_LENGTH}" autocomplete="off" autocapitalize="words" spellcheck="false"
          placeholder="Prénom du joueur ${i + 1}" aria-describedby="name-error-${i}">
        <p class="field-error" id="name-error-${i}"></p>
      </div>`;
    list.append(item);
  }

  $$('input[data-name-index]', list).forEach((input) => {
    const i = Number(input.dataset.nameIndex);
    if (input.value !== s.names[i]) input.value = s.names[i];
    input.enterKeyHint = i === s.count - 1 ? 'done' : 'next';
    updateNameAvatar(i);
  });
  updateNameErrors();
}

function updateNameAvatar(index) {
  const avatar = $(`#name-list li:nth-child(${index + 1}) .avatar`);
  if (!avatar) return;
  const name = state.setup.names[index];
  avatar.textContent = name.trim() ? initial(name) : String(index + 1);
}

const NAME_ERRORS = {
  required: 'Le prénom est obligatoire.',
  duplicate: 'Ce prénom est déjà pris (ajoutez une initiale par exemple).',
};

/** Renvoie, pour chaque joueur, null ou un code d'erreur (« required », « duplicate »). */
function getNameErrors() {
  const { count, names } = state.setup;
  const errors = Array(count).fill(null);
  const firstIndexByName = new Map();
  for (let i = 0; i < count; i++) {
    const name = names[i].trim();
    if (!name) {
      errors[i] = 'required';
      continue;
    }
    const key = name.toLocaleLowerCase('fr-FR');
    if (firstIndexByName.has(key)) {
      errors[i] = 'duplicate';
      errors[firstIndexByName.get(key)] = 'duplicate';
    } else {
      firstIndexByName.set(key, i);
    }
  }
  return errors;
}

function updateNameErrors() {
  const errors = getNameErrors();
  errors.forEach((error, i) => {
    const input = $(`#name-${i}`);
    const message = $(`#name-error-${i}`);
    if (!input || !message) return;
    // Les doublons sont signalés tout de suite, les champs vides après un 1er essai.
    const visible = error === 'duplicate' || (error === 'required' && state.showSetupErrors);
    input.setAttribute('aria-invalid', visible ? 'true' : 'false');
    message.textContent = visible ? NAME_ERRORS[error] : '';
  });
  return errors;
}

function onNameInput(input) {
  const index = Number(input.dataset.nameIndex);
  state.setup.names[index] = input.value.slice(0, MAX_NAME_LENGTH);
  updateNameAvatar(index);
  updateNameErrors();
  renderOrderList();
  saveSetup();
}

function setPlayerCount(count) {
  const s = state.setup;
  const next = clamp(count, MIN_PLAYERS, MAX_PLAYERS);
  if (next === s.count) return;
  if (s.orderMode === 'random') s.order = shuffle(range(next));
  else if (next > s.count) s.order = s.order.concat(range(next).slice(s.count));
  else s.order = s.order.filter((slot) => slot < next);
  s.count = next;
  saveSetup();
  renderSetup();
}

function playerLabel(slot) {
  return state.setup.names[slot].trim() || `Joueur ${slot + 1}`;
}

function renderOrderList() {
  const s = state.setup;
  const manual = s.orderMode === 'manual';
  const list = $('#order-list');

  $('#shuffle-btn').hidden = manual;
  $('#order-hint').textContent = manual
    ? 'Glissez les joueurs avec la poignée ⠿ ou utilisez les flèches.'
    : 'L’ordre est tiré au sort. Touchez « Mélanger » pour refaire le tirage.';
  list.classList.toggle('is-manual', manual);

  list.innerHTML = s.order.map((slot, pos) => {
    const label = escapeHtml(playerLabel(slot));
    const placeholder = s.names[slot].trim() ? '' : ' is-placeholder';
    const controls = manual ? `
        <button type="button" class="icon-btn" data-action="move-up" data-pos="${pos}" aria-label="Monter ${label}"${pos === 0 ? ' disabled' : ''}>${icon('up')}</button>
        <button type="button" class="icon-btn" data-action="move-down" data-pos="${pos}" aria-label="Descendre ${label}"${pos === s.order.length - 1 ? ' disabled' : ''}>${icon('down')}</button>
        <span class="drag-handle" data-drag-handle aria-hidden="true">${icon('grip')}</span>` : '';
    return `
      <li class="order-item" data-pos="${pos}">
        <span class="order-pos" style="--c:${PLAYER_COLORS[slot]}">${pos + 1}</span>
        <span class="order-name${placeholder}">${label}</span>${controls}
      </li>`;
  }).join('');
}

function setOrderMode(mode) {
  const s = state.setup;
  if (mode === s.orderMode) return;
  s.orderMode = mode === 'manual' ? 'manual' : 'random';
  if (s.orderMode === 'random') s.order = shuffle(range(s.count));
  saveSetup();
  renderOrderList();
}

/** « Mélanger » : on garantit un ordre différent du précédent. */
function reshuffleOrder() {
  const s = state.setup;
  let next = shuffle(range(s.count));
  for (let tries = 0; tries < 20 && next.join() === s.order.join(); tries++) next = shuffle(range(s.count));
  s.order = next;
  saveSetup();
  renderOrderList();
  const list = $('#order-list');
  list.classList.remove('is-shuffled');
  void list.offsetWidth; // relance l'animation
  list.classList.add('is-shuffled');
}

function moveOrder(pos, delta) {
  const order = state.setup.order;
  const to = pos + delta;
  if (to < 0 || to >= order.length) return;
  moveItem(order, pos, to);
  saveSetup();
  renderOrderList();
  // Garde le focus sur le même joueur pour pouvoir appuyer plusieurs fois.
  const same = $(`#order-list [data-action="${delta < 0 ? 'move-up' : 'move-down'}"][data-pos="${to}"]`);
  const fallback = $(`#order-list .order-item[data-pos="${to}"] .icon-btn:not([disabled])`);
  const focusTarget = same && !same.disabled ? same : fallback;
  if (focusTarget) focusTarget.focus({ preventScroll: true });
  const item = $(`#order-list .order-item[data-pos="${to}"]`);
  if (item) item.classList.add('is-moved');
}

/** Glisser-déposer tactile et souris (Pointer Events), via la poignée. */
function initOrderDrag() {
  const list = $('#order-list');

  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || state.setup.orderMode !== 'manual') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();

    const item = handle.closest('.order-item');
    const items = Array.from(list.children);
    const from = items.indexOf(item);
    const rects = items.map((el) => el.getBoundingClientRect());
    const step = items.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
    const startY = event.clientY;
    let to = from;

    item.classList.add('is-dragging');
    list.classList.add('is-sorting');
    try { handle.setPointerCapture(event.pointerId); } catch { /* ignoré */ }

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
        moveItem(state.setup.order, from, to);
        saveSetup();
      }
      renderOrderList();
      const moved = $(`#order-list .order-item[data-pos="${to}"]`);
      if (moved && to !== from) moved.classList.add('is-moved');
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  });
}

/* --- Minuteur par tour : pastilles + durée personnalisée -------------------
   Le même sélecteur sert sur l'écran de configuration (« setup ») et dans le
   menu de la partie (« menu »). */

const TIMER_SCOPES = {
  setup: { picker: '#setup-timer-picker', toggle: '#turn-timer-enabled' },
  menu: { picker: '#menu-timer-picker', toggle: '#menu-turn-enabled' },
};

function timerPickerHtml(scope) {
  const name = `turnDuration-${scope}`;
  const chips = TURN_PRESETS.map((sec) => `
      <label class="chip"><input type="radio" name="${name}" value="${sec}"><span>${sec} s</span></label>`).join('');
  return `
    <div class="chips" role="radiogroup" aria-label="Durée d’un tour">${chips}
      <label class="chip"><input type="radio" name="${name}" value="custom"><span>Personnalisé</span></label>
    </div>
    <div class="timer-custom" hidden>
      <label class="visually-hidden" for="${scope}-timer-custom">Durée personnalisée d’un tour, en secondes</label>
      <div class="timer-custom-row">
        <input class="input timer-custom-input" id="${scope}-timer-custom" type="text" inputmode="numeric"
          enterkeyhint="done" autocomplete="off" maxlength="8" placeholder="90" aria-describedby="${scope}-timer-help">
        <span class="timer-custom-unit">secondes</span>
      </div>
      <p class="timer-custom-help" id="${scope}-timer-help"></p>
    </div>`;
}

function getTimerConfig(scope) {
  if (scope === 'menu') {
    const timer = state.game.turnTimer;
    return normalizeTurnTimer({ ...timer, seconds: Math.round(timer.durationMs / 1000) });
  }
  return state.setup.turnTimer;
}

function renderTimerPicker(scope) {
  const { picker, toggle } = TIMER_SCOPES[scope];
  const box = $(picker);
  if (!box || (scope === 'menu' && !state.game)) return;
  if (!box.childElementCount) box.innerHTML = timerPickerHtml(scope);

  const config = getTimerConfig(scope);
  $(toggle).checked = config.enabled;
  $$('input[type="radio"]', box).forEach((input) => {
    input.checked = config.custom ? input.value === 'custom' : Number(input.value) === config.seconds;
  });
  $('.timer-custom', box).hidden = !config.custom;
  const field = $('.timer-custom-input', box);
  if (document.activeElement !== field) field.value = String(config.seconds); // pas pendant la saisie
  updateTimerHelp(field);
  box.classList.toggle('is-off', !config.enabled);
}

/** Met à jour l'aide sous la durée personnalisée ; renvoie la durée lue (ou null). */
function updateTimerHelp(field) {
  const help = $('.timer-custom-help', field.closest('.timer-custom'));
  const raw = field.value.trim();
  const seconds = parseTurnDuration(raw);
  const invalid = seconds === null && raw !== '';
  field.setAttribute('aria-invalid', String(invalid));
  help.classList.toggle('is-error', invalid);
  if (invalid) help.textContent = 'Saisissez une durée entre 5 secondes et 60 minutes (ex. : 90 ou 1:30).';
  else if (seconds === null) help.textContent = 'Entre 5 secondes et 60 minutes.';
  else help.textContent = seconds >= 60 ? `Soit ${formatSeconds(seconds)} par tour.` : `${seconds} secondes par tour.`;
  return seconds;
}

function applyTimerConfig(scope, changes) {
  const config = normalizeTurnTimer({ ...getTimerConfig(scope), ...changes });
  if (scope === 'menu') {
    setGameTurnTimer(config);
  } else {
    state.setup.turnTimer = config;
    saveSetup();
  }
  renderTimerPicker(scope);
}

function onTimerPresetChange(input) {
  const scope = input.closest('[data-timer-scope]').dataset.timerScope;
  if (input.value === 'custom') {
    applyTimerConfig(scope, { enabled: true, custom: true });
    const field = $(`${TIMER_SCOPES[scope].picker} .timer-custom-input`);
    field.focus();
    field.select();
  } else {
    applyTimerConfig(scope, { enabled: true, seconds: Number(input.value), custom: false });
  }
}

/**
 * Durée personnalisée : appliquée pendant la frappe sur la configuration,
 * mais seulement à la validation (Entrée / sortie du champ) en cours de partie,
 * pour ne pas relancer le minuteur à chaque chiffre tapé.
 */
function onTimerCustomInput(field, committed) {
  const scope = field.closest('[data-timer-scope]').dataset.timerScope;
  const seconds = updateTimerHelp(field);
  if (seconds === null) return;
  if (scope === 'setup' || committed) applyTimerConfig(scope, { enabled: true, seconds, custom: true });
}

/** Pré-remplit la configuration avec les joueurs et réglages d'une partie. */
function prefillSetup({ players, winRule, orderMode, turnTimer }) {
  const list = players.slice(0, MAX_PLAYERS);
  const count = clamp(list.length, MIN_PLAYERS, MAX_PLAYERS);
  let slots = list.map((p) => p.slot);
  if (!isPermutation(slots, count)) slots = range(count);

  const names = state.setup.names.slice();
  list.forEach((p, i) => { names[slots[i]] = String(p.name).slice(0, MAX_NAME_LENGTH); });

  const manual = orderMode === 'manual';
  state.setup = {
    count,
    names,
    orderMode: manual ? 'manual' : 'random',
    order: manual ? slots : shuffle(range(count)),
    winRule: winRule === 'low' ? 'low' : 'high',
    turnTimer: normalizeTurnTimer(turnTimer),
  };
  state.showSetupErrors = false;
  saveSetup();
}

function startGame() {
  state.showSetupErrors = true;
  const errors = updateNameErrors();
  const firstError = errors.findIndex(Boolean);
  if (firstError !== -1) {
    const input = $(`#name-${firstError}`);
    input.focus();
    input.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    showToast('Vérifiez les prénoms des joueurs.');
    return;
  }

  const s = state.setup;
  if (s.turnTimer.enabled && s.turnTimer.custom) {
    const field = $('#setup-timer-picker .timer-custom-input');
    if (updateTimerHelp(field) === null) {
      field.focus();
      field.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      showToast('Vérifiez la durée du minuteur.');
      return;
    }
  }

  const now = Date.now();
  state.game = {
    version: 1,
    id: uid(),
    startedAt: now,
    winRule: s.winRule,
    orderMode: s.orderMode,
    players: s.order.map((slot) => ({
      id: `p${slot}`,
      slot,
      name: s.names[slot].trim(),
      color: PLAYER_COLORS[slot],
    })),
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
      since: now,
      expired: false,
    },
  };
  state.tab = 'players';
  state.showSetupErrors = false;
  saveGame();
  showScreen('game');
}


/* =============================================================================
   6. Écran « Partie »
   ========================================================================== */

function getTotals(game) {
  const totals = {};
  game.players.forEach((p) => { totals[p.id] = 0; });
  game.entries.forEach((e) => {
    if (e.p in totals) totals[e.p] = roundScore(totals[e.p] + e.v);
  });
  return totals;
}

/** Classement « sportif » : deux scores égaux partagent le même rang (1, 1, 3…). */
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

function renderGame() {
  const g = state.game;
  if (!g) return;
  const totals = getTotals(g);
  const ranking = computeRanking(g, totals);
  renderGameBar(g);
  renderTabs();
  renderPlayerList(g, totals, ranking);
  renderRanking(g, ranking);
  renderSheet(g, totals);
  renderControls(g);
  tick();
}

function renderGameBar(g) {
  const paused = isPaused(g);
  dom.screenGame.classList.toggle('is-paused', paused);
  $('#clock-icon').innerHTML = icon(paused ? 'play' : 'pause');
  $('#clock-btn').setAttribute('aria-label', paused ? 'Reprendre la partie' : 'Mettre la partie en pause');
  $('#paused-banner').hidden = !paused;
  $('#round-number').textContent = `Tour ${g.round}`;
  $('#round-player').textContent = ` · à ${g.players[g.current].name} de jouer`;
  dom.turnTimer.hidden = !g.turnTimer.enabled;
}

/** Sur ordinateur, le classement est toujours visible à droite : son onglet n'existe pas. */
function activeTab() {
  return state.tab === 'ranking' && isDesktop() ? 'players' : state.tab;
}

function renderTabs() {
  const current = activeTab();
  $$('#screen-game [role="tab"]').forEach((tab) => {
    const selected = tab.dataset.tab === current;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $('#panel-players').hidden = current !== 'players';
  $('#panel-ranking').hidden = current !== 'ranking';
  $('#panel-sheet').hidden = current !== 'sheet';
}

function setTab(tab) {
  if (!['players', 'ranking', 'sheet'].includes(tab)) return;
  state.tab = tab;
  renderTabs();
  $('#game-content').scrollTop = 0;
  if (activeTab() === 'players') scrollCurrentIntoView();
  if (activeTab() === 'sheet') {
    const row = $('#sheet-wrap .is-current-round');
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
}

function renderPlayerList(g, totals, ranking) {
  const rankById = new Map(ranking.map((row) => [row.id, row.rank]));
  const lastById = new Map();
  g.entries.forEach((e) => lastById.set(e.p, e.v));
  const showRanks = g.entries.length > 0;

  $('#player-list').innerHTML = g.players.map((p, i) => {
    const isCurrent = i === g.current;
    const isTarget = i === g.target;
    const rank = rankById.get(p.id);
    const last = lastById.get(p.id);
    const classes = ['player-card', isCurrent && 'is-current', isTarget && 'is-target'].filter(Boolean).join(' ');
    const badges = [
      isCurrent ? '<span class="badge badge-turn">À son tour</span>' : '',
      isTarget && !isCurrent ? '<span class="badge badge-target">Sélectionné</span>' : '',
      showRanks ? `<span class="badge badge-rank" data-rank="${Math.min(rank, 4)}">${rankLabel(rank)}</span>` : '',
      last !== undefined ? `<span class="last-entry ${last < 0 ? 'is-neg' : 'is-pos'}">dernier : ${formatSigned(last)}</span>` : '',
    ].join('');
    return `
      <li data-player-id="${escapeHtml(p.id)}">
        <button type="button" class="${classes}" data-action="select-player" data-index="${i}" aria-pressed="${isTarget}"${isCurrent ? ' aria-current="true"' : ''}>
          <span class="avatar" style="--c:${safeColor(p.color)}" aria-hidden="true">${escapeHtml(initial(p.name))}</span>
          <span class="player-main">
            <span class="player-name">${escapeHtml(p.name)}</span>
            <span class="player-meta">${badges}</span>
          </span>
          <span class="player-score">${formatNumber(totals[p.id])}</span>
        </button>
      </li>`;
  }).join('');
}

/** Ajoute à chaque ligne l'écart avec le premier. */
function withGaps(rows, hasScores) {
  const leader = rows[0] ? rows[0].score : 0;
  return rows.map((row) => {
    let gap = '';
    if (hasScores) {
      gap = row.rank === 1 ? 'En tête' : `à ${formatPoints(Math.abs(roundScore(row.score - leader)))}`;
    }
    return { ...row, gap };
  });
}

function rankingRowHtml(row) {
  return `
    <li class="rank-row${row.rank === 1 ? ' is-first' : ''}">
      <span class="rank-pos" data-rank="${Math.min(row.rank, 4)}">${row.rank}</span>
      <span class="avatar avatar-sm" style="--c:${safeColor(row.color)}" aria-hidden="true">${escapeHtml(initial(row.name))}</span>
      <span class="rank-name">${escapeHtml(row.name)}${row.gap ? `<small>${escapeHtml(row.gap)}</small>` : ''}</span>
      <span class="rank-score">${formatNumber(row.score)}</span>
    </li>`;
}

function renderRanking(g, ranking) {
  const rows = withGaps(ranking, g.entries.length > 0).map(rankingRowHtml).join('');
  $('#ranking-rule').textContent = `${ruleLabel(g.winRule)} · mis à jour en direct`;
  $('#ranking-list').innerHTML = rows;
  // Panneau latéral (ordinateur)
  $('#side-ranking-rule').textContent = g.winRule === 'low' ? 'le plus bas gagne' : 'le plus haut gagne';
  $('#side-ranking-list').innerHTML = rows;
}

/** Feuille de score : une ligne par tour, une colonne par joueur. */
function renderSheet(g, totals) {
  const rounds = g.entries.reduce((max, e) => Math.max(max, e.r), g.round);
  const cells = new Map();
  g.entries.forEach((e) => {
    const key = `${e.r}|${e.p}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(e.v);
  });

  const head = g.players.map((p) => `
    <th scope="col"><span class="sheet-player"><span class="dot" style="--c:${safeColor(p.color)}"></span><span class="sheet-name">${escapeHtml(p.name)}</span></span></th>`).join('');
  const totalRow = g.players.map((p) => `<td>${formatNumber(totals[p.id])}</td>`).join('');

  let body = '';
  for (let r = 1; r <= rounds; r++) {
    body += `<tr${r === g.round ? ' class="is-current-round"' : ''}><th scope="row">${r}</th>`;
    g.players.forEach((p) => {
      const values = cells.get(`${r}|${p.id}`);
      if (!values) {
        body += '<td class="is-empty">·</td>';
        return;
      }
      const sum = roundScore(values.reduce((a, b) => a + b, 0));
      const detail = values.length > 1 ? `<span class="cell-detail">${values.map(formatSigned).join(' ')}</span>` : '';
      body += `<td class="${sum < 0 ? 'is-neg' : 'is-pos'}"><span class="cell-sum">${formatSigned(sum)}</span>${detail}</td>`;
    });
    body += '</tr>';
  }

  $('#sheet-note').textContent = g.entries.length
    ? 'Points marqués à chaque tour (un tour = chaque joueur a joué une fois).'
    : 'Aucun point saisi pour l’instant.';
  $('#sheet-wrap').innerHTML = `
    <table class="sheet">
      <thead>
        <tr><th scope="col">Tour</th>${head}</tr>
        <tr class="sheet-totals"><th scope="row">Total</th>${totalRow}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderControls(g) {
  const target = g.players[g.target];
  $('#target-name').innerHTML = `<span class="dot" style="--c:${safeColor(target.color)}"></span>${escapeHtml(target.name)}`;
  $('#target-off-turn').hidden = g.target === g.current;
  $('#undo-btn').disabled = g.entries.length === 0;
  $('#prev-btn').disabled = g.round <= 1 && g.current === 0;
  renderQuickGrid();
}

function renderQuickGrid() {
  const values = state.quickButtons;
  const count = values.length;
  const cols = count <= 5 ? count : Math.min(5, Math.ceil(count / 2));
  const grid = $('#quick-grid');
  grid.style.setProperty('--cols', cols);
  grid.innerHTML = values.map((v, i) => {
    const label = formatSigned(v);
    const long = label.length > 5 ? ' is-long' : '';
    const verb = v > 0 ? 'Ajouter' : 'Retirer';
    const key = i < 10 ? String((i + 1) % 10) : ''; // touches 1 à 9, puis 0
    const shortcut = key ? ` aria-keyshortcuts="${key}"` : '';
    const hint = key ? `<kbd class="kbd" aria-hidden="true">${key}</kbd>` : '';
    return `<button type="button" class="quick-btn ${v < 0 ? 'is-neg' : 'is-pos'}${long}" data-action="add-points" data-value="${v}" aria-label="${verb} ${formatNumber(Math.abs(v))} points"${shortcut}>${hint}${label}</button>`;
  }).join('');
}

function selectTarget(index) {
  const g = state.game;
  if (!g || !Number.isInteger(index) || index < 0 || index >= g.players.length || index === g.target) return;
  g.target = index;
  saveGame();
  renderGame();
}

function addPoints(value) {
  const g = state.game;
  if (!g || !Number.isFinite(value) || value === 0) return;
  const player = g.players[g.target];
  const points = roundScore(value);
  g.entries.push({ p: player.id, v: points, r: g.round, t: Date.now() });
  saveGame();
  renderGame();
  animateScore(player.id, points);
  showToast(`${formatSigned(points)} pour ${player.name}`);
}

function animateScore(playerId, value) {
  const card = $(`#player-list li[data-player-id="${CSS.escape(playerId)}"] .player-card`);
  if (!card) return;
  $('.player-score', card).classList.add('is-bumped');
  const delta = document.createElement('span');
  delta.className = `float-delta ${value < 0 ? 'is-neg' : 'is-pos'}`;
  delta.textContent = formatSigned(value);
  card.append(delta);
  setTimeout(() => delta.remove(), 1000);
}

function undoLastEntry() {
  const g = state.game;
  if (!g || !g.entries.length) return;
  const entry = g.entries.pop();
  saveGame();
  renderGame();
  const player = g.players.find((p) => p.id === entry.p);
  showToast(`Annulé : ${formatSigned(entry.v)} pour ${player ? player.name : '?'}`);
}

/** « Joueur suivant » (+1) ou « précédent » (−1). Un nouveau tour commence après le dernier joueur. */
function changeTurn(direction) {
  const g = state.game;
  if (!g) return;
  const count = g.players.length;
  let next = g.current + direction;
  if (next >= count) {
    next = 0;
    g.round += 1;
  } else if (next < 0) {
    if (g.round <= 1) return;
    next = count - 1;
    g.round -= 1;
  }
  const wasPaused = isPaused(g);
  g.current = next;
  g.target = next;
  if (wasPaused) resumeClock(g); // passer au joueur suivant relance la partie
  resetTurnTimer(g);
  saveGame();
  renderGame();
  scrollCurrentIntoView();
  if (wasPaused) showToast('Chronomètre relancé');
}

function scrollCurrentIntoView() {
  if (activeTab() !== 'players') return;
  const card = $('#player-list .player-card.is-current');
  if (card) card.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}


/** Choisit le joueur qui reçoit les points avec ↑ / ↓. */
function moveTarget(delta) {
  const g = state.game;
  if (!g) return;
  const count = g.players.length;
  selectTarget((g.target + delta + count) % count);
  const card = $('#player-list .player-card.is-target');
  if (card && activeTab() === 'players') card.scrollIntoView({ block: 'nearest' });
}

/** Bouton rapide déclenché au clavier : même effet qu'un clic, avec un retour visuel. */
function pressQuickButton(index) {
  const value = state.quickButtons[index];
  if (value === undefined) return;
  addPoints(value);
  const button = $$('#quick-grid .quick-btn')[index];
  if (button) button.classList.add('is-pressed');
}

function openShortcuts() {
  openDialog($('#shortcuts-dialog'));
}

function isTypingTarget(target) {
  return Boolean(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
}

/** Les raccourcis ne servent que sur l'écran de partie, sans fenêtre ouverte ni champ en cours de saisie. */
function isGameShortcutContext(event) {
  return state.screen === 'game' && Boolean(state.game) && !$('dialog[open]') && !isTypingTarget(event.target);
}

/**
 * Raccourcis clavier de la partie. Renvoie true si la touche a été utilisée.
 * Les chiffres utilisent event.code (touche physique) : ils marchent aussi en AZERTY sans Maj.
 */
function handleGameShortcut(event) {
  if (!isGameShortcutContext(event) || event.altKey) return false;
  const { key, code } = event;
  const letter = key.length === 1 ? key.toLowerCase() : '';
  const once = (fn) => {
    if (!event.repeat) fn(); // touche maintenue : on n'enchaîne pas les joueurs
    return true;
  };

  if (event.ctrlKey || event.metaKey) {
    return letter === 'z' && !event.shiftKey ? once(undoLastEntry) : false;
  }
  // Sur un onglet choisi au clavier, ← et → changent d'onglet.
  const onTab = event.target.getAttribute && event.target.getAttribute('role') === 'tab';
  if (onTab && (key === 'ArrowLeft' || key === 'ArrowRight')) return false;

  if (key === ' ' || key === 'ArrowRight') return once(() => changeTurn(1));
  if (key === 'ArrowLeft') return once(() => changeTurn(-1));
  if (key === 'ArrowUp') { moveTarget(-1); return true; }
  if (key === 'ArrowDown') { moveTarget(1); return true; }
  if (key === 'Backspace' || key === 'Delete') return once(undoLastEntry);

  const digit = /^Digit(\d)$/.exec(code);
  if (digit) {
    const index = (Number(digit[1]) + 9) % 10; // 1 → 1er bouton … 0 → 10e bouton
    if (index < state.quickButtons.length) return once(() => pressQuickButton(index));
  }
  if (/^Numpad\d$/.test(code) && /^\d$/.test(key)) return once(() => openCustomDialog({ text: key }));
  if (key === '+') return once(() => openCustomDialog({ sign: 1 }));
  if (key === '-' || key === '−') return once(() => openCustomDialog({ sign: -1 }));
  if (letter === 's') return once(() => openCustomDialog());
  if (letter === 'p') return once(togglePause);
  if (key === '?' || letter === 'h') return once(openShortcuts);
  return false;
}


/* =============================================================================
   7. Chronomètre, minuteur par tour, alarme, Wake Lock
   -----------------------------------------------------------------------------
   Les temps sont calculés à partir d'horodatages (Date.now()) et non en
   comptant des « ticks » : ils restent justes même si le téléphone se met en
   veille ou si la page est rechargée.
     clock     = { accMs, since }   temps cumulé + début de la période en cours
     turnTimer = { enabled, durationMs, accMs, since, expired }
   since === null signifie « en pause ».
   ========================================================================== */

const isPaused = (g) => g.clock.since == null;
const elapsedSince = (since, now) => (since == null ? 0 : Math.max(0, now - since));
const gameElapsed = (g, now = Date.now()) => g.clock.accMs + elapsedSince(g.clock.since, now);
const turnElapsed = (g, now = Date.now()) => g.turnTimer.accMs + elapsedSince(g.turnTimer.since, now);

function pauseClock(g, now = Date.now()) {
  if (isPaused(g)) return;
  g.clock.accMs = gameElapsed(g, now);
  g.clock.since = null;
  g.turnTimer.accMs = turnElapsed(g, now);
  g.turnTimer.since = null;
}

function resumeClock(g, now = Date.now()) {
  if (!isPaused(g)) return;
  g.clock.since = now;
  g.turnTimer.since = now;
}

function resetTurnTimer(g, now = Date.now()) {
  g.turnTimer.accMs = 0;
  g.turnTimer.since = isPaused(g) ? null : now;
  g.turnTimer.expired = false;
}

function togglePause() {
  const g = state.game;
  if (!g) return;
  if (isPaused(g)) resumeClock(g);
  else pauseClock(g);
  saveGame();
  renderGame();
}

function restartTurnTimer() {
  const g = state.game;
  if (!g) return;
  resetTurnTimer(g);
  saveGame();
  renderGame();
}

/** Mis à jour 4 fois par seconde : affichage des temps et détection de la fin du tour. */
function tick() {
  const g = state.game;
  if (!g) return;
  const now = Date.now();
  dom.clock.textContent = formatClock(gameElapsed(g, now));

  const timer = g.turnTimer;
  if (!timer.enabled) {
    dom.screenGame.classList.remove('is-expired');
    return;
  }
  const elapsed = turnElapsed(g, now);
  const remaining = Math.max(0, timer.durationMs - elapsed);

  if (remaining === 0 && !timer.expired) {
    timer.expired = true;
    saveGame();
    triggerAlarm(elapsed - timer.durationMs > ALARM_GRACE_MS);
  }

  dom.timerText.textContent = timer.expired ? 'Temps écoulé !' : formatCountdown(remaining);
  dom.timerFill.style.transform = `scaleX(${remaining / timer.durationMs})`;
  dom.turnTimer.classList.toggle('is-warning', !timer.expired && remaining <= Math.min(10000, timer.durationMs * 0.25));
  dom.turnTimer.classList.toggle('is-expired', timer.expired);
  dom.screenGame.classList.toggle('is-expired', timer.expired);
}

let tickInterval = null;

/** Démarre/arrête le chronomètre et le maintien de l'écran selon qu'une partie existe. */
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

/* --- Alarme : signal visuel + son (Web Audio) + vibration --------------- */

function triggerAlarm(silent) {
  if (silent) return; // expiré pendant que la page était fermée : signal visuel seulement
  flashScreen();
  if (state.prefs.sound) playBeeps(ALARM_BEEPS);
  if ('vibrate' in navigator) {
    try { navigator.vibrate(ALARM_VIBRATION); } catch { /* non pris en charge */ }
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

/**
 * Les navigateurs mobiles (iOS surtout) n'autorisent le son qu'après un geste.
 * On « déverrouille » l'audio au premier toucher, si un minuteur sonore est actif.
 */
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
  } catch { /* ignoré */ }
}

function playBeeps(pattern) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const start = ctx.currentTime + 0.05;
  pattern.forEach(([offset, duration, frequency]) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = start + offset;
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.015);
    gain.gain.setValueAtTime(0.25, t0 + duration - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(t0);
    oscillator.stop(t0 + duration + 0.02);
  });
}

/* --- Garder l'écran allumé (Screen Wake Lock API) ----------------------- */

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
    wakeLock = null; // refusé (économie d'énergie, onglet masqué…)
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
      ? 'Ce navigateur ne sait pas garder l’écran allumé : pensez à régler la mise en veille du téléphone.'
      : 'Pour garder l’écran allumé, le site doit être ouvert en HTTPS.';
  }
  return wakeLock
    ? 'L’écran reste allumé pendant la partie.'
    : 'Maintien de l’écran allumé indisponible pour le moment (mode économie d’énergie ?).';
}


/* =============================================================================
   8. Dialogues
   ========================================================================== */

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeAllDialogs() {
  $$('dialog[open]').forEach((dialog) => dialog.close('cancel'));
}

/** Confirmation : renvoie une promesse résolue avec true (OK) ou false. */
function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  const dialog = $('#confirm-dialog');
  const ok = $('#confirm-ok');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  ok.textContent = confirmLabel;
  ok.classList.toggle('btn-danger', danger);
  ok.classList.toggle('btn-primary', !danger);
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
  });
}

/* --- Saisie libre -------------------------------------------------------- */

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
      <span class="dot" style="--c:${safeColor(p.color)}"></span>${escapeHtml(p.name)}</button>`;
  }).join('');
}

function onCustomInput(input) {
  // Un « - » ou « + » tapé au clavier change le signe ; le champ garde la valeur absolue.
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
  submit.classList.toggle('btn-plus', !negative);
  submit.classList.toggle('btn-minus', negative);
  submit.textContent = value === null
    ? (negative ? 'Retirer' : 'Ajouter')
    : `${negative ? 'Retirer' : 'Ajouter'} ${formatNumber(Math.abs(value))}`;

  const player = g.players[state.customTarget];
  const total = getTotals(g)[player.id];
  $('#custom-preview').textContent = value === null
    ? `${player.name} : ${formatNumber(total)}`
    : `${player.name} : ${formatNumber(total)} → ${formatNumber(roundScore(total + value))}`;
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
  addPoints(value);
}

/* --- Boutons rapides ----------------------------------------------------- */

function quickRowHtml(value) {
  const negative = value < 0;
  const shown = value ? numberToInput(Math.abs(value)) : '';
  return `
    <li class="quick-edit-row ${negative ? 'is-neg' : 'is-pos'}">
      <button type="button" class="sign-btn" data-action="quick-toggle-sign" data-keep-focus aria-label="Inverser : ajouter ou retirer">${negative ? '−' : '+'}</button>
      <input class="input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(shown)}" placeholder="Valeur" aria-label="Valeur du bouton">
      <button type="button" class="icon-btn icon-btn-danger" data-action="quick-remove-row" aria-label="Supprimer ce bouton">${icon('trash')}</button>
    </li>`;
}

function renderQuickEditRows(values) {
  $('#quick-edit-list').innerHTML = values.map(quickRowHtml).join('');
  updateQuickAddButton();
}

function updateQuickAddButton() {
  $('#quick-add-btn').disabled = $$('#quick-edit-list .quick-edit-row').length >= MAX_QUICK_BUTTONS;
}

function setQuickMessage(text, isError = false) {
  const message = $('#quick-message');
  message.textContent = text;
  message.classList.toggle('is-error', isError);
}

function openQuickDialog() {
  renderQuickEditRows(state.quickButtons);
  setQuickMessage('');
  openDialog($('#quick-dialog'));
}

function setRowSign(row, negative) {
  row.classList.toggle('is-neg', negative);
  row.classList.toggle('is-pos', !negative);
  $('.sign-btn', row).textContent = negative ? '−' : '+';
}

function onQuickRowInput(input) {
  const row = input.closest('.quick-edit-row');
  if (/[-−–]/.test(input.value)) setRowSign(row, true);
  else if (input.value.includes('+')) setRowSign(row, false);
  const cleaned = input.value.replace(/[-−–+]/g, '');
  if (cleaned !== input.value) input.value = cleaned;
  input.removeAttribute('aria-invalid');
}

function addQuickRow() {
  const list = $('#quick-edit-list');
  if (list.children.length >= MAX_QUICK_BUTTONS) return;
  list.insertAdjacentHTML('beforeend', quickRowHtml(0));
  updateQuickAddButton();
  setQuickMessage('');
  $('input', list.lastElementChild).focus();
}

function removeQuickRow(button) {
  button.closest('.quick-edit-row').remove();
  updateQuickAddButton();
}

function resetQuickRows() {
  renderQuickEditRows(DEFAULT_QUICK_BUTTONS);
  setQuickMessage('Valeurs par défaut rétablies : touchez « Enregistrer » pour confirmer.');
}

function saveQuickDialog() {
  const values = [];
  let firstInvalid = null;
  $$('#quick-edit-list .quick-edit-row').forEach((row) => {
    const input = $('input', row);
    if (!input.value.trim()) return; // ligne vide : ignorée
    const abs = parseNumber(input.value);
    const valid = Number.isFinite(abs) && abs > 0 && abs <= MAX_POINTS;
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!valid) {
      firstInvalid = firstInvalid || input;
      return;
    }
    values.push(row.classList.contains('is-neg') ? -abs : abs);
  });

  if (firstInvalid) {
    setQuickMessage('Valeur incorrecte : saisissez un nombre différent de 0.', true);
    firstInvalid.focus();
    return;
  }
  const clean = sanitizeQuickButtons(values);
  if (!clean) {
    setQuickMessage('Gardez au moins un bouton.', true);
    return;
  }
  state.quickButtons = clean;
  saveQuickButtons();
  if (state.game) renderQuickGrid();
  $('#quick-dialog').close('ok');
  showToast('Boutons rapides enregistrés');
}

/* --- Menu de la partie --------------------------------------------------- */

function openMenu() {
  const g = state.game;
  if (!g) return;
  renderTimerPicker('menu');
  $('#pref-sound').checked = state.prefs.sound;
  $('#wake-status').textContent = getWakeLockStatus();
  openDialog($('#menu-dialog'));
}

/** Change le minuteur en cours de partie (il repart de zéro si la durée change). */
function setGameTurnTimer({ enabled, seconds, custom }) {
  const g = state.game;
  if (!g) return;
  const timer = g.turnTimer;
  const durationMs = seconds * 1000;
  const changed = enabled !== timer.enabled || durationMs !== timer.durationMs;
  timer.enabled = enabled;
  timer.durationMs = durationMs;
  timer.custom = custom;
  if (changed) {
    if (enabled) resetTurnTimer(g);
    else timer.expired = false;
  }
  state.setup.turnTimer = normalizeTurnTimer({ enabled, seconds, custom }); // gardé pour la prochaine partie
  saveSetup();
  saveGame();
  renderGame();
}

function setSoundPref(enabled) {
  state.prefs.sound = enabled;
  savePrefs();
  if (enabled) playBeeps([[0, 0.12, 880]]); // petit bip de test
}


/* =============================================================================
   9. Fin de partie, résultats et historique
   ========================================================================== */

/** Résumé compact d'une partie, tel qu'il est enregistré dans l'historique. */
function buildResult(game, now = Date.now()) {
  const totals = getTotals(game);
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
    orderMode: game.orderMode,
    turnTimer: {
      enabled: Boolean(game.turnTimer.enabled),
      seconds: Math.round(game.turnTimer.durationMs / 1000),
      custom: Boolean(game.turnTimer.custom),
    },
    players: game.players.map((p) => ({
      name: p.name,
      slot: p.slot,
      color: p.color,
      score: totals[p.id],
      rank: rankById.get(p.id),
    })),
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
  const confirmed = await confirmDialog({
    title: 'Terminer la partie ?',
    message: hasScores
      ? 'Le classement final sera affiché et la partie enregistrée dans l’historique.'
      : 'Aucun point n’a été saisi : la partie ne sera pas enregistrée dans l’historique.',
    confirmLabel: 'Terminer',
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
  showScreen('results');
}

async function abandonGame() {
  const g = state.game;
  if (!g) return;
  const confirmed = await confirmDialog({
    title: 'Abandonner la partie ?',
    message: 'Les scores de cette partie seront perdus et elle ne sera pas enregistrée dans l’historique.',
    confirmLabel: 'Abandonner',
    danger: true,
  });
  if (!confirmed || !state.game) return;
  prefillSetup(buildResult(g));
  discardGame();
  showScreen('setup');
  showToast('Partie abandonnée');
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

  let title;
  let subtitle;
  if (!result.saved) {
    title = 'Partie terminée';
    subtitle = 'Aucun point n’a été saisi.';
  } else if (winners.length === 1) {
    title = `${winners[0].name} gagne !`;
    subtitle = `avec ${formatPoints(winners[0].score)}`;
  } else {
    title = 'Égalité !';
    subtitle = `${joinNames(winners.map((w) => w.name))} terminent premiers avec ${formatPoints(winners[0].score)}`;
  }
  $('#results-title').textContent = title;
  $('#results-sub').textContent = subtitle;
  $('#final-ranking').innerHTML = withGaps(ranked, result.saved).map(rankingRowHtml).join('');
  $('#results-meta').textContent = [
    `Durée : ${formatDuration(result.durationMs)}`,
    plural(result.rounds, 'tour'),
    ruleLabel(result.winRule),
    result.saved ? 'Enregistrée dans l’historique' : 'Non enregistrée',
  ].join(' · ');
}

function renderHistory() {
  const history = state.history;
  $('#history-empty').hidden = history.length > 0;
  $('#clear-history-btn').hidden = history.length === 0;
  $('#history-back-label').textContent = state.game ? 'Partie' : 'Retour';

  $('#history-list').innerHTML = history.map((h) => {
    const ranked = sortedByRank(h.players);
    const winners = Array.isArray(h.winners) && h.winners.length
      ? h.winners
      : ranked.filter((p) => p.rank === 1).map((p) => p.name);
    const winnerScore = ranked[0] ? ranked[0].score : 0;
    const winnerText = winners.length > 1
      ? `Égalité : ${joinNames(winners)}`
      : `${winners[0] || '—'} gagne`;
    const scores = ranked.map((p) => `
      <li>
        <span class="rank-pos rank-pos-sm" data-rank="${Math.min(p.rank, 4)}">${p.rank}</span>
        <span class="dot" style="--c:${safeColor(p.color)}"></span>
        <span class="history-name">${escapeHtml(p.name)}</span>
        <span class="history-score">${formatNumber(p.score)}</span>
      </li>`).join('');
    const rounds = Number.isFinite(h.rounds) ? ` · ${plural(h.rounds, 'tour')}` : '';
    return `
      <li class="card history-item">
        <div class="history-head">
          <time datetime="${new Date(h.endedAt).toISOString()}">${escapeHtml(formatDate(h.endedAt))}</time>
          <span class="history-meta">Durée ${formatDuration(h.durationMs || 0)}${rounds} · ${h.winRule === 'low' ? 'plus bas gagne' : 'plus haut gagne'}</span>
        </div>
        <p class="history-winner">${icon('trophy')}<span>${escapeHtml(winnerText)} · ${formatPoints(winnerScore)}</span></p>
        <ol class="history-scores">${scores}</ol>
        <div class="history-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="replay-history" data-id="${escapeHtml(h.id)}">${icon('restart')}<span>Rejouer</span></button>
          <button type="button" class="btn btn-ghost btn-sm text-danger" data-action="delete-history" data-id="${escapeHtml(h.id)}">${icon('trash')}<span>Supprimer</span></button>
        </div>
      </li>`;
  }).join('');
}

async function deleteHistoryItem(id) {
  const item = state.history.find((h) => h.id === id);
  if (!item) return;
  const confirmed = await confirmDialog({
    title: 'Supprimer cette partie ?',
    message: `La partie du ${formatDate(item.endedAt, false)} sera définitivement supprimée de l’historique.`,
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!confirmed) return;
  state.history = state.history.filter((h) => h.id !== id);
  saveHistory();
  renderHistory();
  showToast('Partie supprimée');
}

async function clearHistory() {
  if (!state.history.length) return;
  const confirmed = await confirmDialog({
    title: 'Effacer tout l’historique ?',
    message: `${plural(state.history.length, 'partie')} ${state.history.length > 1 ? 'seront supprimées' : 'sera supprimée'} définitivement.`,
    confirmLabel: 'Tout effacer',
    danger: true,
  });
  if (!confirmed) return;
  state.history = [];
  saveHistory();
  renderHistory();
  showToast('Historique effacé');
}

/** « Rejouer avec les mêmes joueurs » : configuration pré-remplie, prête à lancer. */
function replay(record) {
  if (!record) return;
  prefillSetup(record);
  showScreen('setup');
  showToast(record.orderMode === 'manual'
    ? 'Mêmes joueurs et réglages : vérifiez puis « Commencer ».'
    : 'Mêmes joueurs, nouveau tirage de l’ordre : prêt à commencer !', 3500);
}

async function replayFromHistory(id) {
  const item = state.history.find((h) => h.id === id);
  if (!item) return;
  if (state.game) {
    const confirmed = await confirmDialog({
      title: 'Une partie est en cours',
      message: 'Pour rejouer cette partie, la partie en cours sera abandonnée (sans être enregistrée).',
      confirmLabel: 'Abandonner et rejouer',
      danger: true,
    });
    if (!confirmed) return;
    discardGame();
  }
  replay(item);
}

/** « Nouvelle partie » : même nombre de joueurs et mêmes réglages, prénoms vides. */
function newGame() {
  const s = state.setup;
  s.names = Array(MAX_PLAYERS).fill('');
  s.order = s.orderMode === 'random' ? shuffle(range(s.count)) : range(s.count);
  state.showSetupErrors = false;
  saveSetup();
  showScreen('setup');
}


/* =============================================================================
   10. Navigation, événements et démarrage
   ========================================================================== */

function showScreen(name) {
  let next = name;
  if (next === 'game' && !state.game) next = 'setup';
  if (next === 'results' && !state.lastResult) next = 'setup';
  if (next === 'history' && state.screen !== 'history') state.returnScreen = state.screen;

  state.screen = next;
  $$('.screen').forEach((screen) => { screen.hidden = screen.dataset.screen !== next; });
  const active = $(`.screen[data-screen="${next}"]`);
  $$('.screen-body, .game-content', active).forEach((body) => { body.scrollTop = 0; });

  if (next === 'setup') renderSetup();
  else if (next === 'game') { renderGame(); scrollCurrentIntoView(); }
  else if (next === 'results') renderResults();
  else if (next === 'history') renderHistory();

  syncRuntime();
}

function leaveHistory() {
  const back = state.returnScreen;
  if (back === 'game' && state.game) showScreen('game');
  else if (back === 'results' && state.lastResult) showScreen('results');
  else showScreen(state.game ? 'game' : 'setup');
}

let toastTimeout = null;

function showToast(message, duration = 1800) {
  const toast = $('#toast');
  if (!toast) return;
  const anchor = $('.screen:not([hidden]) [data-toast-anchor]');
  const sidePanel = anchor && isDesktop() && anchor.classList.contains('control-panel');
  if (anchor && anchor.offsetHeight && !sidePanel) toast.style.setProperty('--toast-offset', `${anchor.offsetHeight + 12}px`);
  else toast.style.removeProperty('--toast-offset');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), duration);
}

/** Toutes les actions déclenchées par un élément [data-action]. */
const ACTIONS = {
  // Configuration
  'count-dec': () => setPlayerCount(state.setup.count - 1),
  'count-inc': () => setPlayerCount(state.setup.count + 1),
  'shuffle': reshuffleOrder,
  'move-up': (el) => moveOrder(Number(el.dataset.pos), -1),
  'move-down': (el) => moveOrder(Number(el.dataset.pos), 1),
  // Partie
  'select-player': (el) => selectTarget(Number(el.dataset.index)),
  'add-points': (el) => addPoints(Number(el.dataset.value)),
  'undo': undoLastEntry,
  'next-player': () => changeTurn(1),
  'prev-player': () => changeTurn(-1),
  'toggle-pause': togglePause,
  'restart-turn-timer': restartTurnTimer,
  'tab': (el) => setTab(el.dataset.tab),
  'open-menu': openMenu,
  'end-game': endGame,
  'abandon-game': abandonGame,
  // Saisie libre
  'open-custom': () => openCustomDialog(),
  'open-shortcuts': openShortcuts,
  'custom-sign': toggleCustomSign,
  'custom-target': (el) => selectCustomTarget(Number(el.dataset.index)),
  // Boutons rapides
  'edit-quick': openQuickDialog,
  'quick-add-row': addQuickRow,
  'quick-remove-row': removeQuickRow,
  'quick-toggle-sign': (el) => setRowSign(el.closest('.quick-edit-row'), !el.closest('.quick-edit-row').classList.contains('is-neg')),
  'quick-reset': resetQuickRows,
  // Dialogues
  'close-dialog': (el) => el.closest('dialog').close('cancel'),
  // Résultats et historique
  'replay-last': () => replay(state.lastResult),
  'new-game': newGame,
  'open-history': () => { closeAllDialogs(); showScreen('history'); },
  'history-back': leaveHistory,
  'replay-history': (el) => replayFromHistory(el.dataset.id),
  'delete-history': (el) => deleteHistoryItem(el.dataset.id),
  'clear-history': clearHistory,
};

function onClick(event) {
  const element = event.target.closest('[data-action]');
  if (!element || element.disabled) return;
  const action = ACTIONS[element.dataset.action];
  if (!action) return;
  if (element.hasAttribute('data-close-menu')) $('#menu-dialog').close('cancel');
  action(element, event);
  // Après un clic souris sur un onglet, ← et → redeviennent « joueur précédent / suivant ».
  if (event.detail > 0 && element.getAttribute('role') === 'tab') element.blur();
}

function onInput(event) {
  const target = event.target;
  if (target.matches('[data-name-index]')) onNameInput(target);
  else if (target.id === 'custom-value') onCustomInput(target);
  else if (target.closest('.quick-edit-row')) onQuickRowInput(target);
  else if (target.matches('.timer-custom-input')) onTimerCustomInput(target, false);
}

function onChange(event) {
  const target = event.target;
  if (target.name === 'orderMode') setOrderMode(target.value);
  else if (target.name === 'winRule') {
    state.setup.winRule = target.value === 'low' ? 'low' : 'high';
    saveSetup();
  } else if (target.id === 'turn-timer-enabled') {
    applyTimerConfig('setup', { enabled: target.checked });
  } else if (target.id === 'menu-turn-enabled') {
    applyTimerConfig('menu', { enabled: target.checked });
  } else if (target.name && target.name.startsWith('turnDuration-')) {
    onTimerPresetChange(target);
  } else if (target.matches('.timer-custom-input')) {
    onTimerCustomInput(target, true);
  } else if (target.id === 'pref-sound') {
    setSoundPref(target.checked);
  }
}

function onKeydown(event) {
  const target = event.target;

  // Ctrl+Entrée (⌘+Entrée sur Mac) sur la configuration : lance la partie.
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && state.screen === 'setup' && !$('dialog[open]')) {
    event.preventDefault();
    startGame();
    return;
  }

  // Entrée dans la durée personnalisée : valide la durée sans lancer la partie.
  if (event.key === 'Enter' && target.matches('.timer-custom-input')) {
    event.preventDefault();
    target.blur();
    return;
  }

  // Entrée dans un prénom : passe au joueur suivant au lieu d'envoyer le formulaire.
  if (event.key === 'Enter' && target.matches('[data-name-index]')) {
    event.preventDefault();
    const next = $(`#name-${Number(target.dataset.nameIndex) + 1}`);
    if (next) next.focus();
    else target.blur();
    return;
  }

  // Flèches gauche/droite pour naviguer entre les onglets.
  if (target.getAttribute('role') === 'tab' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const tabs = $$('#screen-game [role="tab"]').filter((tab) => tab.offsetParent !== null);
    const index = tabs.indexOf(target);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setTab(next.dataset.tab);
    next.focus();
    return;
  }

  if (handleGameShortcut(event)) event.preventDefault();
}

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKeydown);
  // Espace = « Joueur suivant » : on empêche aussi le bouton qui a le focus de se déclencher.
  document.addEventListener('keyup', (event) => {
    if (event.key === ' ' && isGameShortcutContext(event)) event.preventDefault();
  });

  // Passage téléphone ↔ ordinateur (fenêtre redimensionnée, tablette tournée…).
  const onLayoutChange = () => { if (state.screen === 'game') renderGame(); };
  if (DESKTOP_QUERY.addEventListener) DESKTOP_QUERY.addEventListener('change', onLayoutChange);
  else DESKTOP_QUERY.addListener(onLayoutChange);
  document.addEventListener('pointerdown', primeAudio, { passive: true });

  // Garde le clavier ouvert quand on touche « ± » ou un joueur dans les dialogues.
  document.addEventListener('mousedown', (event) => {
    if (event.target.closest('[data-keep-focus]')) event.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      requestWakeLock(); // le verrou est relâché automatiquement quand la page est masquée
    }
  });

  $('#setup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    startGame();
  });
  $('#custom-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitCustomValue();
  });
  $('#quick-form').addEventListener('submit', (event) => {
    event.preventDefault();
    saveQuickDialog();
  });

  // Un toucher sur le fond grisé ferme le dialogue.
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('cancel');
    });
  });

  initOrderDrag();
}

function init() {
  dom.screenGame = $('#screen-game');
  dom.clock = $('#game-clock');
  dom.turnTimer = $('#turn-timer');
  dom.timerFill = $('#turn-timer-fill');
  dom.timerText = $('#turn-timer-text');

  // Libellés des raccourcis adaptés au Mac (⌘ au lieu de Ctrl).
  $$('.js-undo-key').forEach((el) => { el.textContent = IS_MAC ? '⌘Z' : 'Ctrl+Z'; });
  $$('.js-mod').forEach((el) => { el.textContent = IS_MAC ? '⌘' : 'Ctrl'; });

  bindEvents();
  // Une partie en cours est reprise automatiquement après fermeture ou rechargement.
  showScreen(state.game ? 'game' : 'setup');
}

init();
