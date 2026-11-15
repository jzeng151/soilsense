"""Bounded Earthdata OPeNDAP extraction. Dependencies: requests, pyproj.
python scripts/smap-point.py --vars-file .dev.vars --output data/smap-finney.json
Never logs credentials. Each point response is <200 kB, not a global HDF file.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import requests
from pyproj import Transformer
COLLECTION='C3480440870-NSIDC_CPRD'
BASE='https://opendap.earthdata.nasa.gov/collections/'+COLLECTION+'/granules/'
QA='v1 demonstration applicability screen: finite native values 0–0.9 m3/m3, soil_temp_layer1 >=273.15 K, snow_mass ==0 kg/m2. L4 geophysical fields have no L2 retrieval quality bitfield; no L2 flags invented. Not a validation of assimilation updates; SMAP outages can be model-only.'


def parse_ascii(text):
    result={}
    for line in text.splitlines():
        if ',' not in line: continue
        key,*values=line.split(',')
        key=key.strip().split('[')[0].split('/')[-1]
        if key in {'x','y','cell_lat','cell_lon','sm_surface','sm_rootzone','soil_temp_layer1','snow_mass'}:
            result[key]=[float(v) for v in values]
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--vars-file',type=Path)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--lat',type=float,default=38.1095)
    p.add_argument('--lon',type=float,default=-100.706)
    p.add_argument('--first',type=int,default=2015)
    p.add_argument('--last',type=int,default=2025)
    a=p.parse_args()
    if not 2015<=a.first<=a.last<=2025: p.error('Use completed 2015–2025 record')
    if not 24<=a.lat<=50 or not -125<=a.lon<=-66: p.error('Contiguous-US point required')
    token=os.environ.get('EARTHDATA_TOKEN')
    if a.vars_file:
        pairs=[x.split('=',1) for x in a.vars_file.read_text().splitlines() if x.strip().startswith('EARTHDATA_TOKEN=')]
        if pairs: token=pairs[0][1].strip().strip('"').strip("'")
    if not token: p.error('EARTHDATA_TOKEN not configured')
    headers={'Authorization':'Bearer '+token}
    def get(url,params=None):
        r=requests.get(url,params=params,headers=headers,timeout=60)
        r.raise_for_status()
        if len(r.content)>200000: raise ValueError('Subset exceeded bound')
        return r
    axes=parse_ascii(get(BASE+'SMAP_L4_SM_gph_20220701T013000_Vv8010_001.h5.ascii?x[0:1:3855],y[0:1:1623]').text)
    x,y=Transformer.from_crs('EPSG:4326','EPSG:6933',always_xy=True).transform(a.lon,a.lat)
    row=min(range(len(axes['y'])),key=lambda i:abs(axes['y'][i]-y))
    col=min(range(len(axes['x'])),key=lambda i:abs(axes['x'][i]-x))
    entries=[]
    for year in range(a.first,a.last+1):
        j=get('https://cmr.earthdata.nasa.gov/search/granules.json',{'collection_concept_id':COLLECTION,'temporal':f'{year}-07-01T00:00:00Z,{year}-07-01T23:59:59Z','page_size':10,'sort_key':'start_date'}).json()
        for g in j['feed']['entry']:
            filename=g['title']; stamp=re.search(r'_(\d{8}T\d{6})_',filename)
            if stamp and stamp[1].startswith(f'{year}0701'): entries.append((g['id'],filename,stamp[1]))
    if not entries or len(entries)>88: raise ValueError('Empty or excessive discovery result')
    def subset(entry):
        gid,filename,stamp=entry
        names=['cell_lat','cell_lon','/Geophysical_Data/sm_surface','/Geophysical_Data/sm_rootzone','/Geophysical_Data/soil_temp_layer1','/Geophysical_Data/snow_mass']
        url=BASE+filename+'.ascii?'+','.join(f'{v}[{row}:1:{row}][{col}:1:{col}]' for v in names)
        r=get(url); values={k:v[0] for k,v in parse_ascii(r.text).items()}
        if set(values)!={v.split('/')[-1] for v in names}: raise ValueError('Unexpected subset fields')
        def moisture(v): return v if math.isfinite(v) and 0<=v<=.9 else None
        s,z=moisture(values['sm_surface']),moisture(values['sm_rootzone'])
        good=s is not None and z is not None and values['soil_temp_layer1']>=273.15 and values['snow_mass']==0
        return {'id':gid,'url':url,'sha256':hashlib.sha256(r.content).hexdigest()}, {'time':dt.datetime.strptime(stamp,'%Y%m%dT%H%M%S').isoformat()+'Z','surface':s,'rootzone':z,'quality':'accepted' if good else 'excluded','soilTempK':values['soil_temp_layer1'],'snowMassKgM2':values['snow_mass']}, {'row':row,'column':col,'lat':values['cell_lat'],'lon':values['cell_lon']}
    results=list(ThreadPoolExecutor(max_workers=4).map(subset,entries))
    cells=[r[2] for r in results]
    if any(c!=cells[0] for c in cells): raise ValueError('Cell support changed')
    bundle={'schema':1,'product':'SPL4SMGP','version':'008','point':{'lat':a.lat,'lon':a.lon},'cell':cells[0],'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'qualityPolicy':QA,'granules':[r[0] for r in results],'samples':sorted([r[1] for r in results],key=lambda s:s['time'])}
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(bundle,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'nativeSamples':len(results),'accepted':sum(r[1]['quality']=='accepted' for r in results),'cell':cells[0],'output':str(a.output)}))

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('SMAP acquisition stopped: '+type(e).__name__+'; no fallback generated.',file=sys.stderr)
        sys.exit(1)
