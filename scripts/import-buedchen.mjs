/**
 * Büdchen Import-Script
 * Läuft einmalig lokal und bei manuellem Refresh.
 * Benötigt GOOGLE_PLACES_API_KEY, DB_* in .env
 *
 * Ausführen: node scripts/import-buedchen.mjs
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY
const DB = {
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     +(process.env.DB_PORT   || 3306),
  database: process.env.DB_NAME     || 'buedchen',
  user:     process.env.DB_USER     || 'buedchen',
  password: process.env.DB_PASS     || '',
}

const PHOTO_DIR = new URL('../frontend/public/photos/', import.meta.url).pathname

const PLZ_VEEDEL = {
  '50667': 'Altstadt-Nord',     '50668': 'Neustadt-Nord',
  '50670': 'Neustadt-Nord',     '50672': 'Neustadt-Süd',
  '50674': 'Belgisches Viertel','50676': 'Altstadt-Süd',
  '50677': 'Südstadt',          '50678': 'Südstadt',
  '50679': 'Deutz',             '50733': 'Nippes',
  '50735': 'Nippes',            '50737': 'Longerich',
  '50739': 'Bilderstöckchen',   '50823': 'Ehrenfeld',
  '50825': 'Ehrenfeld',         '50827': 'Bickendorf',
  '50829': 'Ossendorf',         '50937': 'Sülz',
  '50939': 'Lindenthal',        '50968': 'Bayenthal',
  '50969': 'Rondorf',           '50971': 'Zollstock',
  '50972': 'Marienburg',        '50996': 'Rodenkirchen',
  '51061': 'Mülheim',           '51063': 'Mülheim',
  '51065': 'Mülheim',           '51067': 'Holweide',
  '51069': 'Dellbrück',         '51103': 'Kalk',
  '51105': 'Kalk',              '51107': 'Vingst',
  '51143': 'Porz',              '51147': 'Porz',
  '51149': 'Porz',
}

const SEARCH_QUERIES = [
  'Büdchen Köln',
  'Kiosk Köln',
  'Trinkhalle Köln',
]

const PLACES_BASE = 'https://places.googleapis.com/v1'

async function textSearch(query, pageToken = null) {
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: 50.938, longitude: 6.960 },
        radius: 20000,
      }
    },
    maxResultCount: 20,
    languageCode: 'de',
  }
  if (pageToken) body.pageToken = pageToken

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,nextPageToken',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function placeDetails(id) {
  const fields = [
    'id', 'displayName', 'formattedAddress', 'location',
    'rating', 'userRatingCount', 'currentOpeningHours',
    'nationalPhoneNumber', 'websiteUri', 'photos',
  ].join(',')

  const res = await fetch(`${PLACES_BASE}/places/${id}?fields=${fields}&languageCode=de`, {
    headers: { 'X-Goog-Api-Key': API_KEY },
  })
  return res.json()
}

async function downloadPhoto(photoName, destPath) {
  const url = `${PLACES_BASE}/${photoName}/media?maxHeightPx=800&key=${API_KEY}`
  const res  = await fetch(url)
  if (!res.ok) return null

  const fs   = await import('fs/promises')
  const buf  = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(destPath, buf)
  return destPath
}

function extractPlz(address) {
  const m = address?.match(/\b5\d{4}\b/)
  return m ? m[0] : null
}

function buildOpeningHours(place) {
  if (!place.currentOpeningHours?.weekdayDescriptions) return null
  const hours = {}
  const days  = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  for (const [i, desc] of (place.currentOpeningHours.weekdayDescriptions ?? []).entries()) {
    const time = desc.split(': ')[1] ?? 'Geschlossen'
    hours[days[i] ?? i] = time
  }
  return JSON.stringify(hours)
}

async function run() {
  if (!API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY fehlt in .env')
    process.exit(1)
  }

  const { mkdirSync } = await import('fs')
  try { mkdirSync(PHOTO_DIR, { recursive: true }) } catch (_) {}

  const db = await mysql.createConnection(DB)
  console.log('DB verbunden.')

  // Alle Places sammeln
  const seen   = new Set()
  const places = []

  for (const q of SEARCH_QUERIES) {
    console.log(`Suche: ${q}`)
    let token = null
    let page  = 0

    do {
      const result = await textSearch(q, token)
      for (const p of result.places ?? []) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          places.push(p)
        }
      }
      token = result.nextPageToken ?? null
      page++
      if (token) await new Promise(r => setTimeout(r, 2000)) // rate limit
    } while (token && page < 3)
  }

  console.log(`${places.length} einzigartige Büdchen gefunden.`)

  let imported = 0

  for (const place of places) {
    const detail = await placeDetails(place.id)
    await new Promise(r => setTimeout(r, 300))

    const name     = detail.displayName?.text ?? place.displayName?.text
    const address  = detail.formattedAddress ?? ''
    const plz      = extractPlz(address)
    const veedel   = plz ? PLZ_VEEDEL[plz] : null
    const lat      = detail.location?.latitude
    const lng      = detail.location?.longitude

    if (!lat || !lng) continue

    const id = `gp-${place.id}`

    // Foto herunterladen
    let photoPath = null
    if (detail.photos?.length > 0) {
      const dest = `${PHOTO_DIR}${id}.jpg`
      photoPath  = await downloadPhoto(detail.photos[0].name, dest)
        .then(() => `/photos/${id}.jpg`)
        .catch(() => null)
    }

    const openingHours = buildOpeningHours(detail)

    await db.execute(`
      INSERT INTO buedchen
        (id, name, address, veedel, postcode, lat, lng,
         google_place_id, google_rating, google_review_count,
         opening_hours, phone, website, photo_path, last_synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), address=VALUES(address),
        veedel=VALUES(veedel), postcode=VALUES(postcode),
        google_rating=VALUES(google_rating),
        google_review_count=VALUES(google_review_count),
        opening_hours=VALUES(opening_hours),
        phone=VALUES(phone), website=VALUES(website),
        photo_path=COALESCE(VALUES(photo_path), photo_path),
        last_synced_at=NOW()
    `, [
      id, name, address, veedel, plz,
      lat, lng, place.id,
      detail.rating ?? null,
      detail.userRatingCount ?? null,
      openingHours,
      detail.nationalPhoneNumber ?? null,
      detail.websiteUri ?? null,
      photoPath,
    ])

    imported++
    process.stdout.write(`\r  ${imported}/${places.length} importiert`)
  }

  console.log(`\nFertig. ${imported} Büdchen in DB geschrieben.`)
  await db.end()
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
