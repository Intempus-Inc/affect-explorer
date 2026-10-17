/** Validate the public coordinate format without importing study records. */
const TYPES = new Set(['face', 'scene', 'audio', 'other']);
const TOP_KEYS = new Set(['format_version', 'title', 'description', 'synthetic', 'clips']);
const CLIP_KEYS = new Set(['id', 'label', 'valence', 'arousal', 'type', 'thumbnail', 'video']);

function object(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`${label} contains an unsupported field: ${key}.`);
  }
}

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must contain 1 to ${max} characters.`);
  return value.trim();
}

function coordinate(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be a number between 0 and 1.`);
  return value;
}

export function mediaPath(value, kind) {
  if (value === undefined) return null;
  const extensions = kind === 'video' ? ['mp4', 'webm'] : ['png', 'jpg', 'jpeg', 'webp', 'svg'];
  if (typeof value !== 'string' || value.length > 240 || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value)) {
    throw new Error(`${kind} must be a relative path such as media/example.${extensions[0]}.`);
  }
  if (value.split('/').some(part => part === '.' || part === '..' || part.startsWith('.')) || !extensions.includes(value.split('.').pop().toLowerCase())) {
    throw new Error(`Unsupported ${kind} path.`);
  }
  return value;
}

export function validateDataset(value) {
  object(value, 'Dataset', TOP_KEYS);
  if (value.format_version !== 1) throw new Error('Expected format_version 1.');
  const title = text(value.title, 'Title', 120);
  const description = text(value.description, 'Description', 1000);
  if (typeof value.synthetic !== 'boolean') throw new Error('synthetic must be true or false.');
  if (!Array.isArray(value.clips) || value.clips.length > 10000) throw new Error('clips must be an array with at most 10000 entries.');
  const seen = new Set();
  const clips = value.clips.map((clip, index) => {
    const name = `Clip ${index + 1}`;
    object(clip, name, CLIP_KEYS);
    const id = text(clip.id, `${name} ID`, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(id) || seen.has(id)) throw new Error('Clip IDs must be unique and use letters, numbers, dots, hyphens or underscores.');
    seen.add(id);
    const type = clip.type ?? 'other';
    if (!TYPES.has(type)) throw new Error(`${name} type must be face, scene, audio or other.`);
    return {
      id, label: clip.label === undefined ? id : text(clip.label, `${name} label`, 160), type,
      valence: coordinate(clip.valence, `${name} valence`),
      arousal: coordinate(clip.arousal, `${name} arousal`),
      thumbnail: mediaPath(clip.thumbnail, 'thumbnail'), video: mediaPath(clip.video, 'video'),
    };
  });
  return { title, description, synthetic: value.synthetic, clips };
}

export function quadrant(clip) {
  return `${clip.valence >= 0.5 ? 'high' : 'low'} valence, ${clip.arousal >= 0.5 ? 'high' : 'low'} arousal`;
}

export function selectClips(clips, query = '', order = 'id') {
  const needle = query.trim().toLowerCase();
  const result = clips.filter(clip => `${clip.id} ${clip.label}`.toLowerCase().includes(needle));
  return result.sort((a, b) => {
    const delta = order === 'valence' || order === 'arousal' ? b[order] - a[order] : 0;
    return delta || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
