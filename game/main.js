'use strict';
/* Emberfall Duel — an original turn-based card duel.
   Player vs the Warden of Cinders. First to 0 life loses.
   No network requests; all art is CSS/SVG and canvas drawn here. */

var MAX_LIFE = 30;
var MAX_HAND = 5;
var DECK_SIZE = 24;

/* ---------- deterministic RNG (mulberry32) ---------- */
function makeRng(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

/* ---------- card definitions (invented for this game) ---------- */
/* type: strike = damage, guard = shield, drain = damage + heal, spark = draw 2 */
var DECK_DEF = [
  { name: 'Cinder Slash',   suit: 'ember', type: 'strike', cost: 1, value: 3 },
  { name: 'Ember Fang',     suit: 'ember', type: 'strike', cost: 2, value: 5 },
  { name: 'Flame Lash',     suit: 'ember', type: 'strike', cost: 2, value: 4 },
  { name: 'Inferno Burst',  suit: 'ember', type: 'strike', cost: 3, value: 6 },
  { name: 'Ember Jolt',     suit: 'ember', type: 'strike', cost: 2, value: 4 },
  { name: 'Icicle Shard',   suit: 'frost', type: 'strike', cost: 1, value: 3 },
  { name: 'Glacier Spike',  suit: 'frost', type: 'strike', cost: 2, value: 5 },
  { name: 'Blizzard Edge',  suit: 'frost', type: 'strike', cost: 3, value: 7 },
  { name: 'Bramble Whip',   suit: 'thorn', type: 'strike', cost: 2, value: 4 },
  { name: 'Thorn Volley',   suit: 'thorn', type: 'strike', cost: 3, value: 6 },
  { name: 'Root Piercer',   suit: 'thorn', type: 'strike', cost: 1, value: 3 },
  { name: 'Ashen Ward',     suit: 'ember', type: 'guard',  cost: 1, value: 4 },
  { name: 'Ember Aegis',    suit: 'ember', type: 'guard',  cost: 2, value: 6 },
  { name: 'Frost Barrier',  suit: 'frost', type: 'guard',  cost: 2, value: 5 },
  { name: 'Thornwall',      suit: 'thorn', type: 'guard',  cost: 1, value: 3 },
  { name: 'Stonebark Guard',suit: 'thorn', type: 'guard',  cost: 2, value: 4 },
  { name: 'Mist Veil',      suit: 'frost', type: 'guard',  cost: 2, value: 5 },
  { name: 'Soul Siphon',    suit: 'ember', type: 'drain',  cost: 2, value: 4 },
  { name: 'Crimson Leech',  suit: 'ember', type: 'drain',  cost: 3, value: 5 },
  { name: 'Frostbite Drain',suit: 'frost', type: 'drain',  cost: 2, value: 4 },
  { name: 'Thorn Feast',    suit: 'thorn', type: 'drain',  cost: 3, value: 6 },
  { name: 'Kindle',         suit: 'ember', type: 'spark',  cost: 1, value: 2 },
  { name: 'Frost Spark',    suit: 'frost', type: 'spark',  cost: 1, value: 2 },
  { name: 'Wildfire Spark', suit: 'ember', type: 'spark',  cost: 1, value: 2 }
];
var SUIT_COLOR = { ember: '#e2543e', frost: '#4a90d9', thorn: '#5da85a' };
var SUIT_GEM = { ember: 'M26 2 L46 26 L26 50 L6 26 Z', frost: 'M26 2 L46 26 L26 50 L6 26 Z', thorn: 'M26 2 L46 26 L26 50 L6 26 Z' };

function buildDeck(rng) {
  var deck = DECK_DEF.map(function (d, i) {
    return { id: i, name: d.name, suit: d.suit, type: d.type, cost: d.cost, value: d.value };
  });
  return shuffle(deck, rng);
}

/* ---------- sound: short synthesized WebAudio bleeps ---------- */
var audioCtx = null;
var muted = false;
function beep(freq, dur, kind) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = kind || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio unavailable: play silently */ }
}
function sfx(name) {
  if (name === 'play') beep(520, 0.12, 'triangle');
  else if (name === 'hit') beep(180, 0.18, 'sawtooth');
  else if (name === 'guard') beep(340, 0.12, 'sine');
  else if (name === 'draw') beep(700, 0.08, 'sine');
  else if (name === 'win') { beep(523, 0.15, 'triangle'); setTimeout(function () { beep(659, 0.15, 'triangle'); }, 140); setTimeout(function () { beep(784, 0.3, 'triangle'); }, 280); }
  else if (name === 'lose') { beep(392, 0.2, 'sawtooth'); setTimeout(function () { beep(262, 0.4, 'sawtooth'); }, 200); }
}

