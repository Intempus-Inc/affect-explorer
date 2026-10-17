# Demo media

These four clips show a colored rectangle moving across a plain background. They were generated for the viewer demo and contain no source footage, audio or personal metadata. The coordinates in `data.json` are invented independently of the visuals.

To recreate one clip with FFmpeg and libx264:

```sh
ffmpeg -f lavfi -i 'color=c=0xe8eee8:s=320x240:r=24:d=3' \
  -f lavfi -i 'color=c=0x4e8d6e:s=80x60:r=24:d=3' \
  -filter_complex "[0:v][1:v]overlay=x='(W-w)*(0.5+0.4*sin(2*PI*t/3))':y=(H-h)/2:shortest=1" \
  -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 example-1.mp4
```

Background/rectangle colors for examples 1 through 4: `e8eee8/4e8d6e`, `f0e5dc/c8772e`, `eee0df/b0473c`, `e4e8ef/5b6b8c`. Each SVG thumbnail uses the same colors and a centered rectangle.

Generated media and demo coordinates: CC BY 4.0, Intempus, Inc. The viewer source uses MIT.
