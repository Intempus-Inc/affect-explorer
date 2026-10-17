import { validateDataset, selectClips } from './data.js';
import { CoordinatePlot, clipColor } from './plot.js';

const element = id => document.getElementById(id);
const dialog = element('detail');
const video = element('video');
const thumbnail = element('thumbnail');
const plot = new CoordinatePlot(element('plot'), openClip, element('hover'));
const PAGE_SIZE = 40;
let dataset = null;
let filtered = [];
let page = 0;
let requestVersion = 0;

async function readDataset(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('Use a JSON file smaller than 5 MB.');
  return JSON.parse(await file.text());
}

function showError(message) {
  element('error').textContent = message;
  element('error').hidden = !message;
}

function install(value) {
  const next = validateDataset(value);
  closeClip();
  dataset = next;
  page = 0;
  element('search').value = '';
  element('dataset-title').textContent = dataset.title;
  element('description').textContent = dataset.description;
  element('dataset-note').textContent = dataset.synthetic ? 'Synthetic demo' : 'User-supplied data';
  element('source-kind').textContent = dataset.synthetic ? 'Synthetic example. These coordinates are invented, not human ratings.' : 'User-supplied coordinates. The explorer does not estimate affect.';
  showError('');
  update(true);
  plot.reset();
}

function update(clearImages = false) {
  if (!dataset) return;
  filtered = selectClips(dataset.clips, element('search').value, element('order').value);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.max(0, Math.min(page, pages - 1));
  const color = element('color').value;
  plot.update(filtered, color, element('display').value, clearImages);
  element('count').textContent = `${filtered.length} of ${dataset.clips.length} clips`;
  element('empty').hidden = filtered.length > 0;
  element('empty').textContent = dataset.clips.length ? 'No clips match your search.' : 'This dataset has no clips.';
  const buttons = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(clip => {
    const button = document.createElement('button');
    button.className = 'clip';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = clipColor(clip, color);
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = clip.label;
    button.append(swatch, label);
    button.title = clip.id;
    button.addEventListener('click', () => openClip(clip));
    return button;
  });
  element('clips').replaceChildren(...buttons);
  element('previous').disabled = page === 0;
  element('next').disabled = page + 1 >= pages;
  element('page').textContent = `${page + 1} / ${pages}`;
}

function clearMedia() {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  thumbnail.removeAttribute('src');
  thumbnail.hidden = true;
}

function closeClip() {
  if (dialog.open) dialog.close();
  clearMedia();
}

function openClip(clip) {
  clearMedia();
  element('clip-title').textContent = clip.label;
  element('clip-id').textContent = clip.id;
  element('valence').textContent = clip.valence.toFixed(3);
  element('arousal').textContent = clip.arousal.toFixed(3);
  element('type').textContent = clip.type;
  element('clip-source').textContent = dataset.synthetic ? 'Synthetic demo coordinates; no study results are shown.' : dataset.description;
  element('media-status').textContent = clip.video ? '' : 'No video supplied.';
  if (clip.video) { video.src = clip.video; video.hidden = false; }
  else if (clip.thumbnail) { thumbnail.src = clip.thumbnail; thumbnail.alt = clip.label; thumbnail.hidden = false; }
  if (!dialog.open) dialog.showModal();
}

video.addEventListener('error', () => {
  if (!video.getAttribute('src') || !video.error) return;
  video.hidden = true;
  element('media-status').textContent = 'Video unavailable. Check its path and browser format support.';
});
thumbnail.addEventListener('error', () => {
  if (!thumbnail.getAttribute('src') || !thumbnail.complete || thumbnail.naturalWidth) return;
  thumbnail.hidden = true;
  element('media-status').textContent = 'Preview unavailable.';
});
dialog.addEventListener('close', () => { if (!dialog.open) clearMedia(); });
element('close').addEventListener('click', closeClip);
element('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const version = ++requestVersion;
  try {
    const value = await readDataset(file);
    if (version === requestVersion) install(value);
  } catch (error) {
    if (version === requestVersion) {
      if (!dataset) element('dataset-title').textContent = 'Dataset unavailable';
      showError(error.message);
    }
  }
  event.target.value = '';
});
for (const id of ['search', 'order', 'color', 'display']) {
  element(id).addEventListener(id === 'search' ? 'input' : 'change', () => { page = 0; update(); });
}
element('previous').addEventListener('click', () => { page--; update(); });
element('next').addEventListener('click', () => { page++; update(); });
element('zoom-in').addEventListener('click', () => plot.zoom(1.2));
element('zoom-out').addEventListener('click', () => plot.zoom(1 / 1.2));
element('reset').addEventListener('click', () => plot.reset());

const version = ++requestVersion;
fetch('data.json', { credentials: 'omit', cache: 'no-store' })
  .then(response => { if (!response.ok) throw new Error(`Could not load data.json (HTTP ${response.status}).`); return response.blob(); })
  .then(readDataset)
  .then(value => { if (version === requestVersion) install(value); })
  .catch(error => {
    if (version !== requestVersion) return;
    element('dataset-title').textContent = 'Dataset unavailable';
    showError(`${error.message} Open a valid JSON file to continue.`);
  });
