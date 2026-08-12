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

const PLZ_VEEDEL = {
  // Innenstadt
  '50667': 'Altstadt-Nord',      '50668': 'Neustadt-Nord',
  '50670': 'Neustadt-Nord',      '50672': 'Neustadt-Süd',
  '50674': 'Belgisches Viertel', '50676': 'Altstadt-Süd',
  '50677': 'Südstadt',           '50678': 'Südstadt',
  '50679': 'Deutz',
  // Norden
  '50733': 'Nippes',             '50735': 'Nippes',
  '50737': 'Longerich',          '50738': 'Longerich',
  '50739': 'Bilderstöckchen',    '50765': 'Chorweiler',
  '50767': 'Weidenpesch',        '50769': 'Roggendorf-Thenhoven',
  // Ehrenfeld / Weststadt
  '50823': 'Ehrenfeld',          '50825': 'Ehrenfeld',
  '50827': 'Bickendorf',         '50829': 'Ossendorf',
  '50858': 'Junkersdorf',        '50859': 'Lövenich',
  '50969': 'Rondorf',
  // Lindenthal / Sülz
  '50931': 'Braunsfeld',         '50933': 'Müngersdorf',
  '50935': 'Lindenthal',         '50937': 'Sülz',
  '50939': 'Lindenthal',
  // Süden
  '50968': 'Bayenthal',          '50971': 'Zollstock',
  '50972': 'Marienburg',         '50996': 'Rodenkirchen',
  '50997': 'Rodenkirchen',       '50999': 'Sürth',
  // Mülheim / Rechtsrheinisch Nord
  '51061': 'Mülheim',            '51063': 'Mülheim',
  '51065': 'Mülheim',            '51067': 'Holweide',
  '51069': 'Dellbrück',          '51071': 'Höhenhaus',
  '51073': 'Dünnwald',           '51075': 'Stammheim',
  // Kalk / Rechtsrheinisch Süd
  '51103': 'Kalk',               '51105': 'Kalk',
  '51107': 'Vingst',             '51109': 'Humboldt-Gremberg',
  // Porz / Rechtsrheinisch Süd
  '51143': 'Porz',               '51147': 'Porz',
  '51149': 'Porz',
}

const VEEDEL_NAMES = [...new Set(Object.values(PLZ_VEEDEL))]

const SEARCH_QUERIES = [
  // Allgemeine Kölner Suche
  'Büdchen Köln',
  'Kiosk Köln',
  'Trinkhalle Köln',
  'Späti Köln',
  'Spätverkauf Köln',
  // Per Veedel — Büdchen + Kiosk
  ...VEEDEL_NAMES.flatMap(v => [`Büdchen ${v}`, `Kiosk ${v}`]),
]

const PLACES_BASE = 'https://places.googleapis.com/v1'

async function textSearch(query, pageToken = null) {
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: 50.938, longitude: 6.960 },
        radius: 25000,
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
    'nationalPhoneNumber', 'websiteUri',
  ].join(',')

  const res = await fetch(`${PLACES_BASE}/places/${id}?fields=${fields}&languageCode=de`, {
    headers: { 'X-Goog-Api-Key': API_KEY },
  })
  return res.json()
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

  const db = await mysql.createConnection(DB)
  console.log('DB verbunden.')

  // Bereits bekannte Place-IDs laden — Details nur für neue abrufen
  const [existing] = await db.execute('SELECT google_place_id FROM buedchen WHERE google_place_id IS NOT NULL')
  const knownIds = new Set(existing.map(r => r.google_place_id))
  console.log(`${knownIds.size} Büdchen bereits in DB.`)

  // Phase 1: alle Places aus Text Search sammeln
  const seen   = new Set()
  const places = []

  for (const [qi, q] of SEARCH_QUERIES.entries()) {
    process.stdout.write(`\rQuery ${qi + 1}/${SEARCH_QUERIES.length}: ${q}`.padEnd(70))
    let token = null
    let page  = 0

    do {
      const result = await textSearch(q, token)
      if (result.error) {
        console.error(`\nAPI-Fehler bei "${q}":`, result.error.message)
        break
      }
      for (const p of result.places ?? []) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          places.push(p)
        }
      }
      token = result.nextPageToken ?? null
      page++
      if (token) await new Promise(r => setTimeout(r, 2000))
    } while (token && page < 5)
  }

  const newPlaces = places.filter(p => !knownIds.has(p.id))
  console.log(`\n\n${places.length} einzigartige Büdchen gefunden (${newPlaces.length} neu, ${places.length - newPlaces.length} bereits bekannt).`)

  if (newPlaces.length === 0) {
    console.log('Nichts Neues. Fertig.')
    await db.end()
    return
  }

  // Phase 2: Details nur für neue Places abrufen
  let imported = 0

  for (const place of newPlaces) {
    const detail = await placeDetails(place.id)
    await new Promise(r => setTimeout(r, 300))

    const name     = detail.displayName?.text ?? place.displayName?.text ?? null
    const address  = detail.formattedAddress ?? ''
    const plz      = extractPlz(address)
    const veedel   = plz ? (PLZ_VEEDEL[plz] ?? null) : null
    const lat      = detail.location?.latitude
    const lng      = detail.location?.longitude

    if (!lat || !lng) continue

    const id = `gp-${place.id}`

    const openingHours = buildOpeningHours(detail)

    await db.execute(`
      INSERT INTO buedchen
        (id, name, address, veedel, postcode, lat, lng,
         google_place_id, google_rating, google_review_count,
         opening_hours, phone, website, last_synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), address=VALUES(address),
        veedel=VALUES(veedel), postcode=VALUES(postcode),
        google_rating=VALUES(google_rating),
        google_review_count=VALUES(google_review_count),
        opening_hours=VALUES(opening_hours),
        phone=VALUES(phone), website=VALUES(website),
        last_synced_at=NOW()
    `, [
      id, name, address, veedel, plz,
      lat, lng, place.id,
      detail.rating ?? null,
      detail.userRatingCount ?? null,
      openingHours,
      detail.nationalPhoneNumber ?? null,
      detail.websiteUri ?? null,
    ])

    imported++
    process.stdout.write(`\r  ${imported}/${newPlaces.length} importiert`)
  }

  console.log(`\nFertig. ${imported} neue Büdchen in DB geschrieben.`)
  await db.end()
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
