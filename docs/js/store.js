// Everything the app remembers lives in localStorage on this device.

const KEY = 'cartoon-time-v1';

export const AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐰', '🐯', '🐶', '🐱', '🦄', '🐵', '🐧', '🐙'];

function defaults() {
  return {
    settings: {
      budget: 40,
      over: 5,
      minPiece: 10,
      kids: [
        { name: 'Kid 1', avatar: '🦊' },
        { name: 'Kid 2', avatar: '🐼' },
        { name: 'Kid 3', avatar: '🦁' },
      ],
    },
    cartoons: [],
    plan: [],
    wishes: [[], [], []],   // per kid: wished cartoon ids, favourite first
    // What Fill gave each kid lately, so the kids take turns when not everything fits.
    // rounds: up to 5 earlier days, each [{ wished, got }] per kid.  last: the latest Fill.
    luck: { rounds: [], last: null },
    seeded: false,
  };
}

export function load() {
  const state = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      Object.assign(state, saved);
      state.settings = { ...defaults().settings, ...saved.settings };
    }
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
  return state;
}

// Returns false when it could not be saved (storage full or blocked):
// the app still works for this visit.
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