/* ---------- game state ---------- */
var G = null; /* the live game */
var SHOT = null;

function newSide(deck) {
  return { life: MAX_LIFE, shield: 0, energy: 0, maxEnergy: 0, deck: deck, hand: [], discard: [], turns: 0 };
}
function newGame(seed) {
  var rng = makeRng(seed);
  var g = {
    seed: seed, rng: rng, phase: 'play', turn: 1, aiThinking: false,
    player: newSide(buildDeck(makeRng(seed + 11))),
    ai: newSide(buildDeck(makeRng(seed + 77))),
    log: []
  };
  drawCards(g.player, 5, g);
  drawCards(g.ai, 5, g);
  startTurn(g.player, g);
  return g;
}
function drawCards(side, n, g) {
  for (var i = 0; i < n; i++) {
    if (side.hand.length >= MAX_HAND) break;
    if (side.deck.length === 0) {
      if (side.discard.length === 0) break;
      side.deck = shuffle(side.discard, g ? g.rng : makeRng(1));
      side.discard = [];
    }
    side.hand.push(side.deck.pop());
  }
}
function startTurn(side, g) {
  side.turns += 1;
  side.maxEnergy = Math.min(10, side.turns);
  side.energy = side.maxEnergy;
  if (side.turns > 1) drawCards(side, 1, g);
}
function dealDamage(target, amount) {
  var absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  target.life = Math.max(0, target.life - (amount - absorbed));
  return { absorbed: absorbed, dealt: amount - absorbed };
}
function cardText(card) {
  if (card.type === 'strike') return 'Deal ' + card.value + ' damage';
  if (card.type === 'guard') return 'Gain ' + card.value + ' shield';
  if (card.type === 'drain') return 'Deal ' + card.value + ' damage, heal ' + card.value;
  return 'Draw ' + card.value + ' cards';
}
function pushLog(html) {
  G.log.unshift(html);
  if (G.log.length > 6) G.log.length = 6;
}
function playCard(side, foe, card, whoName) {
  if (side.energy < card.cost) return false;
  side.energy -= card.cost;
  side.hand.splice(side.hand.indexOf(card), 1);
  side.discard.push(card);
  if (card.type === 'strike') {
    var r = dealDamage(foe, card.value);
    pushLog('<b>' + whoName + '</b> played <b>' + card.name + '</b> — ' + card.value + ' damage' +
      (r.absorbed ? ' (' + r.absorbed + ' absorbed by shield)' : ''));
    sfx('hit');
  } else if (card.type === 'guard') {
    side.shield += card.value;
    pushLog('<b>' + whoName + '</b> played <b>' + card.name + '</b> — +' + card.value + ' shield');
    sfx('guard');
  } else if (card.type === 'drain') {
    var d = dealDamage(foe, card.value);
    side.life = Math.min(MAX_LIFE, side.life + card.value);
    pushLog('<b>' + whoName + '</b> played <b>' + card.name + '</b> — ' + card.value + ' damage, healed ' + card.value +
      (d.absorbed ? ' (' + d.absorbed + ' absorbed)' : ''));
    sfx('hit');
  } else {
    drawCards(side, card.value, G);
    pushLog('<b>' + whoName + '</b> played <b>' + card.name + '</b> — drew ' + card.value + ' cards');
    sfx('draw');
  }
  return true;
}
function checkEnd() {
  if (G.ai.life <= 0) { endGame(true); return true; }
  if (G.player.life <= 0) { endGame(false); return true; }
  return false;
}
function endGame(won) {
  G.phase = won ? 'win' : 'loss';
  G.aiThinking = false;
  pushLog(won ? '<b>You defeated the Warden!</b>' : '<b>The Warden defeated you.</b>');
  sfx(won ? 'win' : 'lose');
  render();
}
function playerPlayCard(index) {
  if (!G || G.phase !== 'play' || G.aiThinking) return;
  var card = G.player.hand[index];
  if (!card) return;
  if (G.player.energy < card.cost) {
    pushLog('Not enough energy for <b>' + card.name + '</b>.');
    render();
    return;
  }
  playCard(G.player, G.ai, card, 'You');
  if (!checkEnd()) render();
}
function endPlayerTurn() {
  if (!G || G.phase !== 'play' || G.aiThinking) return;
  G.aiThinking = true;
  render();
  setTimeout(aiTurn, 650);
}
function aiTurn() {
  if (!G || G.phase !== 'play') { if (G) G.aiThinking = false; return; }
  startTurn(G.ai, G);
  pushLog('<b>Warden</b> begins turn ' + G.ai.turns + ' (' + G.ai.energy + ' energy).');
  var guardFirst = G.ai.life <= 12;
  var strikeFirst = G.player.life <= 10;
  var order = G.ai.hand.slice();
  order.sort(function (a, b) {
    var score = function (c) {
      var s = c.type === 'strike' ? 3 : c.type === 'drain' ? 2.5 : c.type === 'guard' ? 2 : 1;
      if (strikeFirst && c.type === 'strike') s += 2;
      if (guardFirst && c.type === 'guard') s += 2;
      if (c.type === 'spark' && G.ai.hand.length <= 2) s += 1;
      return s;
    };
    return score(b) - score(a);
  });
  for (var i = 0; i < order.length; i++) {
    var card = order[i];
    if (G.ai.hand.indexOf(card) === -1) continue;
    if (G.ai.energy >= card.cost) {
      playCard(G.ai, G.player, card, 'Warden');
      if (checkEnd()) return;
    }
  }
  pushLog('<b>Warden</b> ends its turn.');
  G.aiThinking = false;
  G.turn += 1;
  startTurn(G.player, G);
  pushLog('Your turn ' + G.player.turns + ' — ' + G.player.energy + ' energy.');
  render();
}

