"""Offline, bounded HLS sample. Run with uv (see docs/HLS.md). Secrets never logged.
This uses GDAL HTTP range reads, not a Worker decoder. Output is only 3x3 pixels.
"""
import argparse
import hashlib
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
import requests
import rasterio
from rasterio.warp import transform
from rasterio.windows import Window

FIELDS = [('finney-ks',38.1095,-100.706),('story-ia',42.0563,-93.495),('champaign-il',40.048,-88.33),('lancaster-ne',40.73,-96.55)]
CMR='https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search'
GUIDE='https://lpdaac.usgs.gov/documents/1698/HLS_User_Guide_V2.pdf'

def quality(mask):
    if mask is None or mask == 255: return ['fill']
    flags = [label for bit,label in [(1,'cloud'),(2,'adjacent_cloud_shadow'),(3,'shadow'),(4,'snow'),(5,'water')] if mask & (1 << bit)]
    if mask & 192 == 192: flags.append('high_aerosol')
    return flags

def pixel(mask, raw):
    reasons=quality(mask)
    if any(v is None or v == -9999 or not -2000 <= v <= 16000 for v in raw): reasons.append('reflectance_fill_or_range')
    scaled=[v*0.0001 if v is not None and v != -9999 and -2000 <= v <= 16000 else None for v in raw]
    red,nir=scaled[:2]
    ndvi=None
    if not reasons:
        if red is None or nir is None or red+nir <= 0: reasons.append('nonpositive_denominator')
        else:
            ndvi=(nir-red)/(nir+red)
            if not -1 <= ndvi <= 1: ndvi=None; reasons.append('ndvi_range')
    return dict(fmask=mask,raw=raw,reflectance=scaled,ndvi=ndvi,excluded=reasons)

def read_band(url,token,lat,lon):
    parsed=urlparse(url)
    if parsed.scheme!='https' or parsed.hostname!='data.lpdaac.earthdatacloud.nasa.gov' or parsed.query: raise ValueError('Unexpected asset host')
    # Resolve Earthdata authorization and redirect without ever storing signed URLs.
    with requests.get(url,headers={'Authorization':'Bearer '+token,'Range':'bytes=0-15'},timeout=45,stream=True) as probe:
        if probe.status_code not in (200,206): raise RuntimeError('Asset access HTTP '+str(probe.status_code))
        resolved=probe.url
        range_proof=dict(status=probe.status_code,contentRange=probe.headers.get('Content-Range'),etag=probe.headers.get('ETag'))
    host=urlparse(resolved).hostname or ''
    if host not in ('data.lpdaac.earthdatacloud.nasa.gov','d1nklfio7vscoe.cloudfront.net') and not host.endswith('.amazonaws.com'): raise ValueError('Unexpected redirect')
    headers='Authorization: Bearer '+token if host=='data.lpdaac.earthdatacloud.nasa.gov' else ''
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_HEADERS=headers,GDAL_HTTP_TIMEOUT='45',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',CPL_VSIL_CURL_USE_HEAD='NO'):
        with rasterio.open(resolved) as dataset:
            if dataset.crs is None or abs(dataset.res[0])!=30 or abs(dataset.res[1])!=30: raise ValueError('Unexpected HLS grid')
            x,y=transform('EPSG:4326',dataset.crs,[lon],[lat])
            row,col=dataset.index(x[0],y[0])
            if row<1 or col<1 or row+1>=dataset.height or col+1>=dataset.width: raise ValueError('Point outside full 3x3 window')
            window=Window(col-1,row-1,3,3)
            array=dataset.read(1,window=window)
            return array.flatten().astype(int).tolist(),dict(crs=str(dataset.crs),window=[col-1,row-1,3,3],transform=list(dataset.window_transform(window))[:6],bounds=list(rasterio.windows.bounds(window,dataset.transform))),range_proof

