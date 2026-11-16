// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ConstraintsPanel } from './components/ConstraintsPanel';
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from './i18n';
import type { FarmerConstraints } from '../../src/shared/constraints';
for (const language of ['en', 'es'] as const) it(`labels constraints and emits crop exclusions in ${language}`, async () => {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
 localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
 const host = document.createElement('div'); document.body.append(host);
 const root = createRoot(host);
 const changed = vi.fn();
 function Form() {
  const [value, setValue] = useState<FarmerConstraints | undefined>();
  return createElement(ConstraintsPanel, { value, onChange: (v: FarmerConstraints | undefined, valid: boolean) => { setValue(v); changed(v,valid); } });
 }
 await act(async () => root.render(createElement(LanguageProvider, { children: createElement(Form) })));
 expect(host.textContent).toContain(language === 'es' ? 'Límites de tu finca' : 'Your farm constraints');
 const check = host.querySelector<HTMLInputElement>('input[data-exclude="corn"]')!;
 expect(check).not.toBeNull();
 expect(check.closest('label')?.textContent).toContain(language === 'es' ? 'Maíz' : 'Corn');
 await act(async () => check.click());
 expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ excludeCrops: ['corn'] }), true);
 const inputs = [...host.querySelectorAll('input,select')];
 expect(inputs.every(input => input.closest('label') || input.id && host.querySelector(`label[for="${input.id}"]`))).toBe(true);
 await act(async () => root.unmount()); host.remove(); localStorage.clear();
});
