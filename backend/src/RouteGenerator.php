<?php
declare(strict_types=1);

class RouteGenerator {

    private \PDO   $pdo;
    private string $orsKey;

    public function __construct(\PDO $pdo, string $orsKey) {
        $this->pdo    = $pdo;
        $this->orsKey = $orsKey;
    }

    public function generate(array $params): array {
        $lat      = (float) $params['start_lat'];
        $lng      = (float) $params['start_lng'];
        $radiusM  = (int)   $params['radius_m'];
        $themes   = (array) $params['themes'];
        $inclPois = !empty($params['include_pois']);

        $start = ['lat' => $lat, 'lng' => $lng];

        $candidates = $this->fetchCandidates($lat, $lng, $radiusM);
        if (empty($candidates)) {
            return ['error' => 'no_results', 'message' => 'Keine Büdchen im gewählten Radius.'];
        }

        foreach ($candidates as &$b) {
            $b['score'] = $this->score($b, $themes);
        }
        unset($b);

        $top     = $this->selectTop($candidates, $radiusM);
        $ordered = $this->nearestNeighborOrder($top, $start);

        if ($inclPois) {
            $pois    = $this->fetchPois($lat, $lng, $radiusM);
            $ordered = $this->interweavePois($ordered, $pois);
        }

        $routeResult = $this->fetchRoute($ordered);

        $themeLabels = array_map(fn($t) => match($t) {
            'entdecken' => 'Besonderes entdecken',
            'veedel'    => 'Schöne Ecken',
            'abhängen'  => 'Zwischendurch abhängen',
            'klassiker' => 'Kölsch-Klassiker',
            default     => $t,
        }, $themes);

        return [
            'stops'               => array_map(fn($s) => $this->formatStop($s), $ordered),
            'route_geojson'       => $routeResult['geojson'],
            'is_fallback'         => $routeResult['is_fallback'],
            'total_distance_m'    => $routeResult['total_distance_m'],
            'estimated_time_min'  => $routeResult['estimated_time_min'],
            'theme_labels'        => $themeLabels,
        ];
    }

