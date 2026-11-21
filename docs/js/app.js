import { add, arrange, canAdd, removeAt, total } from './planner.js';
import { fetchStarters, search } from './catalog.js';
import { AVATARS, load, save } from './store.js';

const state = load();
let activeKid = null;   // index of the kid who is choosing wishes right now
const MAX_WISHES = 3;

// Wishes are one list of cartoon ids per kid (older saves had a single id per kid).
state.wishes = state.settings.kids.map((_, i) => {
  const saved = state.wishes[i];
  return Array.isArray(saved) ? saved : saved ? [saved] : [];
});
let loading = false;
let loadFailed = false;

const $ = (id) => document.getElementById(id);
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const cartoon = (id) => state.cartoons.find((c) => c.id === id);
const whoWished = (id) => state.wishes
  .map((list, kid) => (list.includes(id) ? state.settings.kids[kid].avatar : ''))
  .join('');

function picture(c, cls = '') {
  const letter = `<span class="letter">${esc(c.title.slice(0, 1))}</span>`;
  const img = c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="pic ${cls}">${letter}${img}</span>`;
}

let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}

function commit() {
  save(state);
  render();
}

// ---------- kids screen ----------

function renderBar() {
  const { budget } = state.settings;
  const used = total(state.plan);
  const blocks = state.plan.map((item, i) => {
    const c = cartoon(item.id);
    return `<button class="block" data-i="${i}" style="flex-grow:${item.minutes}"
        aria-label="Remove ${esc(c.title)}, ${item.minutes} minutes">
      ${picture(c)}
      <span class="who">${whoWished(c.id)}</span>
      <b>${item.minutes}</b>
    </button>`;
  });
  if (used < budget) {
    blocks.push(`<div class="free" style="flex-grow:${budget - used}"><b>${budget - used}</b></div>`);
  }
  $('bar').innerHTML = blocks.join('');
  $('bar').classList.toggle('full', used >= budget);

  const right = used < budget
    ? `${budget - used} min left`
    : `⭐ Full!${used > budget ? ` (+${used - budget})` : ''}`;
  $('status').innerHTML = `<span>🕒 <b>${used}</b> / ${budget} min</span><span>${right}</span>`;
}

function renderKids() {
  $('kidsRow').innerHTML = state.settings.kids.map((kid, i) => {
    const slots = Array.from({ length: MAX_WISHES }, (_, n) => {
      const wish = cartoon(state.wishes[i][n]);
      return `<span class="slot">${wish ? picture(wish) : ''}</span>`;
    }).join('');
    return `<button class="kid k${i}${i === activeKid ? ' active' : ''}" data-kid="${i}"
        aria-pressed="${i === activeKid}">
      <span class="face">${kid.avatar}</span>
      <span class="name">${esc(kid.name)}</span>
      <span class="slots">${slots}</span>
    </button>`;
  }).join('');

  // Wishing never touches the bar; this button turns all wishes into a plan.
  const anyWish = state.wishes.some((list) => list.length);
  $('fill').hidden = !anyWish;
  $('fill').textContent = `✨ Fill the ${state.settings.budget} minutes`;
  $('hint').hidden = anyWish;
  $('hint').textContent = activeKid === null
    ? `Tap your face, then pick up to ${MAX_WISHES} favourites`
    : `${state.settings.kids[activeKid].avatar} ${state.settings.kids[activeKid].name}: pick up to ${MAX_WISHES} favourites`;
}

function renderCards() {
  if (!state.cartoons.length) {
    $('cards').innerHTML = loading
      ? '<p class="empty">Fetching cartoons…</p>'
      : `<p class="empty">${loadFailed ? 'Could not reach the internet.' : 'No cartoons yet.'}
           <button id="retry" class="pill strong">Try again</button></p>`;
    return;
  }
  $('cards').innerHTML = state.cartoons.map((c) => {
    const inPlan = state.plan.filter((item) => item.id === c.id);
    const count = c.type === 'movie'
      ? (inPlan[0] ? `${inPlan[0].minutes} min` : '')
      : (inPlan.length ? `×${inPlan.length}` : '');
    const blocked = activeKid === null && !canAdd(c, state.plan, state.settings);
    const size = c.type === 'movie' ? `🎬 ${c.chunk} min` : `📺 ${c.minutes} min`;
    return `<button class="card${blocked ? ' blocked' : ''}${count ? ' chosen' : ''}" data-id="${esc(c.id)}">
      ${picture(c)}
      <span class="who">${whoWished(c.id)}</span>
      ${count ? `<span class="count">${count}</span>` : ''}
      <span class="label"><span class="title">${esc(c.title)}</span><span class="size">${size}</span></span>
    </button>`;
  }).join('');
}

function fillFromWishes() {
  const { plan, left } = arrange(state.wishes, cartoon, state.settings);
  state.plan = plan;
  activeKid = null;
  if (left.length) toast(`No room for ${left.map((c) => c.title).join(' and ')}`);
  commit();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function tapCard(id) {
  const c = cartoon(id);
  if (!c) return;
  if (activeKid !== null) {
    // Choosing wishes: tap to wish, tap again to take the wish back.
    const mine = state.wishes[activeKid];
    if (mine.includes(id)) {
      state.wishes[activeKid] = mine.filter((wish) => wish !== id);
    } else if (mine.length < MAX_WISHES) {
      mine.push(id);
    } else {
      toast(`${MAX_WISHES} wishes each. Tap one of yours to swap it`);
      return;
    }
  } else if (canAdd(c, state.plan, state.settings)) {
    state.plan = add(c, state.plan);
  } else {
    toast('No room for that one');
    $('bar').classList.remove('shake');
    void $('bar').offsetWidth;
    $('bar').classList.add('shake');
    return;
  }
  commit();
}

$('cards').addEventListener('click', (e) => {
  if (e.target.closest('#retry')) return void seed();
  const card = e.target.closest('.card');
  if (card) tapCard(card.dataset.id);
});

$('bar').addEventListener('click', (e) => {
  const block = e.target.closest('.block');
  if (!block) return;
  const index = Number(block.dataset.i);
  state.plan = removeAt(state.plan, index, cartoon(state.plan[index].id));
  commit();
});

$('kidsRow').addEventListener('click', (e) => {
  const kid = e.target.closest('.kid');
  if (!kid) return;
  const index = Number(kid.dataset.kid);
  activeKid = activeKid === index ? null : index;
  render();
});

function clearPlan() {
  state.plan = [];
  state.wishes = state.wishes.map(() => []);
  activeKid = null;
}

$('fill').addEventListener('click', fillFromWishes);

$('reset').addEventListener('click', () => {
  clearPlan();
  commit();
});

// The gear opens only on a long press, so kids don't wander into settings.
let gearTimer;
let gearOpened = false;
$('gear').addEventListener('pointerdown', () => {
  gearOpened = false;
  gearTimer = setTimeout(() => { gearOpened = true; showParents(true); }, 700);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
  $('gear').addEventListener(type, () => clearTimeout(gearTimer));
}
$('gear').addEventListener('click', () => { if (!gearOpened) toast('Hold the gear to open parent settings'); });
$('gear').addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- parent screen ----------

let results = [];

function showParents(show) {
  $('kids').hidden = show;
  $('parents').hidden = !show;
  activeKid = null;
  window.scrollTo(0, 0);
  render();
}

function row(c, controls) {
  const kind = c.type === 'movie' ? `Movie · ${c.minutes} min` : 'Series';
  return `<div class="row">
    ${picture(c, 'thumb')}
    <div class="about"><b>${esc(c.title)}</b><small>${kind}${c.year ? ` · ${esc(c.year)}` : ''}</small></div>
    ${controls}
  </div>`;
}

function renderResults() {
  $('results').innerHTML = results.map((c, i) => {
    const length = c.type === 'movie' ? '' : `<small class="len">${c.lengthGuessed ? '≈' : ''}${c.minutes} min</small>`;
    const have = Boolean(cartoon(c.id));
    return row(c, `${length}<button class="pill strong" data-add="${i}" ${have ? 'disabled' : ''}>${have ? 'Added' : 'Add'}</button>`);
  }).join('');
}

function renderList() {
  $('list').innerHTML = state.cartoons.map((c) => {
    const field = c.type === 'movie' ? 'chunk' : 'minutes';
    const label = c.type === 'movie' ? 'piece' : 'episode';
    return row(c, `<label class="num">${label} min
        <input type="number" inputmode="numeric" min="1" max="240" value="${c[field]}"
          data-id="${esc(c.id)}" data-field="${field}"></label>
      <button class="round small" data-remove="${esc(c.id)}" aria-label="Remove ${esc(c.title)}">✕</button>`);
  }).join('') || '<p class="empty">Nothing here yet. Search above to add one.</p>';
}

function renderSettings() {
  const s = state.settings;
  $('settings').innerHTML = `
    <label class="setting">Cartoon time
      <span><input type="number" inputmode="numeric" min="5" max="240" value="${s.budget}" data-setting="budget"> min</span></label>
    <label class="setting">May go over by
      <span><input type="number" inputmode="numeric" min="0" max="60" value="${s.over}" data-setting="over"> min</span></label>
    <label class="setting">Shortest movie piece
      <span><input type="number" inputmode="numeric" min="5" max="120" value="${s.minPiece}" data-setting="minPiece"> min</span></label>
    ${s.kids.map((kid, i) => `<div class="setting">
      <button class="round" data-avatar="${i}" aria-label="Change picture">${kid.avatar}</button>
      <input type="text" maxlength="14" value="${esc(kid.name)}" data-kidname="${i}" aria-label="Name">
    </div>`).join('')}`;
}

$('back').addEventListener('click', () => showParents(false));

$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = $('q').value.trim();
  if (!query) return;
  $('results').innerHTML = '<p class="empty">Searching…</p>';
  try {
    results = await search(query);
    renderResults();
    if (!results.length) $('results').innerHTML = '<p class="empty">Nothing found. Try another spelling.</p>';
  } catch {
    $('results').innerHTML = '<p class="empty">Could not reach the internet.</p>';
  }
});

$('results').addEventListener('click', (e) => {
  const button = e.target.closest('[data-add]');
  if (!button) return;
  const { year, lengthGuessed, ...found } = results[Number(button.dataset.add)];
  if (!cartoon(found.id)) state.cartoons.push({ ...found, year });
  commit();
  toast(`${found.title} added`);
});

$('list').addEventListener('click', (e) => {
  const button = e.target.closest('[data-remove]');
  if (!button) return;
  const id = button.dataset.remove;
  if (!confirm(`Remove ${cartoon(id).title}?`)) return;
  state.cartoons = state.cartoons.filter((c) => c.id !== id);
  state.plan = state.plan.filter((item) => item.id !== id);
  state.wishes = state.wishes.map((list) => list.filter((wish) => wish !== id));
  commit();
});

$('list').addEventListener('change', (e) => {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const c = cartoon(input.dataset.id);
  const value = Math.round(Number(input.value));
  if (value >= 1) {
    c[input.dataset.field] = value;
    clearPlan();   // lengths changed, so the old plan no longer adds up
  }
  save(state);   // no re-render: it would steal focus from the next field
});

$('settings').addEventListener('change', (e) => {
  const { setting, kidname } = e.target.dataset;
  if (setting) {
    const value = Math.round(Number(e.target.value));
    if (value >= Number(e.target.min)) state.settings[setting] = value;
    clearPlan();
  }
  if (kidname !== undefined) state.settings.kids[kidname].name = e.target.value.trim() || `Kid ${Number(kidname) + 1}`;
  save(state);
});

$('settings').addEventListener('click', (e) => {
  const button = e.target.closest('[data-avatar]');
  if (!button) return;
  const kid = state.settings.kids[button.dataset.avatar];
  const taken = state.settings.kids.map((k) => k.avatar);
  let next = AVATARS.indexOf(kid.avatar);
  do { next = (next + 1) % AVATARS.length; } while (taken.includes(AVATARS[next]));
  kid.avatar = AVATARS[next];
  commit();
});

// ---------- start ----------

function render() {
  // Drop anything that points at a cartoon that no longer exists.
  state.plan = state.plan.filter((item) => cartoon(item.id));
  if ($('parents').hidden) {
    renderBar();
    renderKids();
    renderCards();
  } else {
    renderResults();
    renderList();
    renderSettings();
  }
}

async function seed() {
  loading = true;
  loadFailed = false;
  render();
  try {
    const starters = await fetchStarters();
    for (const { lengthGuessed, ...c } of starters) if (!cartoon(c.id)) state.cartoons.push(c);
    state.seeded = true;
  } catch {
    loadFailed = true;
  }
  loading = false;
  commit();
}

render();
if (!state.seeded) seed();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
