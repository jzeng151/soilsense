import type { FieldBoundary, LonLat } from '../shared/fields';

/** Display-only demonstration setting, NOT a scientifically validated minimum. */
export const MIN_WHOLE_PIXELS = 9;
export const SQUARE_METRES_PER_ACRE = 4046.8564224;
const R = 6371007.1809; // authalic sphere; not an ellipsoidal survey-area calculation
const RAD = Math.PI / 180;
const MAX_CANDIDATES = 100_000;
export interface PixelProduct {
  id:string; name:string; size:string; grid:string; url:string;
  metres?:number; degrees?:[number,number]; origin?:LonLat;
  regional?:boolean; supportOnly?:boolean;
}
export const PIXEL_PRODUCTS: readonly PixelProduct[] = [
  {id:'modis',name:'MODIS MOD13Q1 v061',size:'250 m',grid:'Sinusoidal',metres:231.65635826,url:'https://www.earthdata.nasa.gov/data/catalog/lpcloud-mod13q1-061'},
  {id:'hls',name:'HLS L30 / S30 v2',size:'30 m',grid:'UTM / MGRS',metres:30,url:'https://hls.gsfc.nasa.gov/data-products/'},
  {id:'smap',name:'SMAP SPL4SMGP v008',size:'9 km',grid:'EASE-Grid 2.0',metres:9000,regional:true,url:'https://nsidc.org/data/spl4smgp/versions/8'},
  {id:'imerg',name:'IMERG V07 Late / Final',size:'0.1° × 0.1°',grid:'WGS84',degrees:[0.1,0.1],origin:[-180,-90],regional:true,url:'https://gpm.nasa.gov/data/directory/10km-01-degree'},
  {id:'power',name:'NASA POWER / MERRA-2',size:'0.5° × 0.625°',grid:'WGS84',degrees:[0.625,0.5],origin:[-180.3125,-90.25],regional:true,url:'https://power.larc.nasa.gov/docs/methodology/meteorology/'},
  {id:'grace',name:'GRACE JPL RL06.3Mv04',size:'~3°',grid:'Mascons',metres:R*RAD*3,regional:true,supportOnly:true,url:'https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/'},
  {id:'cdl',name:'USDA CDL (30 m series)',size:'30 m',grid:'CONUS Albers',metres:30,url:'https://www.nass.usda.gov/Research_and_Science/Cropland/Release/'},
  {id:'daymet',name:'NASA Daymet',size:'1 km',grid:'Lambert conformal conic',metres:1000,regional:true,url:'https://daac.ornl.gov/DAYMET/guides/Daymet_Daily_V4R1.html'},
  {id:'ssurgo',name:'USDA SSURGO',size:'polygons',grid:'Map units',url:'https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo'},
];
export type FitCategory = 'field-scale'|'mixed-edge'|'regional-only'|'not-raster'|'unknown';
export interface PixelFit {
  product:PixelProduct; areaSquareMetres:number; pixelAreaSquareMetres:number|null;
  areaRatio:number|null; wholePixels:number|null; category:FitCategory;
  method:'latlon-grid'|'local-equal-area-estimate'|'support-area-only'|'not-raster'|'unsupported';
}
type XY = [number,number];
function ringArea(ring:XY[]):number {
  return Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length]!;return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
}
function inside(p:XY,ring:XY[]):boolean {
  let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i]!,b=ring[j]!;
    // Boundary is included, with sub-millimetre tolerance on metre coordinates.
    const cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);
    if(Math.abs(cross)<1e-8 && p[0]>=Math.min(a[0],b[0])-1e-10 && p[0]<=Math.max(a[0],b[0])+1e-10 && p[1]>=Math.min(a[1],b[1])-1e-10 && p[1]<=Math.max(a[1],b[1])+1e-10) return true;
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
  }
  return hit;
}
/** Reject any boundary entering the cell interior, including narrow notches and holes. */
function entersBox(a:XY,b:XY,x:number,y:number,w:number,h:number):boolean {
  const eps=Math.min(w,h)*1e-9;
  const xmin=x+eps,xmax=x+w-eps,ymin=y+eps,ymax=y+h-eps;
  let lo=0,hi=1;
  for(const [v,d,min,max] of [[a[0],b[0]-a[0],xmin,xmax],[a[1],b[1]-a[1],ymin,ymax]] as [number,number,number,number][]) {
    if(Math.abs(d)<1e-20){if(v<min||v>max)return false;}
    else {const t1=(min-v)/d,t2=(max-v)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}
  }
  return true;
}
function contained(rings:XY[][],x:number,y:number,w:number,h:number):boolean {
  const corners:XY[]=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  if(!corners.every(p=>inside(p,rings[0]!)))return false;
  for(let r=0;r<rings.length;r++) {
    const ring=rings[r]!;
    if(r>0&&corners.some(p=>inside(p,ring)))return false;
    for(let i=0;i<ring.length-1;i++)if(entersBox(ring[i]!,ring[i+1]!,x,y,w,h))return false;
  }
  return true;
}
export function pixelAreaAt(product:PixelProduct,lat:number):number|null {
  if(product.degrees){const [dlon,dlat]=product.degrees;return R*R*dlon*RAD*(Math.sin(Math.min(90,lat+dlat/2)*RAD)-Math.sin(Math.max(-90,lat-dlat/2)*RAD));}
  return product.metres ? product.metres**2 : null;
}
/** Spherical equal-area geometry; projected products use nominal square cells on a surrogate grid.
 * It deliberately does NOT claim native UTM / sinusoidal / EASE alignment or QA-valid observations.
 * Input scope: simple closed WGS84 Polygon rings, no antimeridian, <=10° extent and |lat|<85°.
 */
