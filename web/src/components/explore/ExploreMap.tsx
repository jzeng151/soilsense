import maplibregl, { type GeoJSONSource, type Map as GLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { FieldBoundary } from '../../../../src/shared/fields';
import type { ExploreLocation } from './location';
export const NASA_TILES = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
export const MODIS_TILES = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-07-29/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';
export const USGS_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
interface Props { location: ExploreLocation | null; imagery: 'usgs'|'modis'; fields: FieldBoundary[]; selected: string[]; showFields: boolean; boundary: GeoJSON.FeatureCollection | null; showBoundary: boolean; rotating: boolean; onInteract: () => void; onSelect: (field: FieldBoundary) => void; onReady: (map: GLMap | null) => void; onError: () => void; label: string }
const empty: GeoJSON.FeatureCollection = { type:'FeatureCollection', features:[] };
export function ExploreMap(props: Props) {
  const el = useRef<HTMLDivElement>(null), map = useRef<GLMap | null>(null), latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!el.current) return;
    let m: GLMap;
    try {
      m = new maplibregl.Map({ container: el.current, center:[-95,30], zoom:1.3, minZoom:0.5, maxZoom:18, attributionControl: { compact:true }, style:{ version:8, projection:{type:'globe'}, sources:{
        nasa:{type:'raster',tiles:[NASA_TILES],tileSize:256,maxzoom:8,attribution:'NASA GIBS · Blue Marble'},
        usgs:{type:'raster',tiles:[USGS_TILES],tileSize:256,maxzoom:16,attribution:'USGS The National Map'},
        modis:{type:'raster',tiles:[MODIS_TILES],tileSize:256,maxzoom:9,attribution:'NASA GIBS · MODIS Terra · 2025-07-29'},
      }, layers:[{id:'earth',type:'raster',source:'nasa'},{id:'usgs',type:'raster',source:'usgs',minzoom:8,paint:{'raster-opacity':['interpolate',['linear'],['zoom'],8,0,10,1]}},{id:'modis',type:'raster',source:'modis',layout:{visibility:'none'},minzoom:3}] } });
    } catch { latest.current.onError(); return; }
    map.current = m;
    m.addControl(new maplibregl.ScaleControl({unit:'imperial'}),'bottom-left');
    m.on('error', e => { if (e.error?.message?.includes('WebGL')) latest.current.onError(); });
    m.on('load', () => {
      const css = getComputedStyle(el.current!);
      const line = css.getPropertyValue('--color-on-data').trim() || 'white';
      const selected = css.getPropertyValue('--color-accent').trim();
      const fill = css.getPropertyValue('--color-data').trim();
      m.addSource('fields',{type:'geojson',data:empty});
      m.addLayer({id:'field-fill',type:'fill',source:'fields',paint:{'fill-color':['case',['boolean',['get','selected'],false],selected,fill],'fill-opacity':0.25}});
      m.addLayer({id:'field-line',type:'line',source:'fields',paint:{'line-color':line,'line-width':['case',['boolean',['get','selected'],false],4,1.5]}});
      m.addSource('zip',{type:'geojson',data:empty});
      m.addLayer({id:'zip-line',type:'line',source:'zip',paint:{'line-color':line,'line-width':3,'line-dasharray':[3,2]}});
      m.on('click','field-fill',e => { const id=e.features?.[0]?.properties?.id; const f=latest.current.fields.find(f=>f.id===id); if(f) latest.current.onSelect(f); });
      m.on('mouseenter','field-fill',()=>{ m.getCanvas().style.cursor='pointer'; });
      m.on('mouseleave','field-fill',()=>{ m.getCanvas().style.cursor=''; });
      latest.current.onReady(m);
    });
    const stop = () => latest.current.onInteract();
    m.on('mousedown',stop); m.on('touchstart',stop); m.on('wheel',stop); m.on('keydown',stop);
    let frame: number, last=0;
    const animate = (time:number) => {
      if(last && latest.current.rotating && !latest.current.location && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !m.isMoving()) m.jumpTo({center:[m.getCenter().lng+(time-last)*0.0015,m.getCenter().lat]});
      last=time; frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); latest.current.onReady(null); m.remove(); map.current=null; };
  }, []);
  useEffect(() => {
    const m=map.current; if(!m) return;
    const apply=() => {
      const p=props.location;
      const camera=p?{center:[p.lon,p.lat] as [number,number],zoom:p.zip?12:14,padding:{top:0,bottom:0,left:0,right:0}}:{center:[-95,30] as [number,number],zoom:1.3,padding:{top:0,bottom:0,left:0,right:0}};
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) m.jumpTo(camera); else m.flyTo({...camera,duration:2400,essential:false});
    };
    if(m.isStyleLoaded()) apply(); else m.once('load',apply);
    return()=>{m.off('load',apply);};
  },[props.location]);
  useEffect(() => {
    const m=map.current; if(!m) return;
    const apply=()=>{
      if(!m.getSource('fields'))return;
      (m.getSource('fields') as GeoJSONSource).setData({type:'FeatureCollection',features:props.fields.map(f=>({type:'Feature',properties:{id:f.id,selected:props.selected.includes(f.id)},geometry:{type:'Polygon',coordinates:f.polygon}}))});
      (m.getSource('zip') as GeoJSONSource).setData(props.boundary??empty);
      for(const id of ['field-fill','field-line'])m.setLayoutProperty(id,'visibility',props.showFields?'visible':'none');
      m.setLayoutProperty('zip-line','visibility',props.showBoundary?'visible':'none');
      m.setLayoutProperty('usgs','visibility',props.imagery==='usgs'?'visible':'none');
      m.setLayoutProperty('modis','visibility',props.imagery==='modis'?'visible':'none');
    };
    if(m.isStyleLoaded())apply();else m.once('load',apply);
    return()=>{m.off('load',apply);};
  },[props.fields,props.selected,props.showFields,props.boundary,props.showBoundary,props.imagery]);
  useEffect(()=>{const m=map.current;if(!m||!props.location)return;const p=props.location;const marker=new maplibregl.Marker({color:getComputedStyle(el.current!).getPropertyValue('--color-cta').trim()}).setLngLat([p.lon,p.lat]).addTo(m);return()=>{marker.remove();};},[props.location]);
  return <div ref={el} className="explore-map" role="region" aria-label={props.label}/>;
}
