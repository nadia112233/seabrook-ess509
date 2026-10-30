export const LOCATIONS = ['mall', 'beach', 'suburbs'];
export const ACTIONS = ['bins', 'refill', 'cleanup', 'drain'];
export const emptyArrangement = () => ({mall: null, beach: null, suburbs: null});

export function validArrangement(arr, complete = false) {
  if (!arr || typeof arr !== 'object') return false;
  if (LOCATIONS.some(k => !Object.hasOwn(arr, k) || (arr[k] !== null && !ACTIONS.includes(arr[k])))) return false;
  const used = LOCATIONS.map(k => arr[k]).filter(Boolean);
  return new Set(used).size === used.length && (!complete || used.length === 3);
}

export function placeAction(arr, action, location, mode = 'replace') {
  if (!validArrangement(arr) || !ACTIONS.includes(action) || !LOCATIONS.includes(location)) throw Error('Invalid allocation');
  const next = {...arr};
  const source = LOCATIONS.find(k => arr[k] === action);
  if (source === location) return next;
  const displaced = arr[location];
  if (source) next[source] = mode === 'swap' ? displaced : null;
  next[location] = action;
  if (!validArrangement(next)) throw Error('Allocation must use each action once');
  return next;
}

export function totalReduction(arr, actions) {
  if (!validArrangement(arr)) throw Error('Invalid allocation');
  return LOCATIONS.reduce((sum, loc) => sum + (arr[loc] ? actions.find(a => a.id === arr[loc]).effects[loc] : 0), 0);
}

export function cleanNotes(notes) {
  return Object.fromEntries(LOCATIONS.map(loc => [loc, {
    reason: typeof notes?.[loc]?.reason === 'string' ? notes[loc].reason.slice(0, 1500) : '',
    limitation: typeof notes?.[loc]?.limitation === 'string' ? notes[loc].limitation.slice(0, 1500) : ''
  }]));
}

export function restoreState(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { value = {}; }
  if (!value || typeof value !== 'object') value = {};
  const saved = [0, 1].map(i => {
    const plan = value.saved?.[i];
    return validArrangement(plan?.arr, true) ? {arr: {...plan.arr}, notes: cleanNotes(plan.notes)} : null;
  });
  return {
    arr: validArrangement(value.arr) ? {...value.arr} : emptyArrangement(),
    notes: cleanNotes(value.notes), saved,
    keys: value.keys === true, numbers: value.numbers === true, help: value.help === true,
    focus: LOCATIONS.includes(value.focus) ? value.focus : '',
    candidates: Array.isArray(value.candidates) && value.candidates.length === 2 && value.candidates.every(x => ACTIONS.includes(x)) && value.candidates[0] !== value.candidates[1] ? value.candidates : ['bins', 'refill'],
    location: LOCATIONS.includes(value.location) ? value.location : null
  };
}
