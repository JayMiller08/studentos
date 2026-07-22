/**
 * Generates PWA PNG icons from public/favicon.svg.
 * Run: npm run generate:icons
 */
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'public', 'favicon.svg')
const outDir = path.join(root, 'public', 'icons')

await mkdir(outDir, { recursive: true })
const svg = await readFile(source)

// Standard icons: the rounded-rect artwork fills the canvas.
for (const size of [192, 512]) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}

// Maskable icon: artwork inside the 80% safe zone on a brand background.
const maskableSize = 512
const inner = Math.round(maskableSize * 0.7)
const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
await sharp({
  create: {
    width: maskableSize,
    height: maskableSize,
    channels: 4,
    background: { r: 37, g: 99, b: 235, alpha: 1 }, // #2563eb
  },
})
  .composite([{ input: art, gravity: 'center' }])
  .png()
  .toFile(path.join(outDir, `icon-maskable-${maskableSize}.png`))
console.log(`✓ icon-maskable-${maskableSize}.png`)
