'use strict';

/* ================= Définition des jeux et des thèmes ================= */

const GAMES = {
  loto: {
    name: 'Loto', max: 90,
    stages: [
      { name: 'Quine', clip: 'quine', desc: 'une ligne complète' },
      { name: 'Double quine', clip: 'double-quine', desc: 'deux lignes complètes' },
      { name: 'Carton plein', clip: 'carton-plein', desc: 'les trois lignes' },
    ],
  },
  bingo: {
    name: 'Bingo', max: 75, letters: 'BINGO',
    stages: [
      { name: 'Ligne', clip: 'ligne', desc: 'ligne, colonne ou diagonale' },
      { name: 'Bingo', clip: 'bingo', desc: 'grille complète' },
    ],
  },
};

const THEMES = {
  noel: { title: 'Loto de Noël', decor: ['❄', '❅', '❆', '✦'], color: '#0b3d2a' },
  nouvelan: { title: 'Loto du Nouvel An', decor: ['✨', '🎉', '⭐', '✦'], color: '#1a1440' },
  paques: { title: 'Loto de Pâques', decor: ['🌸', '🥚', '🌼', '🐣'], color: '#bfe6c8' },
  halloween: { title: "Loto d'Halloween", decor: ['🦇', '🎃', '🕷', '👻'], color: '#2a1240' },
  neutre: { title: 'Loto', decor: [], color: '#1d3557' },
};

/* ================= État (sauvegardé dans le navigateur) ================= */

const load = (key, def) => {
  try { return Object.assign(def, JSON.parse(localStorage.getItem(key)) || {}); } catch (e) { return def; }
};
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* stockage indisponible */ } };

const settings = load('loto.settings', {
  theme: 'noel', title: '', voice: true, digits: true, sfx: true, decor: true, interval: 8,
  lots: { loto: ['', '', ''], bingo: ['', ''] },
});
const state = load('loto.state', { game: 'loto', drawn: [], stage: 0 });
const gift = load('loto.gift', { names: [], winners: [] });

let busy = false;        // un tirage est en cours
let auto = false;        // tirage automatique actif
let autoTimer = null;

const $ = (id) => document.getElementById(id);
const game = () => GAMES[state.game];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const letterOf = (n) => (game().letters ? game().letters[Math.floor((n - 1) / 15)] : '');

/** Entier aléatoire non biaisé dans [0, n[ (générateur cryptographique du navigateur). */
function randomInt(n) {
  if (!window.crypto || !crypto.getRandomValues) return Math.floor(Math.random() * n);
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

/* ================= Sons ================= */

const voiceEl = new Audio();
let voiceToken = 0;

/** Joue une suite de fichiers audio l'un après l'autre. */
async function say(clips) {
  if (!settings.voice) return;
  const token = ++voiceToken;
  for (const clip of clips) {
    if (token !== voiceToken) return;
    await new Promise((resolve) => {
      const done = () => { clearTimeout(guard); voiceEl.onended = voiceEl.onerror = null; resolve(); };
      const guard = setTimeout(done, 6000);
      voiceEl.onended = voiceEl.onerror = done;
      voiceEl.src = 'audio/' + clip + '.mp3';
      const p = voiceEl.play();
      if (p && p.catch) p.catch(done);
    });
  }
}

function numberClips(n) {
  const clips = [];
  if (game().letters) clips.push('l/' + letterOf(n));
  clips.push('n/' + n);
  if (settings.digits && n >= 10) clips.push('d/' + n);
  return clips;
}

let ctx = null;
function audioCtx() {
  if (!settings.sfx) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, start, dur, type = 'sine', vol = 0.2) {
  const c = audioCtx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  rattle() { // boules qui s'entrechoquent
    const c = audioCtx(); if (!c) return;
    for (let i = 0; i < 14; i++) tone(500 + randomInt(900), i * 0.075 + Math.random() * 0.03, 0.05, 'triangle', 0.12);
  },
  chime() { tone(1318, 0, 0.9, 'sine', 0.22); tone(1760, 0.09, 1.1, 'sine', 0.16); tone(2637, 0.09, 0.7, 'sine', 0.06); },
  tick() { tone(900, 0, 0.05, 'square', 0.07); },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.13, i === 6 ? 0.9 : 0.16, 'triangle', 0.22));
    [262, 330, 392].forEach((f) => tone(f, 0.78, 0.9, 'sawtooth', 0.05));
  },
  undo() { tone(440, 0, 0.12, 'sine', 0.15); tone(330, 0.1, 0.18, 'sine', 0.15); },
};

