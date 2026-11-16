import { useI18n } from '../../i18n';
import { LogoMark } from '../Logo';
export function ExploreRail({ onLayers }: { onLayers?: () => void }) {
  const { t, language, setLanguage } = useI18n();
  return <nav className="explore-rail theme-canopy" aria-label={t('Main navigation')}>
    <a className="explore-brand" href="#/explore" aria-label="Soil Sense"><LogoMark size={42}/><span>Soil<br/>Sense</span></a>
    <a href="#/explore" title={t('Explore')} aria-label={t('Explore')}><Icon kind="globe"/></a>
    <a href="#/planner" title={t('Rotation planner')} aria-label={t('Rotation planner')}><Icon kind="pin"/></a>
    <a href="#/demo" title={t('Demo farms')} aria-label={t('Demo farms')}><Icon kind="plant"/></a>
    <button type="button" onClick={onLayers} disabled={!onLayers} title={t('Layers')} aria-label={t('Layers')}><Icon kind="layers"/></button>
    <a href="#/sources" title={t('Sources')} aria-label={t('Sources')}><Icon kind="chart"/></a>
    <a href="#/settings" title={t('Settings')} aria-label={t('Settings')}><Icon kind="settings"/></a>
    <div className="explore-rail-bottom"><button type="button" aria-label={t('Language')} onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}>{language === 'es' ? 'ES' : 'EN'}</button><a href="#/signin" aria-label={t('Sign in')} title={t('Sign in')}><Icon kind="profile"/></a></div>
  </nav>;
}
function Icon({kind}:{kind:string}) {
  const paths: Record<string,string> = { globe:'M3 12h18M12 3c6 5 6 13 0 18-6-5-6-13 0-18', pin:'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM12 7v4',plant:'M12 21V11M12 14C4 14 3 9 3 5c7 0 9 4 9 9zM12 10c0-6 5-7 9-7 0 7-4 9-9 9', layers:'m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5', chart:'M4 3v18h17M8 17v-5M13 17V8M18 17V4',settings:'M12 3v3M12 18v3M3 12h3M18 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',profile:'M5 21v-2c0-6 14-6 14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0' };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{kind === 'globe' || kind === 'settings' ? <circle cx="12" cy="12" r={kind==='globe'?9:5}/> : null}<path d={paths[kind]}/></svg>;
}
