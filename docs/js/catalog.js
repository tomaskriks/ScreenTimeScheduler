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