/* ---------- deterministic screenshot states ---------- */
function presetShot(shot) {
  var g = newGame(20261123);
  if (shot === 'start') {
    g.phase = 'title';
  } else if (shot === 'play') {
    g.turn = 5;
    g.player.turns = 5; g.player.maxEnergy = 5; g.player.energy = 5;
    g.player.life = 22; g.player.shield = 4;
    g.player.deck = g.player.deck.slice(0, 14);
    g.player.hand = [
      { id: 100, name: 'Inferno Burst', suit: 'ember', type: 'strike', cost: 3, value: 6 },
      { id: 101, name: 'Frost Barrier', suit: 'frost', type: 'guard', cost: 2, value: 5 },
      { id: 102, name: 'Soul Siphon', suit: 'ember', type: 'drain', cost: 2, value: 4 },
      { id: 103, name: 'Thorn Volley', suit: 'thorn', type: 'strike', cost: 3, value: 6 },
      { id: 104, name: 'Kindle', suit: 'ember', type: 'spark', cost: 1, value: 2 }
    ];
    g.ai.turns = 4; g.ai.maxEnergy = 4; g.ai.energy = 0;
    g.ai.life = 18; g.ai.shield = 2;
    g.ai.deck = g.ai.deck.slice(0, 15);
    g.ai.hand = g.ai.hand.slice(0, 4);
    g.log = [
      '<b>Warden</b> played <b>Glacier Spike</b> — 5 damage (2 absorbed by shield)',
      '<b>You</b> played <b>Ember Fang</b> — 5 damage',
      '<b>Warden</b> played <b>Ashen Ward</b> — +4 shield',
      '<b>You</b> played <b>Cinder Slash</b> — 3 damage',
      'Your turn 5 — 5 energy.'
    ];
  } else if (shot === 'win') {
    g.phase = 'win';
    g.turn = 8;
    g.player.turns = 8; g.player.maxEnergy = 8; g.player.energy = 3;
    g.player.life = 14; g.player.shield = 3;
    g.ai.life = 0; g.ai.shield = 0;
    g.log = ['<b>You</b> played <b>Inferno Burst</b> — 6 damage', '<b>You defeated the Warden!</b>'];
  } else if (shot === 'loss') {
    g.phase = 'loss';
    g.turn = 7;
    g.player.turns = 7; g.player.maxEnergy = 7; g.player.energy = 1;
    g.player.life = 0; g.player.shield = 0;
    g.ai.life = 9; g.ai.shield = 5;
    g.log = ['<b>Warden</b> played <b>Blizzard Edge</b> — 7 damage', '<b>The Warden defeated you.</b>'];
  }
  return g;
}