    // ── 1. Kandidaten laden ──────────────────────────────────────────
    public function fetchCandidates(float $lat, float $lng, int $radiusM): array {
        // Bounding-Box-Vorfilter via SQL
        $latDelta = $radiusM / 111000.0;
        $lngDelta = $radiusM / (111000.0 * cos(deg2rad($lat)));

        $stmt = $this->pdo->prepare('
            SELECT id, name, COALESCE(display_name, name) AS display_name,
                   address, veedel, lat, lng,
                   google_rating, buedchen_type, poi_distances,
                   character_tags, ai_summary, feature_seating,
                   editorial_sources
            FROM buedchen
            WHERE enriched_at IS NOT NULL
              AND lat BETWEEN :latMin AND :latMax
              AND lng BETWEEN :lngMin AND :lngMax
        ');
        $stmt->execute([
            ':latMin' => $lat - $latDelta,
            ':latMax' => $lat + $latDelta,
            ':lngMin' => $lng - $lngDelta,
            ':lngMax' => $lng + $lngDelta,
        ]);
        $rows = $stmt->fetchAll();

        // Exakte Haversine-Filterung in PHP
        $result = [];
        foreach ($rows as $row) {
            $row['lat']              = (float)  $row['lat'];
            $row['lng']              = (float)  $row['lng'];
            $row['google_rating']    = $row['google_rating']    !== null ? (float) $row['google_rating']    : null;
            $row['character_tags']   = $row['character_tags']   ? json_decode($row['character_tags'],    true) : [];
            $row['poi_distances']    = $row['poi_distances']    ? json_decode($row['poi_distances'],     true) : [];
            $row['editorial_sources'] = $row['editorial_sources'] ? json_decode($row['editorial_sources'], true) : [];
            $row['feature_seating']  = (bool) ($row['feature_seating'] ?? false);

            $d = $this->haversine(['lat' => $lat, 'lng' => $lng], $row);
            if ($d > $radiusM) continue;

            $row['distance_m'] = (int) round($d);
            $result[]          = $row;
        }

        return $result;
    }

    // ── 2. Scoring ───────────────────────────────────────────────────
    public function score(array $buedchen, array $themes): float {
        $score = 0.0;
        foreach ($themes as $theme) {
            $score += match($theme) {
                'entdecken' => $this->scoreEntdecken($buedchen),
                'veedel'    => $this->scoreVeedel($buedchen),
                'abhängen'  => $this->scoreAbhaengen($buedchen),
                'klassiker' => $this->scoreKlassiker($buedchen),
                default     => 0.0,
            };
        }
        return $score;
    }

    private function scoreEntdecken(array $b): float {
        $s = 0.0;
        $s += min(count($b['editorial_sources'] ?? []), 3) * 0.20;
        $s += (($b['google_rating'] ?? 0) / 5) * 0.15;
        $tags = $b['character_tags'] ?? [];
        if (in_array('kultbüdchen',    $tags)) $s += 0.30;
        if (in_array('geheimtipp',     $tags)) $s += 0.40;
        if (in_array('denkmalgebäude', $tags)) $s += 0.20;
        if (in_array('mit-aussicht',   $tags)) $s += 0.15;
        return $s;
    }

    private function scoreVeedel(array $b): float {
        $s = 0.0;
        $d = $b['poi_distances'] ?? [];
        if (isset($d['nearest_plaza_m']))
            $s += max(0.0, 1 - $d['nearest_plaza_m'] / 500) * 0.40;
        if (isset($d['nearest_park_m']))
            $s += max(0.0, 1 - $d['nearest_park_m'] / 300) * 0.30;
        if (isset($d['rhein_m']))
            $s += max(0.0, 1 - $d['rhein_m'] / 1000) * 0.25;
        $tags = $b['character_tags'] ?? [];
        if (in_array('rheinblick',        $tags)) $s += 0.20;
        if (in_array('blumengeschmückt',  $tags)) $s += 0.10;
        return $s;
    }

    private function scoreAbhaengen(array $b): float {
        $s = 0.0;
        if ($b['feature_seating'])                              $s += 0.40;
        if (($b['buedchen_type'] ?? '') === 'platzbüdchen')    $s += 0.25;
        $s += (($b['google_rating'] ?? 0) / 5) * 0.15;
        $tags = $b['character_tags'] ?? [];
        if (in_array('stammgäste',        $tags)) $s += 0.15;
        if (in_array('familienfreundlich',$tags)) $s += 0.10;
        if (in_array('kiez-treff',        $tags) ||
            in_array('veedel-treff',      $tags)) $s += 0.10;
        return $s;
    }

    private function scoreKlassiker(array $b): float {
        $s = 0.0;
        $tags = $b['character_tags'] ?? [];
        if (in_array('kultbüdchen',     $tags)) $s += 0.40;
        if (in_array('stammgäste',      $tags)) $s += 0.25;
        if (in_array('seit-jahrzehnten',$tags)) $s += 0.25;
        if (in_array('älteste-büdchen', $tags)) $s += 0.20;
        $s += (($b['google_rating'] ?? 0) / 5) * 0.10;
        return $s;
    }

    // ── 3. Top N auswählen ───────────────────────────────────────────
    public function selectTop(array $scored, int $radiusM): array {
        $n = $radiusM <= 800  ? 4
           : ($radiusM <= 1500 ? 5 : 6);
        usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);
        return array_slice($scored, 0, $n);
    }

    // ── 4. Nearest-Neighbor-Reihenfolge ─────────────────────────────
    public function nearestNeighborOrder(array $stops, array $start): array {
        $ordered   = [];
        $remaining = array_values($stops);
        $current   = $start;
        while (!empty($remaining)) {
            $nearestIdx  = 0;
            $nearestDist = PHP_FLOAT_MAX;
            foreach ($remaining as $i => $stop) {
                $d = $this->haversine($current, $stop);
                if ($d < $nearestDist) { $nearestDist = $d; $nearestIdx = $i; }
            }
            $ordered[] = $remaining[$nearestIdx];
            $current   = $remaining[$nearestIdx];
            array_splice($remaining, $nearestIdx, 1);
        }
        return $ordered;
    }

    // ── 5. tour_pois einweben ────────────────────────────────────────
    // POI wird zwischen zwei Stopps eingefügt wenn er < 200m vom Mittelpunkt
    // liegt und keinen Umweg > 300m verursacht. Max. 2 POIs pro Route.
    public function interweavePois(array $stops, array $pois): array {
        if (empty($pois) || count($stops) < 2) return $stops;

        $result   = [];
        $usedPois = [];
        $poisUsed = 0;

        for ($i = 0; $i < count($stops) - 1; $i++) {
            $result[] = $stops[$i];
            if ($poisUsed >= 2) continue;

            $a   = $stops[$i];
            $b   = $stops[$i + 1];
            $mid = ['lat' => ($a['lat'] + $b['lat']) / 2, 'lng' => ($a['lng'] + $b['lng']) / 2];
            $segLen = $this->haversine($a, $b);

            foreach ($pois as $poi) {
                if (in_array($poi['id'], $usedPois)) continue;
                if ($this->haversine($mid, $poi) > 200) continue;
                $detour = $this->haversine($a, $poi) + $this->haversine($poi, $b) - $segLen;
                if ($detour > 300) continue;

                $result[]   = array_merge($poi, ['type' => 'poi']);
                $usedPois[] = $poi['id'];
                $poisUsed++;
                break;
            }
        }

        $result[] = $stops[count($stops) - 1];
        return $result;
    }

