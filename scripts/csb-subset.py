"""Download bounded, unmodified USDA CSB 2018–2025 queries (stdlib only).
Run from repository root: python scripts/csb-subset.py
No fabricated geometry, simplification, clipping, or private attributes.
"""
import datetime
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'data' / 'fields'
SOURCE = 'https://pdi.scinet.usda.gov/hosting/rest/services/Hosted/Crop_Sequence_Boundaries_2025/FeatureServer/0'
AREAS = [('finney', 'Finney, Kansas', 38.1095, -100.706), ('story', 'Story, Iowa', 42.0563, -93.495), ('champaign', 'Champaign, Illinois', 40.048, -88.33), ('lancaster', 'Lancaster, Nebraska', 40.73, -96.55)]


def download(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        raw = response.read(12_000_001)
    if len(raw) > 12_000_000:
        raise ValueError('response exceeds bounded query size')
    value = json.loads(raw)
    if 'error' in value:
        raise ValueError(value['error'])
    return raw, value


def area_acres(rings):
    def ring_area(ring):
        return abs(sum(math.radians(b[0] - a[0]) * (2 + math.sin(math.radians(a[1])) + math.sin(math.radians(b[1]))) for a, b in zip(ring, ring[1:])) * 6371008.8 ** 2 / 2)
    return (ring_area(rings[0]) - sum(ring_area(r) for r in rings[1:])) / 4046.8564224


def centroid(rings):
    # Area-weighted planar centroid in a local equirectangular projection;
    # affine projection cancels in the centroid; valid for these small fields.
    sx = sy = mass = 0
    for index, ring in enumerate(rings):
        origin = ring[0]
        points = [(p[0] - origin[0], p[1] - origin[1]) for p in ring]
        cross = [a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:])]
        total = sum(cross)
        if abs(total) < 1e-20:
            continue
        cx = sum((a[0] + b[0]) * c for a, b, c in zip(points, points[1:], cross)) / (3 * total) + origin[0]
        cy = sum((a[1] + b[1]) * c for a, b, c in zip(points, points[1:], cross)) / (3 * total) + origin[1]
        weight = abs(total) * (1 if index == 0 else -1)
        sx += cx * weight
        sy += cy * weight
        mass += weight
    if mass <= 0:
        raise ValueError('degenerate polygon')
    return {'lat': sy / mass, 'lon': sx / mass}


def main():
    (ROOT / 'source').mkdir(parents=True, exist_ok=True)
    raw, metadata = download(SOURCE + '?f=json')
    assert metadata['name'] == 'national1825_OG'
    assert all('cdl' + str(year) in [f['name'] for f in metadata['fields']] for year in range(2018, 2026))
    (ROOT / 'source' / 'layer.json').write_bytes(raw)
    codes = {v['code']: v['name'] for f in metadata['fields'] if f['name'] == 'cdl2025' for v in (f.get('domain') or {}).get('codedValues', [])}
    manifest = []
    for area_id, name, lat, lon in AREAS:
        dy = 1.5 / 111.195
        dx = dy / math.cos(math.radians(lat))
        bbox = [lon - dx, lat - dy, lon + dx, lat + dy]
        params = {'f': 'geojson', 'geometry': ','.join(str(v) for v in bbox), 'geometryType': 'esriGeometryEnvelope', 'inSR': '4326', 'outSR': '4326', 'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'csbid,csbyears,csbacres,' + ','.join('cdl' + str(y) for y in range(2018, 2026)), 'returnGeometry': 'true', 'orderByFields': 'csbid', 'resultRecordCount': '2000'}
        url = SOURCE + '/query?' + urllib.parse.urlencode(params)
        raw, data = download(url)
        if data.get('properties', {}).get('exceededTransferLimit') or data.get('exceededTransferLimit'):
            raise ValueError('query truncated')
        _, count = download(SOURCE + '/query?' + urllib.parse.urlencode({**params, 'f': 'json', 'returnCountOnly': 'true'}))
        assert count['count'] == len(data['features']), (count, len(data['features']))
        (ROOT / 'source' / (area_id + '.geojson')).write_bytes(raw)
        provenance = {'product': 'USDA NASS Crop Sequence Boundaries', 'version': '2018-2025 (national1825_OG; algorithm v2024 per NASS)', 'url': url, 'retrieved': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sha256': hashlib.sha256(raw).hexdigest()}
        fields = []
        omitted = 0
        for feature in data['features']:
            p, g = feature['properties'], feature['geometry']
            assert p['csbyears'] == '1825', p['csbyears']
            if g['type'] != 'Polygon':
                omitted += 1
                continue
            rings = g['coordinates']
            assert all(r[0] == r[-1] and len(r) >= 4 for r in rings)
            fields.append({'id': 'csb:' + p['csbid'], 'source': 'usda-csb', 'polygon': rings, 'areaAcres': area_acres(rings), 'centroid': centroid(rings), 'cropSequence': [{'year': y, 'cdlCode': p['cdl' + str(y)], 'crop': codes.get(p['cdl' + str(y)], 'CDL ' + str(p['cdl' + str(y)]))} for y in range(2018, 2026)], 'provenance': provenance})
        result = {'id': area_id, 'name': name, 'bbox': bbox, 'sourceCount': count['count'], 'omittedMultipart': omitted, 'fields': fields, 'sourceAcres': {f['properties']['csbid']: f['properties']['csbacres'] for f in data['features']}, 'provenance': provenance}
        (ROOT / (area_id + '.json')).write_text(json.dumps(result, separators=(',', ':')) + '\n', encoding='utf-8')
        manifest.append({'id': area_id, 'name': name, 'bbox': bbox})
        print(area_id, 'source', count['count'], 'polygons', len(fields), 'multipart omitted', omitted, 'sha256', provenance['sha256'])
    (ROOT / 'areas.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