/* ---------- rendering ---------- */
function el(id) { return document.getElementById(id); }
function gemSvg(suit) {
  var c = SUIT_COLOR[suit];
  return '<svg class="gem" viewBox="0 0 52 52"><path d="' + SUIT_GEM[suit] + '" fill="' + c + '" stroke="#ffe9b0" stroke-width="1.5"/><path d="M26 10 L34 26 L26 42 L18 26 Z" fill="rgba(255,255,255,0.35)"/></svg>';
}
function cardEl(card, index, playable) {
  var d = document.createElement('div');
  d.className = 'card suit-' + card.suit + (playable ? '' : ' unaffordable');
  d.innerHTML = '<div class="cost">' + card.cost + '</div>' + gemSvg(card.suit) +
    '<div class="cname">' + card.name + '</div>' +
    '<div class="ctype">' + card.suit + ' · ' + card.type + '</div>' +
    '<div class="cvalue">' + card.value + '</div>' +
    '<div class="cdesc">' + cardText(card) + '</div>' +
    '<div class="key">' + (index + 1) + '</div>';
  d.addEventListener('click', function () { playerPlayCard(index); });
  return d;
}
function renderSide(prefix, side, isPlayer) {
  el(prefix + 'Life').textContent = side.life;
  var bar = el(prefix + 'LifeBar');
  bar.style.width = Math.max(0, side.life / MAX_LIFE * 100) + '%';
  bar.className = 'barFill life' + (side.life <= 10 ? ' low' : '');
  var shieldEl = el(prefix + 'Shield');
  shieldEl.textContent = 'Shield ' + side.shield;
  shieldEl.className = side.shield > 0 ? 'shieldOn' : '';
  el(prefix + 'Energy').textContent = 'Energy ' + side.energy + '/' + side.maxEnergy;
  el(prefix + 'Deck').textContent = 'Deck ' + side.deck.length;
}
function render() {
  if (!G) return;
  el('turnLabel').textContent = 'Turn ' + G.turn;
  el('phaseLabel').textContent = G.phase === 'play'
    ? (G.aiThinking ? 'Warden thinking…' : 'Your turn')
    : G.phase === 'title' ? 'Title' : (G.phase === 'win' ? 'Victory!' : 'Defeat');
  renderSide('ai', G.ai, false);
  renderSide('pl', G.player, true);

  var aiHand = el('aiHand');
  aiHand.innerHTML = '';
  if (G.ai.hand.length === 0) {
    var e = document.createElement('span'); e.className = 'emptyHand'; e.textContent = 'No cards in hand';
    aiHand.appendChild(e);
  } else {
    for (var i = 0; i < G.ai.hand.length; i++) {
      var back = document.createElement('div');
      back.className = 'cardBack'; back.textContent = '◆';
      aiHand.appendChild(back);
    }
  }

  var plHand = el('plHand');
  plHand.innerHTML = '';
  if (G.player.hand.length === 0) {
    var e2 = document.createElement('span'); e2.className = 'emptyHand'; e2.textContent = 'No cards in hand';
    plHand.appendChild(e2);
  } else {
    for (var j = 0; j < G.player.hand.length; j++) {
      var card = G.player.hand[j];
      plHand.appendChild(cardEl(card, j, G.player.energy >= card.cost && G.phase === 'play' && !G.aiThinking));
    }
  }

  var log = el('log');
  log.innerHTML = '';
  for (var k = 0; k < G.log.length; k++) {
    var li = document.createElement('li');
    li.innerHTML = G.log[k];
    log.appendChild(li);
  }

  el('endTurnBtn').disabled = G.phase !== 'play' || G.aiThinking;
  el('muteBtn').textContent = muted ? 'Sound: Off' : 'Sound: On';

  var overlay = el('overlay');
  var title = el('overlayTitle');
  var text = el('overlayText');
  var stats = el('overlayStats');
  var btn = el('overlayBtn');
  if (G.phase === 'title') {
    overlay.classList.remove('hidden');
    title.innerHTML = 'EMBERFALL <span class="red">DUEL</span>';
    text.textContent = 'A turn-based card duel against the Warden of Cinders. ' +
      'Each side starts with 30 life. Play cards with energy, which grows by 1 each turn up to 10. ' +
      'Strikes deal damage, Guards raise a shield, Drains hurt the Warden and heal you, Sparks draw cards. ' +
      'Shield absorbs damage first. Reduce the Warden to 0 life to win.';
    stats.innerHTML = '<div class="rules"><b>Controls:</b> click a card or press 1–5 to play it · ' +
      'Space ends your turn · R restarts · M mutes.<br><b>Deck:</b> 24 cards · hand of up to 5 · draw 1 each turn.</div>';
    btn.textContent = 'Play';
  } else if (G.phase === 'win' || G.phase === 'loss') {
    overlay.classList.remove('hidden');
    var won = G.phase === 'win';
    title.innerHTML = won ? 'VICTORY' : 'DEFEAT';
    text.textContent = won
      ? 'The Warden of Cinders crumbles to ash. The ember table is yours — the duel is won.'
      : 'The Warden of Cinders stands over the ashes of your deck. The duel is lost — but embers always return.';
    stats.innerHTML = 'Your life: <b>' + G.player.life + '</b> &nbsp;·&nbsp; Warden life: <b>' + G.ai.life +
      '</b> &nbsp;·&nbsp; Turns played: <b>' + G.turn + '</b>';
    btn.textContent = 'Play Again';
  } else {
    overlay.classList.add('hidden');
  }
}

