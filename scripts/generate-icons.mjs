/**
 * Generiert PWA-Icons aus dem Phosphor BeerBottle-Icon (fill).
 * Ausführen: node scripts/generate-icons.mjs
 */

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import path from 'path'

const ICONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../frontend/public/icons')

const FILL_PATH = 'M245.66,42.34l-32-32a8,8,0,0,0-11.32,11.32l1.48,1.47L148.65,64.51l-38.22,7.65a8.05,8.05,0,0,0-4.09,2.18L23,157.66a24,24,0,0,0,0,33.94L64.4,233a24,24,0,0,0,33.94,0l83.32-83.31a8,8,0,0,0,2.18-4.09l7.65-38.22,41.38-55.17,1.47,1.48a8,8,0,0,0,11.32-11.32ZM81.37,224a7.94,7.94,0,0,1-5.65-2.34L34.34,180.28a8,8,0,0,1,0-11.31L40,163.31,92.69,216,87,221.66A8,8,0,0,1,81.37,224ZM177.6,99.2a7.92,7.92,0,0,0-1.44,3.23l-7.53,37.63L160,148.69,107.31,96l8.63-8.63,37.63-7.53a7.92,7.92,0,0,0,3.23-1.44l58.45-43.84,6.19,6.19Z'

function makeSvg(size) {
  const padding = Math.round(size * 0.18)
  const iconSize = size - padding * 2
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#D81E1E"/>` +
    `<g transform="translate(${padding},${padding}) scale(${iconSize / 256})">` +
    `<path d="${FILL_PATH}" fill="#F7EFD8"/>` +
    `</g></svg>`
  )
}

for (const size of [192, 512]) {
  await sharp(makeSvg(size)).png().toFile(`${ICONS_DIR}/icon-${size}.png`)
  console.log(`✓ icon-${size}.png`)
}
console.log('Icons fertig.')