    // ── 6. OpenRouteService ──────────────────────────────────────────
    public function fetchRoute(array $stops): array {
        // Nur Büdchen-Stops als ORS-Wegpunkte (POIs sind visuelle Zwischenstopps)
        $waypoints = array_values(array_filter($stops, fn($s) => ($s['type'] ?? 'buedchen') !== 'poi'));
        if (count($waypoints) < 2 || empty($this->orsKey)) {
            return $this->fallbackRoute($stops);
        }

        // ORS erwartet [longitude, latitude] (GeoJSON-Reihenfolge)
        $coords  = array_map(fn($s) => [$s['lng'], $s['lat']], $waypoints);
        $payload = json_encode(['coordinates' => $coords], JSON_UNESCAPED_UNICODE);

        $ctx = stream_context_create([
            'http' => [
                'method'        => 'POST',
                'header'        => implode("\r\n", [
                    'Authorization: ' . $this->orsKey,
                    'Content-Type: application/json',
                    'Content-Length: ' . strlen($payload),
                    'Accept: application/json, application/geo+json',
                ]),
                'content'       => $payload,
                'timeout'       => 5,
                'ignore_errors' => true,
            ],
        ]);

        $body = @file_get_contents(
            'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
            false,
            $ctx
        );

        if ($body === false) return $this->fallbackRoute($stops);

        $data = json_decode($body, true);
        if (!isset($data['features'][0]['geometry'])) return $this->fallbackRoute($stops);

        $feature  = $data['features'][0];
        $geometry = $feature['geometry'];
        $summary  = $feature['properties']['summary'] ?? [];

        return [
            'geojson'            => $geometry,
            'is_fallback'        => false,
            'total_distance_m'   => (int) round($summary['distance'] ?? 0),
            'estimated_time_min' => (int) round(($summary['duration'] ?? 0) / 60),
        ];
    }

    private function fallbackRoute(array $stops): array {
        // Gerade Verbindungslinie durch alle Stops — Leaflet rendert gestrichelt
        $coords = array_map(fn($s) => [$s['lng'], $s['lat']], $stops);

        $totalM = 0.0;
        for ($i = 0; $i < count($stops) - 1; $i++) {
            $totalM += $this->haversine($stops[$i], $stops[$i + 1]);
        }

        return [
            'geojson'            => ['type' => 'LineString', 'coordinates' => $coords],
            'is_fallback'        => true,
            'total_distance_m'   => (int) round($totalM),
            'estimated_time_min' => (int) round($totalM / 80), // ~4,8 km/h Schrittgeschwindigkeit
        ];
    }

    // ── Haversine-Distanz in Metern ──────────────────────────────────
    private function haversine(array $a, array $b): float {
        $R    = 6371000.0;
        $dLat = deg2rad($b['lat'] - $a['lat']);
        $dLng = deg2rad($b['lng'] - $a['lng']);
        $sin  = sin($dLat / 2) ** 2
              + cos(deg2rad($a['lat'])) * cos(deg2rad($b['lat'])) * sin($dLng / 2) ** 2;
        return $R * 2 * atan2(sqrt($sin), sqrt(1.0 - $sin));
    }

    private function fetchPois(float $lat, float $lng, int $radiusM): array {
        $stmt = $this->pdo->prepare('SELECT id, name, description, category, lat, lng FROM tour_pois WHERE is_active = 1');
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $result = [];
        foreach ($rows as $row) {
            $row['lat'] = (float) $row['lat'];
            $row['lng'] = (float) $row['lng'];
            $d = $this->haversine(['lat' => $lat, 'lng' => $lng], $row);
            if ($d > $radiusM) continue;
            $row['distance_m'] = (int) round($d);
            $result[] = $row;
        }
        return $result;
    }

    private function formatStop(array $s): array {
        if (($s['type'] ?? 'buedchen') === 'poi') {
            return [
                'type'     => 'poi',
                'id'       => $s['id'],
                'name'     => $s['name'],
                'lat'      => $s['lat'],
                'lng'      => $s['lng'],
                'category' => $s['category'] ?? 'poi',
            ];
        }
        return [
            'type'          => 'buedchen',
            'id'            => $s['id'],
            'name'          => $s['name'],
            'display_name'  => $s['display_name'] ?? $s['name'],
            'lat'           => $s['lat'],
            'lng'           => $s['lng'],
            'score'         => round($s['score'] ?? 0.0, 3),
            'tags'          => $s['character_tags'] ?? [],
            'summary'       => $s['ai_summary'] ?? null,
            'veedel'        => $s['veedel'] ?? null,
            'google_rating' => $s['google_rating'] ?? null,
        ];
    }
}
