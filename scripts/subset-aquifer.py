"""Offline evidence refresh, never called by the Worker.
Requires Python 3 with pyshp==3.0.3, shapely==2.1.2, pyproj==3.8.0.
Usage: python scripts/subset-aquifer.py --output <new-directory>
Review the diff before replacing data/aquifer. Public sources only; no credentials.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import urllib.parse
import urllib.request
import zipfile

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import Point, shape
from shapely.ops import unary_union

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
retrieved = dt.datetime.now(dt.timezone.utc).isoformat()
BASE = 'https://services2.arcgis.com/ZOdjAzAQ2B0f85zi/ArcGIS/rest/services/'
LAYER = BASE + 'High_Plains_Aquifer_Section_Properties/FeatureServer/0'
ITEM = 'https://www.arcgis.com/sharing/rest/content/items/223ec510fbb044e88b0d147196ae42a5?f=json'
BOUNDARY = 'https://www.sciencebase.gov/catalog/file/get/6314061bd34e36012efa397b?f=__disk__39%2F00%2Fb6%2F3900b621917a747319cd00a5ecb647623a500dae'
SOURCES = []


def fetch(name, url, retain=True):
    with urllib.request.urlopen(url, timeout=90) as response:
        assert response.status == 200
        data = response.read()
    SOURCES.append({'file': name if retain else None, 'url': url,
                    'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                    'retrievedAt': retrieved})
    if retain:
        (args.output / name).write_bytes(data)
    return data


def fetch_json(name, url):
    value = json.loads(fetch(name, url))
    if 'error' in value:
        raise ValueError(value['error'])
    if value.get('exceededTransferLimit'):
        raise ValueError('Incomplete response')
    return value


item = fetch_json('kgs-item.json', ITEM)
assert item['owner'] == 'KS_Geological_Survey'
metadata = fetch_json('kgs-layer.json', LAYER + '?f=json')
point = {'lat': 38.1095, 'lon': -100.706}
params = {'f': 'json', 'geometry': '-100.706,38.1095',
          'geometryType': 'esriGeometryPoint', 'inSR': 4326, 'outSR': 4326,
          'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'returnGeometry': 'true'}
response = fetch_json('kgs-finney-section.json', LAYER + '/query?' + urllib.parse.urlencode(params))
assert len(response['features']) == 1, 'Ambiguous/no section'
feature = response['features'][0]
assert feature['attributes']['TRS'] == '22S31W27'
assert feature['attributes']['gmd'] == 3
# Independent KGS district boundary query: no county-wide inference.
gmd_params = {**params, 'returnGeometry': 'false'}
gmd = fetch_json('kgs-finney-gmd.json', BASE + 'GMDs/FeatureServer/35/query?' + urllib.parse.urlencode(gmd_params))
assert len(gmd['features']) == 1

archive = zipfile.ZipFile(io.BytesIO(fetch('ds543.zip', BOUNDARY, retain=False)))
reader = shapefile.Reader(shp=io.BytesIO(archive.read('hp_bound2010.shp')),
                         shx=io.BytesIO(archive.read('hp_bound2010.shx')),
                         dbf=io.BytesIO(archive.read('hp_bound2010.dbf')))
areas = {}
for record in reader.iterShapeRecords():
    areas.setdefault(record.record[0], []).append(shape(record.shape.__geo_interface__))
aquifer = unary_union(areas['High Plains aquifer']).difference(unary_union(areas['aquifer not present']))
assert aquifer.is_valid
transform = Transformer.from_crs(4326, CRS.from_wkt(archive.read('hp_bound2010.prj').decode()), always_xy=True)
farms = [('Story County, Iowa', 42.0563, -93.495),
         ('Champaign County, Illinois', 40.048, -88.33),
         ('Finney County, Kansas', 38.1095, -100.706),
         ('Lancaster County, Nebraska', 40.73, -96.55)]
coverage = []
for name, lat, lon in farms:
    p = Point(transform.transform(lon, lat))
    coverage.append({'name': name, 'lat': lat, 'lon': lon,
                     'inMappedHighPlainsAquifer': aquifer.covers(p),
                     'distanceToMappedBoundaryKm': aquifer.boundary.distance(p) / 1000})

bundle = {
    'schemaVersion': 1, 'retrievedAt': retrieved,
    'product': 'Kansas Geological Survey: High Plains Aquifer Section Properties',
    'version': 'Attributes created 2024-05-30; 2022-2024 winter average',
    'nativeResolution': 'PLSS section (approximately one square mile); interpolated section representative values, not a field-area average',
    'nativeCrs': 'EPSG:26914; query geometry reprojected by ArcGIS to EPSG:4326',
    'method': 'Point intersects one published section polygon; retain source attributes and unsimplified returned polygon. No nearest-section extrapolation.',
    'units': {'thickness': 'ft', 'change': 'ft (negative = decline)', 'percentChange': '%', 'usableLifetime': 'years (published scenario, not a countdown)'},
    'sourceLayer': LAYER, 'sourceItem': ITEM,
    'dataLastEditDate': metadata.get('editingInfo', {}).get('dataLastEditDate'),
    'point': point, 'section': feature,
    'boundary': {'product': 'Qi, S.L. (2010), USGS Data Series 543',
                 'url': 'https://pubs.usgs.gov/ds/543/', 'doi': '10.5066/P9KA17IW',
                 'method': 'Reproject WGS84 point to native NAD83 Albers. Point-in-polygon after subtracting all aquifer-not-present islands; nearest mapped boundary distance in native projected metres / 1000. Not a survey boundary.',
                 'nativeScale': 'Mixed source scales; see DS543 metadata. Not field-scale delineation.',
                 'demoPoints': coverage},
    'lema': {'status': 'unverified',
             'reason': 'No current effective LEMA order and point boundary verified; proposed GMD3 plans are not allocations. Direct KDA/GMD3 PDF retrieval returned HTTP 403 on retrieval date.',
             'url': 'https://agriculture.ks.gov/home/showpublisheddocument/16936/639210159550700000'},
    'sources': SOURCES,
}
(args.output / 'context.json').write_text(json.dumps(bundle, indent=2) + '\n', encoding='utf8')
print(json.dumps({'section': feature['attributes'], 'districtQuery': gmd['features'], 'coverage': coverage}, indent=2))
