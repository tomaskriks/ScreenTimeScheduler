// Looks up cartoons on free, key-less web sources.
//   series -> TVmaze
//   movies -> Wikipedia (title, poster) + Wikidata (runtime)

const TVMAZE = 'https://api.tvmaze.com/search/shows?q=';
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// TVmaze reports the TV slot (30, 60 ...), which includes adverts.
// Estimate the real episode length for those; leave exact values (9, 11, 24 ...) alone.
function withoutAds(runtime) {
  return runtime >= 20 && runtime % 15 === 0 ? Math.floor(runtime * 0.75) : runtime;
}

export async function searchSeries(query) {
  const rows = await getJson(TVMAZE + encodeURIComponent(query));
  return rows.slice(0, 6).map(({ show }) => {
    const slot = show.averageRuntime || show.runtime;
    return {
      id: `tv-${show.id}`,
      type: 'series',
      title: show.name,
      year: show.premiered ? show.premiered.slice(0, 4) : '',
      image: show.image ? show.image.medium : '',
      minutes: slot ? withoutAds(slot) : 10,
      lengthGuessed: !slot || withoutAds(slot) !== slot,
    };
  });
}

export async function searchMovies(query) {
  const search = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrsearch: `${query} film`, gsrlimit: '8',
    prop: 'pageimages|pageprops|description',
    piprop: 'thumbnail', pithumbsize: '400', pilicense: 'any',
    ppprop: 'wikibase_item',
  });
  const found = await getJson(`${WIKIPEDIA}?${search}`);
  const pages = Object.values((found.query && found.query.pages) || {})
    .filter((p) => p.pageprops && p.pageprops.wikibase_item)
    .sort((a, b) => a.index - b.index);
  if (!pages.length) return [];

  const lookup = new URLSearchParams({
    action: 'wbgetentities', format: 'json', origin: '*', props: 'claims',
    ids: pages.map((p) => p.pageprops.wikibase_item).join('|'),
  });
  const { entities = {} } = await getJson(`${WIKIDATA}?${lookup}`);

  const movies = [];
  for (const page of pages) {
    const qid = page.pageprops.wikibase_item;
    const claims = (entities[qid] && entities[qid].claims) || {};
    // Only films have a duration (drops franchises, character lists ...), and anything
    // under half an hour is a TV series page, which TVmaze already covers.
    const duration = (claims.P2047 || [])
      .map((c) => c.mainsnak.datavalue && Math.round(parseFloat(c.mainsnak.datavalue.value.amount)))
      .find((n) => n > 0);
    if (!duration || duration < 30) continue;
    const year = (page.description || '').match(/\b(19|20)\d{2}\b/);
    movies.push({
      id: `wd-${qid}`,
      type: 'movie',
      title: page.title.replace(/\s*\([^)]*\)$/, ''),
      year: year ? year[0] : '',
      image: page.thumbnail ? page.thumbnail.source : '',
      minutes: duration,
      chunk: 10,
    });
  }
  return movies;
}

// Both sources at once. Throws only when neither could be reached.
export async function search(query) {
  const [series, movies] = await Promise.allSettled([searchSeries(query), searchMovies(query)]);
  if (series.status === 'rejected' && movies.status === 'rejected') throw series.reason;
  const all = [
    ...(series.status === 'fulfilled' ? series.value : []),
    ...(movies.status === 'fulfilled' ? movies.value : []),
  ];
  // Both sources match loosely; keep only titles that share a word with the query.
  const wanted = query.trim().toLowerCase();
  const words = wanted.split(/\s+/).filter((w) => w.length >= 3);
  const related = all.filter((c) => words.some((w) => c.title.toLowerCase().includes(w)));
  const exact = (c) => (c.title.toLowerCase() === wanted ? 0 : 1);
  return (related.length ? related : all).sort((a, b) => exact(a) - exact(b));
}

// ---------- other pictures for a cartoon ----------

const MAX_PICTURES = 12;

// Same picture, different size or link style -> same key (the file name).
function fileKey(url) {
  if (url.startsWith('data:')) return url;   // a picture from the phone
  let path = url.split('?')[0];
  try { path = decodeURIComponent(path); } catch { /* keep as is */ }
  const parts = path.split('/');
  const name = parts.filter((p) => !/^\d+px-/.test(p)).pop() || url;
  return name.replace(/ /g, '_').toLowerCase();
}

function distinct(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    if (!url) return false;
    const key = fileKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Series: TVmaze's image gallery. Posters first (they fit the tall cards), then the rest.
async function seriesPictures(showId) {
  const images = await getJson(`https://api.tvmaze.com/shows/${showId}/images`);
  const rank = { poster: 0, background: 1, typography: 2 };
  return images
    .filter((img) => img.type in rank)
    .sort((a, b) => rank[a.type] - rank[b.type] || Number(b.main) - Number(a.main))
    .map((img) => (img.resolutions.medium || img.resolutions.original || {}).url);
}

// Commons file name -> a 400px-wide picture link.
const commonsFile = (name) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name.replace(/ /g, '_'))}?width=400`;

// Movies: only the poster. Wikipedia keeps one poster per film; the other pictures
// on a film's page are mostly photos of the voice actors, so they are left out.
// Looked up again so the poster stays on offer after another picture was chosen.
async function moviePictures(qid) {
  const lookup = new URLSearchParams({
    action: 'wbgetentities', format: 'json', origin: '*', ids: qid,
    props: 'claims|sitelinks', sitefilter: 'enwiki',
  });
  const { entities = {} } = await getJson(`${WIKIDATA}?${lookup}`);
  const entity = entities[qid] || {};
  const posters = ((entity.claims || {}).P3383 || [])   // P3383 = film poster (rare: most are not free)
    .map((c) => c.mainsnak.datavalue && c.mainsnak.datavalue.value)
    .filter((v) => typeof v === 'string')
    .map(commonsFile);

  const page = entity.sitelinks && entity.sitelinks.enwiki && entity.sitelinks.enwiki.title;
  if (!page) return posters;
  const query = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', titles: page, redirects: '1',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '400', pilicense: 'any',
  });
  const found = await getJson(`${WIKIPEDIA}?${query}`);
  const main = Object.values((found.query && found.query.pages) || {})
    .map((p) => p.thumbnail && p.thumbnail.source)
    .filter(Boolean);
  return [...main, ...posters];
}

// Up to 12 picture links for a saved cartoon, its current picture first.
export async function pictureChoices(cartoon) {
  const [kind, id] = [cartoon.id.slice(0, 2), cartoon.id.slice(3)];
  const found = kind === 'tv' ? await seriesPictures(id) : kind === 'wd' ? await moviePictures(id) : [];
  return distinct([cartoon.image, ...found]).slice(0, MAX_PICTURES);
}

// The starting list, looked up on first run.
const STARTERS = [
  { type: 'series', title: 'Blaze and the Monster Machines' },
  { type: 'series', title: 'Thomas & Friends' },
  { type: 'movie', title: 'Cars', year: '2006' },
  { type: 'movie', title: 'Cars 2' },
  { type: 'movie', title: 'Cars 3' },
  { type: 'movie', title: 'Zootopia', year: '2016' },
];

export async function fetchStarters() {
  const found = await Promise.all(STARTERS.map(async (want) => {
    const results = await (want.type === 'series' ? searchSeries : searchMovies)(want.title);
    const sameTitle = results.filter((r) => r.title.toLowerCase() === want.title.toLowerCase());
    return sameTitle.find((r) => !want.year || r.year === want.year) || sameTitle[0] || null;
  }));
  return found.filter(Boolean);
}
