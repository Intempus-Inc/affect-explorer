# Affect explorer

A static viewer for clip coordinates and media, extracted from Intempus's affect research tools. Search clips, inspect their valence/arousal values, and play supplied videos. The bundled demo contains eight invented points and four generated clips, not study results.

## Run

From this directory, using Python 3:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. There is no build step or package installation. Use a current browser with ES modules, Canvas, Pointer Events and native dialog support.

Drag to pan, scroll or pinch to zoom, and select a point or a clip in the list. The list also provides keyboard access to clip details. Videos use native playback controls.

## Supply data

Replace `data.json`, or choose **Open JSON** to read a file in the browser. Files are not uploaded. Media paths resolve from the viewer's directory, so place media there before opening your JSON.

```json
{
  "format_version": 1,
  "title": "My clips",
  "description": "Describe the source and meaning of these coordinates.",
  "synthetic": false,
  "clips": [{
    "id": "clip-01",
    "label": "Example clip",
    "valence": 0.7,
    "arousal": 0.3,
    "type": "scene",
    "thumbnail": "media/clip-01.jpg",
    "video": "media/clip-01.mp4"
  }]
}
```

IDs must be unique. Coordinates must be finite numbers in `[0,1]`; the viewer does not rescale or estimate them. The optional `type` is `face`, `scene`, `audio`, or `other`. Labels and media are optional. Empty datasets are valid. Unknown fields are rejected; convert study records to this small schema before using them. Files are limited to 5 MB and 10,000 clips.

Media paths must be relative, without traversal or remote URLs. Videos support MP4/WebM; thumbnails support PNG/JPEG/WebP/SVG, subject to browser codecs. Missing media leaves the coordinates available. Only serve media you are entitled to share. Serve the viewer directory itself, not a parent directory containing private work.

Quadrant colors split each axis at `0.5`, with the midpoint included in the high half. They are display groups, not emotion diagnoses. The viewer includes no model, study dataset, demographic comparisons, taxonomy boundaries, or inference service.

## Checks and license

Run `npm test` with Node 20 or later. Tests use the built-in test runner and need no installation.

Code: [MIT](LICENSE). `data.json` and generated files in `media/`: [CC BY 4.0](LICENSE-DATA), attributed to Intempus, Inc. See [media/README.md](media/README.md) for their generation recipe. Original study media and data are not included.
