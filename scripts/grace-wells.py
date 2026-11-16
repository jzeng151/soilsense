"""Reproduce small Finney regional GRACE + KGS evidence (offline, never deploys).
uv pip install requests beautifulsoup4 h5py numpy
python scripts/grace-wells.py --vars-file .dev.vars --netcdf-cache <scratch>/grace.nc --output data/grace-wells-finney.json
A ~46 MB NASA netCDF is processed offline; Workers serve only the small JSON.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import h5py
import numpy as np
import requests
from bs4 import BeautifulSoup
ROOT='https://geohydro.kgs.ku.edu/geohydro/wizard/'
NASA='https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4/GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc'
SHA='3522dd579cc10326339efdecece550ba01f41b9bee599d0ed915fc35f9eafb64'
POINT={'lat':38.1095,'lon':-100.706}

def number(value):
    try: return float(value)
    except (ValueError, TypeError): return None

def digest(raw): return hashlib.sha256(raw).hexdigest()
def text(v): return v.decode() if isinstance(v,bytes) else str(v)
def soup(raw): return BeautifulSoup(raw,'html.parser')

def fetch_wells():
    session=requests.Session()
    query={'f_c':'55','f_t':'0','f_r':'0','ew':'0','f_s':'0','f_gmd':'0','f_st':'20','f_only':'Y','f_dstart':'01/01/2015','f_dend':'12/31/2025','f_usgs':'','f_kgsid':''}
    r=session.post(ROOT+'wizardviewer.cfm',data=query,timeout=45);r.raise_for_status()
    first=soup(r.content); match=re.search(r'(\d+) records currently selected',first.get_text(' ',strip=True))
    if not match: raise ValueError('KGS selection count missing')
    total=int(match[1])
    if not 1<=total<=200: raise ValueError('KGS selection exceeds offline bound')
    pages=[r.content]
    for start in range(51,total+1,50):
        r=session.get(ROOT+'wizardwelllisting.cfm',params={'theStartRow':start,'theOrderBy':'geohydro.wizard_sites.usgs_id','theOrderByDir':'ASC'},timeout=45);r.raise_for_status();pages.append(r.content)
    candidates={}
    for raw in pages:
        for a in soup(raw).find_all('a',href=re.compile(r'^wizardwelldetail.cfm\?usgs_id=\d{15}$')):
            cells=[c.get_text(' ',strip=True) for c in a.find_parent('tr').find_all('td',recursive=False)]
            if len(cells)!=10: raise ValueError('KGS listing schema changed')
            id=re.search(r'\d{15}',a['href'])[0]
            candidates[id]={'id':id,'county':cells[1],'localId':cells[2],'lon':number(cells[5]),'lat':number(cells[6]),'siteUse':cells[7],'waterUse':cells[8],'wellDepthFt':number(cells[9])}
    if len(candidates)!=total: raise ValueError('KGS pagination count mismatch')
    # Haversine distances; select on proximity and winter coverage only, NEVER on trend sign.
    def distance(w):
        la1,la2=map(math.radians,[POINT['lat'],w['lat']]);dlat=la2-la1;dlon=math.radians(w['lon']-POINT['lon'])
        return 6371*2*math.asin(math.sqrt(math.sin(dlat/2)**2+math.cos(la1)*math.cos(la2)*math.sin(dlon/2)**2))
    selected=[];attempted=[]
    for w in sorted([w for w in candidates.values() if w['lat'] is not None and w['lon'] is not None],key=lambda w:(distance(w),w['id']))[:15]:
        attempted.append(w['id'])
        url=ROOT+'wizardwelldetail_wl.cfm?usgs_id='+w['id']
        r=session.get(url,timeout=45);r.raise_for_status();raw=r.content
        observations=[]
        for tr in soup(raw).find_all('tr'):
            cells=[c.get_text(' ',strip=True) for c in tr.find_all('td',recursive=False)]
            if len(cells)<5 or not re.fullmatch(r'[A-Z]{3}-\d{2}-\d{4}',cells[0]): continue
            date=dt.datetime.strptime(cells[0],'%b-%d-%Y').date()
            if not 2015<=date.year<=2025: continue
            try: level=float(cells[1])
            except ValueError: level=None
            observations.append({'date':str(date),'reportedSignedFt':level,'status':cells[2],'agency':cells[3],'method':cells[4]})
        annual={}
        for o in sorted(observations,key=lambda o:o['date']):
            y=o['date'][:4]
            if int(o['date'][5:7])<=3 and o['status']=='-' and o['reportedSignedFt'] is not None and y not in annual: annual[y]=o
        if len(annual)<8: continue
        detailurl=ROOT+'wizardwelldetail_s.cfm?usgs_id='+w['id']
        d=session.get(detailurl,timeout=45);d.raise_for_status()
        # Whitelist only scientific context; never retain remarks, access directions, contacts or owners.
        fields={}
        for tr in soup(d.content).find_all('tr'):
            cells=[c.get_text(' ',strip=True) for c in tr.find_all('td',recursive=False)]
            for i,v in enumerate(cells[:-1]):
                if v in ['Geological Unit Codes:','Depth of Well (ft):','Surface Elevation (ft):','Latitude:','Longitude:','Use of Site:']:
                    fields[v]=cells[i+1]
        w.update({'distanceKm':round(distance(w),3),'geologicalUnitCodes':fields.get('Geological Unit Codes:'),'wellDepthFt':number(fields.get('Depth of Well (ft):')),'screenedInterval':None,'detailUrl':detailurl,'levelsUrl':url,'metadataSha256':digest(d.content),'levelsSha256':digest(raw),'observations':observations,'selectedAnnualDates':[o['date'] for o in annual.values()]})
        selected.append(w)
        if len(selected)==3: break
    if len(selected)!=3: raise ValueError('Fewer than three eligible wells; stop rather than invent')
    return {'source':'Kansas Geological Survey WIZARD','url':ROOT,'disclaimerUrl':ROOT+'wizarddisclaim.html','query':query,'listingTotal':total,'listingSha256':[digest(p) for p in pages],'attemptedInDistanceOrder':attempted,'selection':'Nearest three Finney wells to demo with >=8 calendar years having a Jan–Mar numeric measurement and blank (-) status, 2015–2025. Earliest qualifying observation each year; other dates preserved, never shifted to another year. No trend/sign criterion. Not an exhaustive county trend.','signConvention':'WIZARD HTML displays negative table values below land surface. Preserve native signed ft exactly; more negative means lower relative water level in these pages. No conversion to absolute elevation, saturated thickness, storage, pumping or allocation.','quality':'Status - means no status supplied, NOT certified error-free. Preserve agency/method; all other status codes excluded from comparison. WIZARD disclaims errors/inaccuracies and decision interpretations.','wells':selected}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--vars-file',type=Path);p.add_argument('--netcdf-cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    token=os.environ.get('EARTHDATA_TOKEN')
    if a.vars_file:
        pairs=[x.split('=',1) for x in a.vars_file.read_text().splitlines() if x.strip().startswith('EARTHDATA_TOKEN=')]
        if pairs: token=pairs[0][1].strip().strip('"').strip("'")
    if not a.netcdf_cache.exists():
        if not token: p.error('EARTHDATA_TOKEN not configured')
        r=requests.get(NASA,headers={'Authorization':'Bearer '+token},timeout=120,stream=True);r.raise_for_status();chunks=[];size=0
        for chunk in r.iter_content(1024*1024):
            size+=len(chunk)
            if size>70*1024*1024: raise ValueError('NASA source exceeds offline cap')
            chunks.append(chunk)
        a.netcdf_cache.parent.mkdir(parents=True,exist_ok=True);a.netcdf_cache.write_bytes(b''.join(chunks))
    if digest(a.netcdf_cache.read_bytes())!=SHA: raise ValueError('Pinned NASA artifact checksum mismatch')
    with h5py.File(a.netcdf_cache) as f:
        row=int(np.argmin(abs(f['lat'][:]-POINT['lat'])));col=int(np.argmin(abs(f['lon'][:]-POINT['lon']%360)))
        id=int(f['mascon_ID'][row,col]);mask=f['mascon_ID'][:]==id;rows,cols=np.where(mask)
        epoch=dt.datetime(2002,1,1);series={}
        for i,days in enumerate(f['time'][:]):
            date=(epoch+dt.timedelta(days=float(days))).isoformat();month=date[:7]
            if not '2015-01'<=month<='2025-12': continue
            value=float(f['lwe_thickness'][i,row,col]);sigma=float(f['uncertainty'][i,row,col])
            series[month]={'month':month,'centerDate':date,'bounds':[(epoch+dt.timedelta(days=float(x))).isoformat() for x in f['time_bounds'][i]],'twsCm':value if np.isfinite(value) and value!=-99999 else None,'sigmaCm':sigma if np.isfinite(sigma) and sigma!=-99999 else None}
        months=[series.get(f'{y}-{m:02}',{'month':f'{y}-{m:02}','centerDate':None,'bounds':None,'twsCm':None,'sigmaCm':None}) for y in range(2015,2026) for m in range(1,13)]
        grace={'shortName':'TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4','version':'RL06.3Mv04 CRI','nativeProductVersionAttribute':text(f.attrs['product_version']),'doi':text(f.attrs['id']),'url':NASA,'sha256':SHA,'attribution':'NASA/JPL, NASA/DLR GRACE and NASA/GFZ GRACE-FO; PO.DAAC','baseline':text(f.attrs['time_mean_removed']),'sourceCoverage':[text(f.attrs['time_coverage_start']),text(f.attrs['time_coverage_end'])],'sourceCreated':text(f.attrs['date_created']),'units':'cm equivalent water thickness anomaly','support':'~3-degree equal-area mascon; 0.5-degree display grid is NOT independent field-scale resolution','masconId':id,'representativeGridCenter':{'lat':float(f['lat'][row]),'lon':float(f['lon'][col])-360},'masconGridBounds':{'south':float(f['lat'][rows.min()])-.25,'north':float(f['lat'][rows.max()])+.25,'west':float(f['lon'][cols.min()])-360-.25,'east':float(f['lon'][cols.max()])-360+.25},'processing':'Representative grid cell in the actual native mascon_ID containing Finney demo; unscaled CRI lwe_thickness, no gain factors, no added GAD, no groundwater subtraction, no smoothing or rebaselining. Uncertainty is native mascon 1-sigma, not independent pixel errors.','months':months}
    kgs=fetch_wells()
    out={'schema':1,'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'point':POINT,'grace':grace,'kgs':kgs}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(out,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'months':len(months),'missingMonths':sum(m['twsCm'] is None for m in months),'masconId':grace['masconId'],'wells':[(w['id'],len(w['selectedAnnualDates']),w['geologicalUnitCodes']) for w in kgs['wells']]}))

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('Acquisition stopped ('+type(e).__name__+'); no synthetic fallback generated.',file=sys.stderr);sys.exit(1)