/* ---------- ember background (static, seeded — identical every render) ---------- */
function drawEmbers() {
  var cv = el('embers');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  var rng = makeRng(4242);
  for (var i = 0; i < 90; i++) {
    var x = rng() * cv.width, y = rng() * cv.height;
    var r = 1 + rng() * 2.5;
    var a = 0.08 + rng() * 0.25;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,140,60,' + a + ')' : 'rgba(255,210,120,' + a + ')';
    ctx.fill();
  }
}

/* ---------- wiring ---------- */
function startFresh() {
  G = newGame((Date.now() % 100000) + 7);
  G.phase = 'play';
  pushLog('The duel begins — your turn 1, 1 energy.');
  render();
}
function init() {
  drawEmbers();
  var params = new URLSearchParams(window.location.search);
  SHOT = params.get('shot');
  if (SHOT === 'start' || SHOT === 'play' || SHOT === 'win' || SHOT === 'loss') {
    G = presetShot(SHOT);
  } else {
    G = newGame((Date.now() % 100000) + 7);
    G.phase = 'title';
    pushLog('Welcome to Emberfall Duel.');
  }
  render();
  el('overlayBtn').addEventListener('click', function () { sfx('play'); startFresh(); });
  el('endTurnBtn').addEventListener('click', endPlayerTurn);
  el('restartBtn').addEventListener('click', function () { startFresh(); });
  el('muteBtn').addEventListener('click', function () { muted = !muted; render(); });
  document.addEventListener('keydown', function (ev) {
    if (!G) return;
    if (ev.key >= '1' && ev.key <= '5') playerPlayCard(parseInt(ev.key, 10) - 1);
    else if (ev.code === 'Space') { ev.preventDefault(); endPlayerTurn(); }
    else if (ev.key === 'r' || ev.key === 'R') startFresh();
    else if (ev.key === 'm' || ev.key === 'M') { muted = !muted; render(); }
  });
  window.addEventListener('resize', drawEmbers);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
