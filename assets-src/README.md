# Source artwork

Originals that are **not** shipped. `public/` is copied verbatim into the
build, so anything left there is downloaded by every visitor whether the app
references it or not — these two GIFs alone were 3.5MB.

The versions the app actually loads live in `public/` as animated WebP,
regenerated from these with:

```bash
node scripts/dekey-animation.mjs "assets-src/robot-reading.source.gif" public/robot-reading.webp 288 15
node scripts/dekey-animation.mjs "assets-src/robot-thinking.source.gif" public/robot-thinking.webp 144 15
```

That script also flood-fills the baked-in white backdrop to transparent, which
a plain colour key cannot do here — the artwork contains white of its own
(the book pages), so keying every white pixel puts holes in the drawing.
