// Pure planning logic. No DOM, no storage.
//
// cartoon:  { id, type: 'series' | 'movie', title, image, minutes, chunk }
//           minutes = one episode (series) or the full runtime (movie)
//           chunk   = size of one movie piece in minutes (movies only)
// plan:     [{ id, minutes }]  one entry per episode; one entry per movie
// settings: { budget, over, minPiece }   over = how far past the budget is still OK,
//                                        minPiece = shortest movie piece when filling from wishes

export const pieceMinutes = (c) => (c.type === 'movie' ? c.chunk : c.minutes);
export const total = (plan) => plan.reduce((sum, item) => sum + item.minutes, 0);
export const limit = (settings) => settings.budget + settings.over;

export function canAdd(cartoon, plan, settings) {
  const piece = pieceMinutes(cartoon);
  if (total(plan) + piece > limit(settings)) return false;
  if (cartoon.type === 'movie') {
    const current = plan.find((item) => item.id === cartoon.id);
    if (current && current.minutes + piece > cartoon.minutes) return false;
  }
  return true;
}

// Adds one episode, or one more piece of a movie.
export function add(cartoon, plan) {
  if (cartoon.type === 'movie' && plan.some((item) => item.id === cartoon.id)) {
    return plan.map((item) =>
      item.id === cartoon.id ? { ...item, minutes: item.minutes + cartoon.chunk } : item);
  }
  return [...plan, { id: cartoon.id, minutes: pieceMinutes(cartoon) }];
}

// Removes the episode at index, or takes one piece off a movie.
export function removeAt(plan, index, cartoon) {
  const item = plan[index];
  if (!item) return plan;
  if (cartoon && cartoon.type === 'movie' && item.minutes > cartoon.chunk) {
    return plan.map((it, i) => (i === index ? { ...it, minutes: it.minutes - cartoon.chunk } : it));
  }
  return plan.filter((_, i) => i !== index);
}

// Chooses which wished cartoons get in. A wish needs room for one episode, or for the
// shortest allowed piece of a movie (settings.minPiece); a wish that cannot get that much
// is left out rather than squeezed in. Picked one at a time, preferring the cartoon that
//   1. makes the most kids happy who have nothing in the plan yet,
//   2. is wished by the most kids,
//   3. is higher on their lists,
//   4. is shorter.
function choose(lists, lookup, max, minPiece) {
  const need = (id) => {
    const c = lookup(id);
    return c.type === 'movie' ? Math.min(minPiece, c.minutes) : c.minutes;
  };
  const fans = (id) => lists.flatMap((list, kid) => (list.includes(id) ? [kid] : []));
  const rank = (id) => Math.min(...lists.map((list) => list.indexOf(id)).filter((i) => i >= 0));

  const chosen = [];
  const happy = new Set();
  let rest = [...new Set(lists.flat())];
  let reserved = 0;
  for (;;) {
    const fits = rest.filter((id) => reserved + need(id) <= max);
    if (!fits.length) break;
    const score = (id) => [
      fans(id).filter((kid) => !happy.has(kid)).length, fans(id).length, -rank(id), -need(id)];
    const [pick] = fits.sort((a, b) => {
      const x = score(a);
      const y = score(b);
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || y[3] - x[3];
    });
    chosen.push(pick);
    reserved += need(pick);
    fans(pick).forEach((kid) => happy.add(kid));
    rest = rest.filter((id) => id !== pick);
  }
  return { chosen: chosen.map(lookup), left: rest.map(lookup) };
}

// Builds a plan from everybody's wishes.
// wishes: one list of cartoon ids per kid, favourite first.  lookup: id -> cartoon.
// - series get whole episodes; the movies share the remaining time evenly, in 5-minute steps
// - with no movies and every wish in, extra episodes are added while they bring the
//   total closer to the budget
// Returns { plan, left } where left = wished cartoons that did not fit.
export function arrange(wishes, lookup, settings) {
  const max = limit(settings);
  const lists = wishes.map((list) => list.filter((id) => lookup(id)));
  const minPiece = settings.minPiece || 10;
  const { chosen, left } = choose(lists, lookup, max, minPiece);

  const series = chosen.filter((c) => c.type === 'series');
  const movies = chosen.filter((c) => c.type === 'movie');
  const episodes = new Map(series.map((s) => [s.id, 1]));
  let used = series.reduce((sum, s) => sum + s.minutes, 0);

  const movieMinutes = new Map();
  if (movies.length) {
    const room = Math.max(settings.budget - used, 0);
    let per = Math.max(minPiece, Math.round(room / movies.length / 5) * 5);
    while (per > minPiece && used + per * movies.length > max) per = Math.max(minPiece, per - 5);
    for (const m of movies) movieMinutes.set(m.id, Math.min(per, m.minutes));
  }

  // Extra episodes only when every wish got in; otherwise they would take the place of a wish.
  if (!movies.length && !left.length) {
    for (;;) {
      const gap = Math.abs(settings.budget - used);
      const options = series
        .filter((s) => used + s.minutes <= max && Math.abs(settings.budget - used - s.minutes) < gap)
        .sort((a, b) =>
          episodes.get(a.id) * a.minutes - episodes.get(b.id) * b.minutes || a.minutes - b.minutes);
      if (!options.length) break;
      episodes.set(options[0].id, episodes.get(options[0].id) + 1);
      used += options[0].minutes;
    }
  }

  const plan = [];
  for (const c of chosen) {
    for (let i = 0; i < (episodes.get(c.id) || 0); i++) plan.push({ id: c.id, minutes: c.minutes });
    if (movieMinutes.has(c.id)) plan.push({ id: c.id, minutes: movieMinutes.get(c.id) });
  }
  return { plan, left };
}