/* ================= Décor et confettis ================= */

function applyTheme() {
  const theme = THEMES[settings.theme] || THEMES.noel;
  document.documentElement.dataset.theme = settings.theme;
  document.querySelector('meta[name=theme-color]').content = theme.color;
  const title = settings.title.trim() || (state.game === 'bingo' ? theme.title.replace('Loto', 'Bingo') : theme.title);
  document.querySelectorAll('[data-title]').forEach((el) => { el.textContent = title; });
  document.title = title;

  const decor = $('decor');
  decor.textContent = '';
  if (!settings.decor) return;
  for (let i = 0; i < (theme.decor.length ? 22 : 0); i++) {
    const s = document.createElement('span');
    s.textContent = theme.decor[i % theme.decor.length];
    s.style.left = (Math.random() * 100) + 'vw';
    s.style.fontSize = (1.5 + Math.random() * 3) + 'vmin';
    s.style.animationDuration = (9 + Math.random() * 12) + 's';
    s.style.animationDelay = (-Math.random() * 20) + 's';
    decor.appendChild(s);
  }
}

function confetti(ms = 4000) {
  const cv = $('confetti'), c = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ['#f2c14e', '#e63946', '#2ec4b6', '#ffffff', '#7a5cc4', '#ff9f1c'];
  const parts = Array.from({ length: 140 }, () => ({
    x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.6, r: 5 + Math.random() * 9,
    vx: -2 + Math.random() * 4, vy: 3 + Math.random() * 5, a: Math.random() * 6, col: colors[randomInt(colors.length)],
  }));
  const end = performance.now() + ms;
  (function frame(now) {
    c.clearRect(0, 0, cv.width, cv.height);
    if (now > end) return;
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.a += 0.15;
      if (p.y > cv.height) p.y = -20;
      c.fillStyle = p.col;
      c.fillRect(p.x, p.y, p.r, p.r * (0.4 + Math.abs(Math.sin(p.a)) * 0.6));
    }
    requestAnimationFrame(frame);
  })(performance.now());
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
}

/* ================= Écrans et fenêtres ================= */

const overlays = [];   // pile des fenêtres ouvertes
const currentScope = () => (overlays.length ? overlays[overlays.length - 1] : ($('game').hidden ? $('home') : $('game')));

function focusFirst(preferred) {
  const el = preferred || currentScope().querySelector('button:not([disabled]):not([hidden])');
  if (el) el.focus();
}
function openOverlay(id, focusEl) {
  const el = $(id);
  if (overlays.includes(el)) return;
  stopAuto();
  el.hidden = false; overlays.push(el);
  focusFirst(focusEl);
}
function closeOverlay() {
  const el = overlays.pop();
  if (!el) return;
  el.hidden = true;
  if (el.id === 'confirm' && confirmResolve) { confirmResolve(false); confirmResolve = null; }
  if (el.id === 'gift') saveGiftNames();
  focusFirst(overlays.length ? null : ($('game').hidden ? null : $('btn-draw')));
}

let confirmResolve = null;
function confirmBox(text) {
  $('confirm-text').textContent = text;
  openOverlay('confirm', $('confirm-no'));
  return new Promise((resolve) => { confirmResolve = resolve; });
}
$('confirm-yes').onclick = () => { const r = confirmResolve; confirmResolve = null; closeOverlay(); if (r) r(true); };
$('confirm-no').onclick = () => closeOverlay();

