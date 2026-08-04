import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Give a flat-background animation a transparent background.
 *
 * The source GIFs bake in an opaque white backdrop, which shows as a white
 * block on the app's dark cards. A plain colour key cannot fix it: the artwork
 * itself contains pure white (the book pages), so keying every white pixel
 * punches holes through the drawing.
 *
 * Instead this flood-fills inward from the border, so only white *connected to
 * the edge* becomes transparent and enclosed white survives. The fill runs at
 * the source resolution and scaling happens afterwards — downscaling first
 * blends backdrop into the outlines, leaving pale pixels that survive the
 * threshold as a halo.
 *
 * Frames are handled as raw RGBA so no image codec is needed here; ffmpeg
 * decodes and re-encodes either side.
 *
 * Usage: node scripts/dekey-animation.mjs <input> <output.webp> [size] [fps]
 */

const [input, output, sizeArg = '288', fpsArg = '15'] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: dekey-animation.mjs <input> <output.webp> [size] [fps]')
  process.exit(1)
}

const outSize = Number(sizeArg)
const fps = Number(fpsArg)
/** A pixel this bright on every channel counts as backdrop. */
const WHITE = 244

const native = Number(
  execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width', '-of', 'csv=p=0', input,
  ])
    .toString()
    .trim(),
)

const raw = join(tmpdir(), `dekey-${process.pid}.raw`)

try {
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', input,
    '-filter:v', `fps=${fps}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', raw, '-y',
  ])

  const buffer = readFileSync(raw)
  const frameBytes = native * native * 4
  const frames = Math.floor(buffer.length / frameBytes)

  for (let f = 0; f < frames; f += 1) {
    const base = f * frameBytes
    const seen = new Uint8Array(native * native)
    // Seed from every border pixel.
    const stack = []
    for (let x = 0; x < native; x += 1) stack.push(x, x + (native - 1) * native)
    for (let y = 0; y < native; y += 1) stack.push(y * native, native - 1 + y * native)

    while (stack.length > 0) {
      const p = stack.pop()
      if (seen[p]) continue
      const i = base + p * 4
      if (buffer[i] < WHITE || buffer[i + 1] < WHITE || buffer[i + 2] < WHITE) continue
      seen[p] = 1
      buffer[i + 3] = 0

      const x = p % native
      const y = (p - x) / native
      if (x > 0) stack.push(p - 1)
      if (x < native - 1) stack.push(p + 1)
      if (y > 0) stack.push(p - native)
      if (y < native - 1) stack.push(p + native)
    }
  }

  writeFileSync(raw, buffer)

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${native}x${native}`, '-r', String(fps),
    '-i', raw,
    '-filter:v', `scale=${outSize}:${outSize}:flags=lanczos`,
    '-vcodec', 'libwebp', '-lossless', '0', '-compression_level', '6', '-q:v', '60',
    '-loop', '0', '-an', output, '-y',
  ])

  const kb = (readFileSync(output).length / 1024).toFixed(0)
  console.log(`${output}  ${frames} frames  ${native}px → ${outSize}px  ${kb}KB`)
} finally {
  rmSync(raw, { force: true })
}
