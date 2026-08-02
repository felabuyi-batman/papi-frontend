/**
 * Turns the chroma-key green character renders in scripts/raw-character-art/ into
 * transparent PNGs in public/characters/.
 *
 * The image generator cannot reliably emit a real alpha channel (it paints a fake
 * checkerboard instead), so every character is rendered against flat #00FF00 and
 * keyed out here.
 *
 * Usage: node scripts/cut-out-character-art.mjs
 */
import { readdir, mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const RAW_ART_DIRECTORY = path.join(import.meta.dirname, 'raw-character-art')
const CUT_OUT_OUTPUT_DIRECTORY = path.join(import.meta.dirname, '..', 'public', 'characters')

// A pixel is background when green dominates both other channels by more than this.
const FULLY_BACKGROUND_GREENNESS = 90
// Below this the pixel is fully opaque character. Between the two we ramp the alpha
// so the antialiased silhouette keeps a soft edge instead of a jagged one.
const FULLY_OPAQUE_GREENNESS = 30
const LONGEST_EDGE_PIXELS = 900

async function cutOutOneCharacter(rawArtFileName) {
  const rawArtFilePath = path.join(RAW_ART_DIRECTORY, rawArtFileName)
  const { data: pixelBuffer, info } = await sharp(rawArtFilePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let pixelStart = 0; pixelStart < pixelBuffer.length; pixelStart += info.channels) {
    const red = pixelBuffer[pixelStart]
    const green = pixelBuffer[pixelStart + 1]
    const blue = pixelBuffer[pixelStart + 2]

    const strongestNonGreenChannel = Math.max(red, blue)
    const greenness = green - strongestNonGreenChannel

    if (greenness >= FULLY_BACKGROUND_GREENNESS) {
      pixelBuffer[pixelStart + 3] = 0
      continue
    }

    if (greenness > FULLY_OPAQUE_GREENNESS) {
      const rampPosition =
        (greenness - FULLY_OPAQUE_GREENNESS) /
        (FULLY_BACKGROUND_GREENNESS - FULLY_OPAQUE_GREENNESS)
      pixelBuffer[pixelStart + 3] = Math.round(255 * (1 - rampPosition))
    }

    // Suppress green spill so edge pixels do not keep a lime halo once composited
    // onto the page's own background colors.
    if (greenness > 0) {
      pixelBuffer[pixelStart + 1] = strongestNonGreenChannel
    }
  }

  // WebP rather than PNG: these are large photographic-style 3D renders, and lossy
  // WebP with alpha keeps the soft clay shading at roughly a tenth of the file size.
  const outputFileName = rawArtFileName.replace(/^key-/, '').replace(/\.png$/, '.webp')
  await sharp(pixelBuffer, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .trim({ threshold: 0 })
    .resize({
      width: LONGEST_EDGE_PIXELS,
      height: LONGEST_EDGE_PIXELS,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82, alphaQuality: 90, effort: 6 })
    .toFile(path.join(CUT_OUT_OUTPUT_DIRECTORY, outputFileName))

  return outputFileName
}

await mkdir(CUT_OUT_OUTPUT_DIRECTORY, { recursive: true })
const rawArtFileNames = (await readdir(RAW_ART_DIRECTORY)).filter((name) => name.endsWith('.png'))

for (const rawArtFileName of rawArtFileNames) {
  const outputFileName = await cutOutOneCharacter(rawArtFileName)
  console.log(`cut out ${rawArtFileName} -> public/characters/${outputFileName}`)
}