function showScreen(name) {
  stopAuto();
  $('home').hidden = name !== 'home';
  $('game').hidden = name !== 'game';
  $('btn-resume').hidden = state.drawn.length === 0;
  if (name === 'home') $('btn-resume').textContent = `▶ Reprendre la partie de ${game().name} (${state.drawn.length} numéros sortis)`;
  applyTheme();
  focusFirst(name === 'game' ? $('btn-draw') : ($('btn-resume').hidden ? null : $('btn-resume')));
}

/* ================= Partie ================= */

function buildGrid() {
  const grid = $('grid'), g = game();
  grid.className = 'grid ' + state.game;
  grid.textContent = '';
  for (let n = 1; n <= g.max; n++) {
    if (g.letters && (n - 1) % 15 === 0) {
      const l = document.createElement('div');
      l.className = 'letter'; l.innerHTML = `<b>${letterOf(n)}</b>`;
      grid.appendChild(l);
    }
    const cell = document.createElement('div');
    cell.className = 'cell'; cell.id = 'c' + n; cell.innerHTML = `<b>${n}</b>`;
    grid.appendChild(cell);
  }
}

function showBall(n) {
  $('ball').classList.toggle('empty', !n);
  $('ball-letter').textContent = n ? letterOf(n) : '';
  $('ball-num').textContent = n || '?';
}

function render() {
  const g = game(), last = state.drawn[state.drawn.length - 1];
  const drawn = new Set(state.drawn);
  for (let n = 1; n <= g.max; n++) {
    const cell = $('c' + n);
    cell.classList.toggle('on', drawn.has(n));
    cell.classList.toggle('latest', n === last);
  }
  showBall(last);

  $('last').textContent = '';
  state.drawn.slice(-6, -1).reverse().forEach((n) => {
    const s = document.createElement('span'); s.textContent = n; $('last').appendChild(s);
  });
  $('counter').textContent = `${state.drawn.length} / ${g.max}`;

  const stages = $('stages');
  stages.textContent = '';
  g.stages.forEach((st, i) => {
    const b = document.createElement('button');
    b.className = 'btn stage' + (i === state.stage ? ' current' : i < state.stage ? ' done' : '');
    b.textContent = st.name;
    b.title = 'Passer à cette étape';
    b.onclick = () => { state.stage = i; save('loto.state', state); render(); };
    stages.appendChild(b);
  });
  const st = g.stages[state.stage], lot = settings.lots[state.game][state.stage];
  $('lot').textContent = `On joue pour : ${st.name} (${st.desc})` + (lot ? ` — 🎁 ${lot}` : '');

  $('btn-draw').disabled = state.drawn.length >= g.max;
  $('btn-undo').disabled = state.drawn.length === 0;
}

