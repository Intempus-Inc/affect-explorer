import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { mediaPath, quadrant, selectClips, validateDataset } from '../src/data.js';

function clip(overrides = {}) {
  return { id: 'example', valence: 0.25, arousal: 0.75, ...overrides };
}

function dataset(clips = [clip()], overrides = {}) {
  return {
    format_version: 1,
    title: 'Synthetic examples',
    description: 'Invented coordinates for testing.',
    synthetic: true,
    clips,
    ...overrides,
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('accepts coordinate endpoints and midpoint without rescaling', () => {
  for (const valence of [0, 0.5, 1]) {
    for (const arousal of [0, 0.5, 1]) {
      const result = validateDataset(dataset([clip({ valence, arousal })]));
      assert.equal(result.clips[0].valence, valence);
      assert.equal(result.clips[0].arousal, arousal);
    }
  }
});

test('rejects missing, nonnumeric, nonfinite and out-of-range coordinates', () => {
  const invalid = [undefined, null, true, false, '0.5', '', [], {}, NaN, Infinity, -Infinity, -0.001, 1.001];
  for (const field of ['valence', 'arousal']) {
    for (const value of invalid) {
      assert.throws(
        () => validateDataset(dataset([clip({ [field]: value })])),
        /number between 0 and 1/,
        `${field}: ${String(value)}`,
      );
    }
  }
  const overflowingJson = JSON.parse('{"id":"overflow","valence":1e309,"arousal":0.5}');
  assert.throws(() => validateDataset(dataset([overflowingJson])), /number between 0 and 1/);
});

test('accepts an empty dataset and enforces the collection size boundary', () => {
  assert.deepEqual(validateDataset(dataset([])).clips, []);
  const clips = Array.from({ length: 10000 }, (_, index) => clip({ id: `clip-${index}` }));
  assert.equal(validateDataset(dataset(clips)).clips.length, 10000);
  assert.throws(() => validateDataset(dataset([...clips, clip({ id: 'one-too-many' })])), /at most 10000/);
  for (const clips of [null, {}, 'clips']) {
    assert.throws(() => validateDataset(dataset(clips)), /clips must be an array/);
  }
});

test('normalizes optional fields into new objects without mutating input', () => {
  const input = freezeDeep(dataset([clip({ id: '  sample-1  ', label: '  First example  ' })], {
    title: '  Synthetic examples  ', description: '  Invented values.  ',
  }));
  const before = JSON.stringify(input);
  const result = validateDataset(input);
  assert.equal(result.title, 'Synthetic examples');
  assert.equal(result.description, 'Invented values.');
  assert.deepEqual(result.clips[0], {
    id: 'sample-1', label: 'First example', type: 'other', valence: 0.25,
    arousal: 0.75, thumbnail: null, video: null,
  });
  assert.notStrictEqual(result, input);
  assert.notStrictEqual(result.clips, input.clips);
  assert.notStrictEqual(result.clips[0], input.clips[0]);
  result.clips[0].label = 'Changed result';
  assert.equal(JSON.stringify(input), before);
  assert.equal(validateDataset(dataset()).clips[0].label, 'example');
});

test('requires the supported version, metadata types and nonempty text', () => {
  for (const input of [null, [], true, 'dataset']) {
    assert.throws(() => validateDataset(input), /Dataset must be an object/);
  }
  for (const format_version of [undefined, '1', true, 0, 2]) {
    assert.throws(() => validateDataset(dataset([], { format_version })), /format_version 1/);
  }
  for (const synthetic of [undefined, null, 'true', 0, 1]) {
    assert.throws(() => validateDataset(dataset([], { synthetic })), /synthetic must be true or false/);
  }
  assert.equal(validateDataset(dataset([], { synthetic: false })).synthetic, false);
  for (const field of ['title', 'description']) {
    for (const value of [undefined, null, '', '  ', 5]) {
      assert.throws(() => validateDataset(dataset([], { [field]: value })), /must contain/);
    }
  }
  assert.throws(() => validateDataset(dataset([], { title: 'x'.repeat(121) })), /Title must contain/);
  assert.throws(() => validateDataset(dataset([], { description: 'x'.repeat(1001) })), /Description must contain/);
  assert.throws(() => validateDataset(dataset([clip({ label: ' ' })])), /label must contain/);
});

test('rejects unknown fields at both levels, including JSON prototype keys', () => {
  assert.throws(() => validateDataset(dataset([], { unknown: 'field' })), /unsupported field: unknown/);
  assert.throws(() => validateDataset(dataset([clip({ unknown: 'field' })])), /unsupported field: unknown/);
  const ownPrototypeKey = JSON.parse('{"__proto__":{"unexpected":true}}');
  assert.throws(() => validateDataset({ ...dataset(), ...ownPrototypeKey }), /unsupported field: __proto__/);
  assert.throws(() => validateDataset(dataset([{ ...clip(), ...ownPrototypeKey }])), /unsupported field: __proto__/);
});

test('requires unique valid IDs and supported content types', () => {
  for (const record of [null, [], true, 'clip']) {
    assert.throws(() => validateDataset(dataset([record])), /must be an object/);
  }
  for (const id of [undefined, null, '', ' ', '_private', '../clip', 'with space', 'clip/path', 'a'.repeat(81)]) {
    assert.throws(() => validateDataset(dataset([clip({ id })])));
  }
  assert.throws(() => validateDataset(dataset([clip(), clip()])), /unique/);
  assert.throws(() => validateDataset(dataset([clip(), clip({ id: ' example ' })])), /unique/);
  const distinct = ['A', 'a', 'clip-2', 'clip_3', 'clip.4'].map(id => clip({ id }));
  assert.equal(validateDataset(dataset(distinct)).clips.length, distinct.length);
  for (const type of ['face', 'scene', 'audio', 'other']) {
    assert.equal(validateDataset(dataset([clip({ type })])).clips[0].type, type);
  }
  for (const type of ['video', '', 1, true, []]) {
    assert.throws(() => validateDataset(dataset([clip({ type })])), /type must be/);
  }
});

test('accepts only the documented image and video extensions under relative directories', () => {
  assert.equal(mediaPath(undefined, 'thumbnail'), null);
  assert.equal(mediaPath(undefined, 'video'), null);
  for (const extension of ['png', 'jpg', 'jpeg', 'webp', 'svg']) {
    const path = `media/nested/example-1.${extension}`;
    assert.equal(mediaPath(path, 'thumbnail'), path);
  }
  for (const extension of ['mp4', 'webm', 'MP4', 'WEBM']) {
    const path = `media/example_1.${extension}`;
    assert.equal(mediaPath(path, 'video'), path);
  }
  const result = validateDataset(dataset([clip({ thumbnail: 'media/a.png', video: 'media/a.webm' })]));
  assert.equal(result.clips[0].thumbnail, 'media/a.png');
  assert.equal(result.clips[0].video, 'media/a.webm');
  assert.throws(() => mediaPath('media/a.mp4', 'thumbnail'));
  assert.throws(() => mediaPath('media/a.svg', 'video'));
});

test('rejects traversal, remote, encoded, script and ambiguous media paths', () => {
  const invalid = [
    '', null, 42, {}, '../clip.mp4', 'media/../clip.mp4', 'media/./clip.mp4',
    './media/clip.mp4', '/media/clip.mp4', '//example.test/clip.mp4',
    'https://example.test/clip.mp4', 'http://example.test/clip.mp4',
    'file:///media/clip.mp4', 'javascript:alert(1)', 'data:video/mp4;base64,AA==',
    'media\\clip.mp4', 'C:\\media\\clip.mp4', 'media//clip.mp4',
    'media/%2e%2e/clip.mp4', 'media/%252e%252e/clip.mp4', 'media/clip%2emp4',
    'media/clip.mp4?url=https://example.test', 'media/clip.mp4#fragment',
    'media/clip.mp4\n', 'media/clip.mp4\u0000', 'media/.hidden/clip.mp4',
    'media/clip.js', 'media/clip.html', 'media/clip.exe', 'media/clip.mp4.html',
    `media/${'a'.repeat(240)}.mp4`,
  ];
  for (const path of invalid) {
    assert.throws(() => mediaPath(path, 'video'), undefined, String(path));
  }
  for (const path of ['https://example.test/a.svg', 'media/%2e%2e/a.svg', 'media/a.html', 'javascript:a.svg']) {
    assert.throws(() => validateDataset(dataset([clip({ thumbnail: path })])));
  }
});

test('assigns midpoint values to the high quadrant on each axis', () => {
  assert.equal(quadrant({ valence: 0, arousal: 0 }), 'low valence, low arousal');
  assert.equal(quadrant({ valence: 0.5, arousal: 0.49 }), 'high valence, low arousal');
  assert.equal(quadrant({ valence: 0.49, arousal: 0.5 }), 'low valence, high arousal');
  assert.equal(quadrant({ valence: 0.5, arousal: 0.5 }), 'high valence, high arousal');
  assert.equal(quadrant({ valence: 1, arousal: 1 }), 'high valence, high arousal');
});

test('searches IDs and labels without mutation and sorts numeric ties by ID', () => {
  const clips = freezeDeep([
    clip({ id: 'zebra', label: 'Quiet shape', valence: 0.8, arousal: 0.2 }),
    clip({ id: 'alpha', label: 'Bright shape', valence: 0.8, arousal: 0.6 }),
    clip({ id: 'beta', label: 'Quiet form', valence: 0.2, arousal: 0.6 }),
  ]);
  const before = JSON.stringify(clips);
  assert.deepEqual(selectClips(clips).map(c => c.id), ['alpha', 'beta', 'zebra']);
  assert.deepEqual(selectClips(clips, ' QUIET ').map(c => c.id), ['beta', 'zebra']);
  assert.deepEqual(selectClips(clips, 'ALP').map(c => c.id), ['alpha']);
  assert.deepEqual(selectClips(clips, 'missing'), []);
  assert.deepEqual(selectClips([], ''), []);
  assert.deepEqual(selectClips(clips, '', 'valence').map(c => c.id), ['alpha', 'zebra', 'beta']);
  assert.deepEqual(selectClips(clips, '', 'arousal').map(c => c.id), ['alpha', 'beta', 'zebra']);
  assert.deepEqual(selectClips([...clips].reverse(), '', 'arousal').map(c => c.id), ['alpha', 'beta', 'zebra']);
  assert.equal(JSON.stringify(clips), before);
  assert.notStrictEqual(selectClips(clips), clips);
});

test('sorting is deterministic across host locales', () => {
  const moduleUrl = new URL('../src/data.js', import.meta.url).href;
  const code = `
    import { selectClips } from ${JSON.stringify(moduleUrl)};
    const clips = ['I','i','J','j'].map(id => ({ id, label: id, valence: 0.5, arousal: 0.5 }));
    console.log(JSON.stringify(['id','valence','arousal'].map(order => selectClips(clips, '', order).map(c => c.id))));
  `;
  const outputs = ['en_US.UTF-8', 'tr_TR.UTF-8'].map(language => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', env: { ...process.env, LANG: language, LC_ALL: language },
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  });
  assert.deepEqual(outputs[0], outputs[1]);
});
