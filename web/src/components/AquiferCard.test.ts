import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n';
import { AquiferCard } from './AquiferCard';

afterEach(() => vi.unstubAllGlobals());
function render(lat: number, lon: number, language: 'en' | 'es') {
  vi.stubGlobal('localStorage', { getItem: () => language });
  return renderToStaticMarkup(createElement(LanguageProvider, null, createElement(AquiferCard, { lat, lon })));
}
describe('aquifer evidence card', () => {
  it('shows dated source numbers and all interpretation limits in English and Spanish', () => {
    const en = render(38.1095, -100.706, 'en');
    expect(en).toContain('66.9');
    expect(en).toContain('2022–2024');
    expect(en).toContain('22S31W27');
    expect(en).toContain('not a well test');
    expect(en).toContain('not a water right');
    expect(en).toContain('LEMA status unverified');
    expect(en).toContain('do not change crop rankings');
    expect(en).toContain('not a countdown');
    const es = render(38.1095, -100.706, 'es');
    expect(es).toContain('Acuífero');
    expect(es).toContain('no es una prueba de pozo');
    expect(es).toContain('no es un derecho de agua');
    expect(es).toContain('Estado LEMA sin verificar');
    expect(es).toContain('no cambian la clasificación');
  });
  it('distinguishes mapped noncoverage from unknown coverage in both languages', () => {
    expect(render(40.73, -96.55, 'en')).toContain('outside the mapped High Plains aquifer');
    expect(render(40.73, -96.55, 'es')).toContain('fuera del acuífero High Plains cartografiado');
    expect(render(38.2, -100.7, 'en')).toContain('not covered by this small offline subset');
    expect(render(38.2, -100.7, 'es')).toContain('no está cubierto por este pequeño subconjunto');
    expect(render(38.2, -100.7, 'en')).not.toContain('66.9');
  });
});