/** Fait voler le numéro de la grosse boule jusqu'à sa case dans la grille. */
function flyToCell(n) {
  const from = $('ball').querySelector('.ball-inner').getBoundingClientRect();
  const to = $('c' + n).getBoundingClientRect();
  if (!from.width || !to.width) return Promise.resolve();
  const f = document.createElement('div');
  f.className = 'fly'; f.textContent = n;
  f.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;font-size:${from.height * 0.5}px`;
  document.body.appendChild(f);
  f.getBoundingClientRect(); // force le calcul avant la transition
  const scale = Math.min(to.width, to.height) / from.width;
  const dx = to.left + (to.width - from.width * scale) / 2 - from.left;
  const dy = to.top + (to.height - from.height * scale) / 2 - from.top;
  f.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  f.style.opacity = '0.9';
  return sleep(720).then(() => f.remove());
}

async function draw() {
  const g = game();
  if (busy || overlays.length || $('game').hidden) return;
  if (state.drawn.length >= g.max) return;
  busy = true;
  clearTimeout(autoTimer);
  $('autobar').classList.remove('run');

  const drawn = new Set(state.drawn);
  const remaining = [];
  for (let n = 1; n <= g.max; n++) if (!drawn.has(n)) remaining.push(n);
  const n = remaining[randomInt(remaining.length)];

  // Brassage des boules
  const ball = $('ball');
  ball.classList.remove('pop'); ball.classList.add('shake');
  sfx.rattle();
  const shuffleEnd = Date.now() + 1100;
  while (Date.now() < shuffleEnd) { showBall(remaining[randomInt(remaining.length)]); await sleep(70); }
  ball.classList.remove('shake');

  // Révélation
  state.drawn.push(n);
  save('loto.state', state);
  showBall(n);
  void ball.offsetWidth; ball.classList.add('pop');
  sfx.chime();
  const speaking = say(numberClips(n));
  await sleep(900);
  await flyToCell(n);
  render();
  await speaking;

  busy = false;
  if (state.drawn.length >= g.max) { stopAuto(); say(['p/fin']); toast('Tous les numéros sont sortis'); return; }
  if (auto) scheduleAuto();
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  const bar = $('autobar');
  bar.classList.remove('run'); void bar.offsetWidth;
  bar.style.animationDuration = settings.interval + 's';
  bar.classList.add('run');
  autoTimer = setTimeout(draw, settings.interval * 1000);
}
function startAuto() {
  if (state.drawn.length >= game().max) return;
  auto = true;
  $('btn-auto').classList.add('on'); $('auto-label').textContent = '⏸ Pause';
  if (!busy) draw();
}
function stopAuto() {
  auto = false;
  clearTimeout(autoTimer);
  $('autobar').classList.remove('run');
  $('btn-auto').classList.remove('on'); $('auto-label').textContent = '⏵ Auto';
}

function undo() {
  if (busy || !state.drawn.length) return;
  stopAuto();
  const n = state.drawn.pop();
  save('loto.state', state);
  sfx.undo();
  render();
  toast(`Numéro ${n} annulé`);
  if (!state.drawn.length) $('btn-draw').focus();
}

async function newGame(type) {
  if (state.drawn.length && !(await confirmBox('Une partie est en cours. Effacer la grille et commencer une nouvelle partie ?'))) return;
  state.game = type; state.drawn = []; state.stage = 0;
  save('loto.state', state);
  buildGrid(); render(); showScreen('game');
  audioCtx();
  say(['p/debut']);
}

/* ================= Gagnant ================= */

function numsInto(el, nums) {
  el.textContent = '';
  nums.forEach((n) => { const s = document.createElement('span'); s.textContent = letterOf(n) + n; el.appendChild(s); });
  if (!nums.length) el.textContent = 'Aucun numéro sorti.';
}

function openWin() {
  if (busy) return;
  const st = game().stages[state.stage];
  $('win-check').hidden = false; $('win-party').hidden = true;
  $('win-stage').textContent = `${st.name} — ${st.desc}`;
  numsInto($('win-nums'), state.drawn.slice().sort((a, b) => a - b));
  openOverlay('win', $('win-ok'));
  say(['p/verif']);
}
$('win-no').onclick = () => { closeOverlay(); toast('Fausse alerte, on continue !'); };
$('win-ok').onclick = () => {
  const g = game(), st = g.stages[state.stage], lot = settings.lots[state.game][state.stage];
  const isLast = state.stage >= g.stages.length - 1;
  $('win-check').hidden = true; $('win-party').hidden = false;
  $('win-title').textContent = st.name + ' !';
  $('win-lot').textContent = lot ? `🎁 ${lot}` : 'Bravo !';
  $('win-next').textContent = isLast ? '🔄 On démarque — nouvelle partie' : `▶ On continue pour : ${g.stages[state.stage + 1].name}`;
  $('win-next').focus();
  sfx.fanfare(); confetti();
  say(['p/' + st.clip, 'p/bravo']);
};
$('win-next').onclick = () => {
  const g = game();
  if (state.stage >= g.stages.length - 1) {
    state.drawn = []; state.stage = 0;
    say(['p/demarque']);
  } else {
    state.stage++;
  }
  save('loto.state', state);
  closeOverlay(); render(); $('btn-draw').focus();
};
$('win-close').onclick = () => closeOverlay();

/* ================= Cadeau surprise ================= */

function saveGiftNames() {
  gift.names = $('gift-names').value.split('\n').map((s) => s.trim()).filter(Boolean);
  save('loto.gift', gift);
}
/** Joueurs encore en jeu : la liste moins une occurrence par gain déjà attribué. */
function giftEligible() {
  const left = gift.names.slice();
  gift.winners.forEach((w) => { const i = left.indexOf(w); if (i >= 0) left.splice(i, 1); });
  return left;
}
function renderGift() {
  const left = giftEligible();
  $('gift-info').textContent = gift.names.length
    ? `${left.length} joueur(s) en jeu sur ${gift.names.length}`
    : 'Saisissez les prénoms des joueurs dans la liste.';
  $('gift-draw').disabled = left.length === 0 || giftBusy;
  $('gift-winners').textContent = '';
  gift.winners.forEach((w) => { const s = document.createElement('span'); s.textContent = '🎁 ' + w; $('gift-winners').appendChild(s); });
}
let giftBusy = false;
$('gift-draw').onclick = async () => {
  saveGiftNames();
  const left = giftEligible();
  if (giftBusy || !left.length) { renderGift(); return; }
  giftBusy = true; renderGift();
  const box = $('gift-name');
  box.classList.remove('won');
  const winner = left[randomInt(left.length)];
  say(['p/cadeau']);
  // Défilement des prénoms qui ralentit progressivement
  for (let delay = 60; delay < 420; delay *= 1.12) {
    box.textContent = left[randomInt(left.length)];
    sfx.tick();
    await sleep(delay);
  }
  box.textContent = winner;
  box.classList.add('won');
  gift.winners.push(winner);
  save('loto.gift', gift);
  sfx.fanfare(); confetti();
  giftBusy = false; renderGift();
  if (!$('gift-draw').disabled) $('gift-draw').focus(); else focusFirst();
};
$('gift-reset').onclick = async () => {
  if (!gift.winners.length) return;
  if (!(await confirmBox('Remettre tous les joueurs en jeu pour le cadeau surprise ?'))) return;
  gift.winners = []; save('loto.gift', gift);
  $('gift-name').textContent = '?'; $('gift-name').classList.remove('won');
  renderGift();
};
$('gift-names').addEventListener('input', () => { saveGiftNames(); renderGift(); });

/* ================= Réglages ================= */

function openSettings() {
  $('set-theme').value = settings.theme;
  $('set-title').value = settings.title;
  $('set-voice').checked = settings.voice;
  $('set-digits').checked = settings.digits;
  $('set-sfx').checked = settings.sfx;
  $('set-decor').checked = settings.decor;
  $('set-interval').value = settings.interval;
  $('set-interval-val').textContent = settings.interval;
  const lots = $('set-lots');
  lots.textContent = '';
  game().stages.forEach((st, i) => {
    const label = document.createElement('label');
    label.textContent = `Lot — ${st.name}`; label.htmlFor = 'set-lot-' + i;
    const input = document.createElement('input');
    input.type = 'text'; input.id = 'set-lot-' + i; input.maxLength = 60; input.placeholder = '(facultatif)';
    input.value = settings.lots[state.game][i] || '';
    input.oninput = () => { settings.lots[state.game][i] = input.value; commitSettings(); };
    lots.append(label, input);
  });
  openOverlay('settings', $('set-theme'));
}
function commitSettings() {
  save('loto.settings', settings);
  applyTheme();
  if (!$('game').hidden) render();
}
$('set-theme').onchange = (e) => { settings.theme = e.target.value; commitSettings(); };
$('set-title').oninput = (e) => { settings.title = e.target.value; commitSettings(); };
$('set-voice').onchange = (e) => { settings.voice = e.target.checked; if (!settings.voice) voiceToken++; commitSettings(); };
$('set-digits').onchange = (e) => { settings.digits = e.target.checked; commitSettings(); };
$('set-sfx').onchange = (e) => { settings.sfx = e.target.checked; commitSettings(); };
$('set-decor').onchange = (e) => { settings.decor = e.target.checked; commitSettings(); };
$('set-interval').oninput = (e) => { settings.interval = +e.target.value; $('set-interval-val').textContent = settings.interval; commitSettings(); };
$('set-test').onclick = () => { sfx.chime(); say(numberClips(state.game === 'bingo' ? 47 : 88)); };
$('set-full').onclick = () => {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement) d.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => toast('Plein écran indisponible sur cet appareil'));
};

/* ================= Boutons ================= */

$('btn-draw').onclick = () => { if (auto) stopAuto(); draw(); };
$('btn-auto').onclick = () => (auto ? stopAuto() : startAuto());
$('btn-undo').onclick = undo;
$('btn-win').onclick = openWin;
$('btn-home').onclick = () => showScreen('home');
$('btn-resume').onclick = () => { showScreen('game'); audioCtx(); };
document.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => newGame(b.dataset.new); });
document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeOverlay; });
document.querySelectorAll('[data-open]').forEach((b) => {
  b.onclick = () => {
    const id = b.dataset.open;
    if (id === 'settings') return openSettings();
    if (id === 'history') numsInto($('history-nums'), state.drawn.slice().reverse());
    if (id === 'gift') { $('gift-names').value = gift.names.join('\n'); renderGift(); }
    openOverlay(id, id === 'gift' ? $('gift-draw') : null);
  };
});

/* ================= Clavier et télécommande ================= */

/** Navigation aux flèches (télécommande TV) : va au bouton le plus proche dans la direction donnée. */
function moveFocus(dir) {
  const els = [...currentScope().querySelectorAll('button, input, select, textarea')]
    .filter((e) => !e.disabled && e.getClientRects().length);
  const cur = document.activeElement;
  if (!els.includes(cur)) { if (els[0]) els[0].focus(); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
    const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const cross = Math.abs(dir === 'left' || dir === 'right' ? dy : dx);
    if (main < 4) continue;
    const score = main + cross * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
}

document.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  const tag = el ? el.tagName : '';
  const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && el.type === 'text');
  const arrows = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

  if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack') {
    if (overlays.length) { e.preventDefault(); closeOverlay(); }
    else if (!$('game').hidden) { e.preventDefault(); showScreen('home'); }
    return;
  }
  if (arrows[e.key]) {
    const dir = arrows[e.key], horizontal = dir === 'left' || dir === 'right';
    if (tag === 'TEXTAREA') return;                                   // flèches = curseur du texte
    if (typing && horizontal) return;
    if (tag === 'INPUT' && el.type === 'range' && horizontal) return;  // gauche/droite = réglage
    if (tag === 'SELECT' && !horizontal) return;                       // haut/bas = choix dans la liste
    e.preventDefault(); moveFocus(dir);
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (overlays.length || $('game').hidden) return;

  const key = e.key.toLowerCase();
  if (key === ' ' || (e.key === 'Enter' && tag !== 'BUTTON')) { e.preventDefault(); $('btn-draw').click(); }
  else if (key === 'a') $('btn-auto').click();
  else if (key === 'z' || e.key === 'Backspace') undo();
  else if (key === 'g') openWin();
  else if (key === 'c') document.querySelector('#game [data-open=gift]').click();
});

/* ================= Démarrage ================= */

if (!GAMES[state.game]) state.game = 'loto';
state.drawn = (state.drawn || []).filter((n, i, a) => Number.isInteger(n) && n >= 1 && n <= game().max && a.indexOf(n) === i);
state.stage = Math.min(Math.max(state.stage | 0, 0), game().stages.length - 1);
buildGrid();
render();
showScreen('home');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
}
