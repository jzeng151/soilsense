import { DEMO_FARMS } from '../components/MapPicker';
import { ExploreRail } from '../components/explore/ExploreRail';
import { useI18n } from '../i18n';
import './explore.css';
export function DemoFarmsPage(){
  const {t}=useI18n();
  return <main id="content" tabIndex={-1} className="demo-page"><ExploreRail/><div className="demo-content"><a href="#/explore">← {t('Back to globe')}</a><h1>{t('Explore a working field')}</h1><p>{t('Four example locations. Choose one to explore real imagery and available USDA boundaries.')}</p><div className="demo-grid">{DEMO_FARMS.map(f=><a className="demo-card" key={f.name} href={`#/explore?${new URLSearchParams({lat:String(f.lat),lon:String(f.lon),label:f.name})}`}><small>{f.lat.toFixed(4)}°, {f.lon.toFixed(4)}°</small><h2>{t(f.name as Parameters<typeof t>[0])}</h2><p>{t(f.note as Parameters<typeof t>[0])}</p><span>{t('Explore location')} →</span></a>)}</div></div></main>;
}