export function fitProduct(field:FieldBoundary,product:PixelProduct):PixelFit {
  const result:PixelFit={product,areaSquareMetres:0,pixelAreaSquareMetres:null,areaRatio:null,wholePixels:null,category:'unknown',method:'unsupported'};
  const rings=field.polygon;
  if(!rings.length||rings.some(r=>r.length<4||r.some(p=>p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>=85)||r[0]![0]!==r.at(-1)![0]||r[0]![1]!==r.at(-1)![1]))return result;
  const points=rings.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const west=Math.min(...xs),east=Math.max(...xs),south=Math.min(...ys),north=Math.max(...ys);
  if(east-west>10||north-south>10)return result;
  const lat=(south+north)/2,cos=Math.cos(lat*RAD);
  const projected=rings.map(r=>r.map(([lon,la]):XY=>[R*RAD*(lon-west)*cos,R*(Math.sin(la*RAD)-Math.sin(south*RAD))/cos]));
  const area=ringArea(projected[0]!)-projected.slice(1).reduce((a,r)=>a+ringArea(r),0);
  if(area<=0)return result;
  result.areaSquareMetres=area;
  result.pixelAreaSquareMetres=pixelAreaAt(product,lat);
  if(result.pixelAreaSquareMetres===null)return {...result,category:'not-raster',method:'not-raster'};
  result.areaRatio=area/result.pixelAreaSquareMetres;
  if(product.supportOnly)return {...result,category:'regional-only',method:'support-area-only'};
  const grid=product.degrees?rings:projected;
  const w=product.degrees?.[0]??product.metres!,h=product.degrees?.[1]??product.metres!;
  const gx=product.degrees?west:0,gy=product.degrees?south:0;
  const ex=product.degrees?east:Math.max(...projected[0]!.map(p=>p[0]));
  const ey=product.degrees?north:Math.max(...projected[0]!.map(p=>p[1]));
  const [ox,oy]=product.origin??[0,0];
  const ix=Math.floor((gx-ox)/w),iy=Math.floor((gy-oy)/h);
  const nx=Math.ceil((ex-ox)/w)-ix,ny=Math.ceil((ey-oy)/h)-iy;
  if(nx*ny>MAX_CANDIDATES)return result;
  let count=0;
  for(let i=ix;i<ix+nx;i++)for(let j=iy;j<iy+ny;j++)if(contained(grid,ox+i*w,oy+j*h,w,h))count++;
  return {...result,wholePixels:count,category:product.regional?'regional-only':count>=MIN_WHOLE_PIXELS?'field-scale':result.areaRatio>=1?'mixed-edge':'regional-only',method:product.degrees?'latlon-grid':'local-equal-area-estimate'};
}
export function pixelFit(field:FieldBoundary):PixelFit[]{return PIXEL_PRODUCTS.map(p=>fitProduct(field,p));}