def build(output):
    secrets={}
    if Path('.dev.vars').exists():
        for line in Path('.dev.vars').read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k,v=line.split('=',1); secrets[k.strip()]=v.strip().strip('\"\'')
    token=os.environ.get('EARTHDATA_TOKEN') or secrets.get('EARTHDATA_TOKEN')
    if not token: raise RuntimeError('EARTHDATA_TOKEN missing; no artifact produced')
    artifact=dict(schema='hls-demo-window-v1',retrievedAt=datetime.now(timezone.utc).isoformat(),method='Offline GDAL/rasterio 1.4.3 COG HTTP range reads, 3x3 native 30m pixels; not a Worker decoder',guide=GUIDE,scale=0.0001,offset=0,fill=-9999,qaVersion='hls-v2-strict-v1',period=['2025-07-01','2025-07-31'],selection='One lowest tile-cloud-cover candidate per sensor per demo point from July 2025; not a complete time series or field-boundary coverage',fields=[])
    for field,lat,lon in FIELDS:
        entry=dict(id=field,lat=lat,lon=lon,observations=[],searches=[])
        artifact['fields'].append(entry)
        for collection in ['HLSL30.v2.0','HLSS30.v2.0']:
            url=CMR+'?'+urlencode(dict(collections=collection,bbox=f'{lon-0.0001},{lat-0.0001},{lon+0.0001},{lat+0.0001}',datetime='2025-07-01T00:00:00Z/2025-07-31T23:59:59Z',limit=100))
            search=requests.get(url,timeout=45); search.raise_for_status(); data=search.json()
            if data.get('context',{}).get('matched',len(data['features'])) > len(data['features']): raise RuntimeError('Search pagination required; refusing incomplete selection')
            features=data['features']
            entry['searches'].append(dict(url=url,matched=len(features),candidateIds=[f['id'] for f in features]))
            if not features: continue
            feature=min(features,key=lambda f:(f['properties'].get('eo:cloud_cover',100),f['id']))
            landsat=collection.startswith('HLSL')
            bands=['B04','B05','B06','B07','Fmask'] if landsat else ['B04','B8A','B11','B12','Fmask']
            obs=dict(id=feature['id'],collection=collection,datetime=feature['properties']['datetime'],tileCloudPercent=feature['properties'].get('eo:cloud_cover'),bands=bands,assets={b:feature['assets'][b]['href'] for b in bands},metadata=[l['href'] for l in feature['links'] if l['rel']=='self'],status='unavailable',pixels=[],clearPixelCount=0,clearShare=None,meanNdvi=None)
            entry['observations'].append(obs)
            try:
                arrays=[]; grids=[]; range_proofs={}
                for band in bands:
                    values,grid,proof=read_band(obs['assets'][band],token,lat,lon); arrays.append(values); grids.append(grid); range_proofs[band]=proof
                obs['httpRangeProbes']=range_proofs
                if any(g!=grids[0] for g in grids): raise ValueError('Bands not aligned')
                pixels=[pixel(arrays[4][i],[a[i] for a in arrays[:4]]) for i in range(9)]
                valid=[p['ndvi'] for p in pixels if p['ndvi'] is not None]
                obs.update(grid=grids[0],pixels=pixels,clearPixelCount=len(valid),clearShare=len(valid)/9,meanNdvi=sum(valid)/len(valid) if valid else None,status='observed' if valid else 'all_excluded',subsetSha256=hashlib.sha256(json.dumps(pixels,sort_keys=True,separators=(',',':')).encode()).hexdigest())
            except Exception as exc:
                # Never include exception messages: HTTP/GDAL errors can contain signed URLs.
                obs['error']='Asset/window access failed ('+type(exc).__name__+'); no values invented'
                if type(exc) is ValueError and str(exc) in ['Unexpected asset host','Unexpected redirect','Unexpected HLS grid','Point outside full 3x3 window','Bands not aligned']: obs['error'] += ': '+str(exc)
            print(field,collection,obs['status'],obs['clearPixelCount'])
        Path(output).parent.mkdir(parents=True,exist_ok=True)
        Path(output).write_text(json.dumps(artifact,indent=2,allow_nan=False)+'\n')
    return artifact

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output',default='web/public/data/hls-demo.json'); args=parser.parse_args()
    result=build(args.output)
    if not all(any(o['status']=='observed' for o in f['observations']) for f in result['fields']): raise SystemExit('Some demo fields have no valid observations; retain missing states and investigate')
