import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { CropId } from "../../src/shared/types";

/** English strings are the typed keys; every entry requires a Spanish translation. */
export const messages = {
  "In short": "En resumen",
  "Bad years out of 10": "Años difíciles de cada 10",
  "What you grow now": "Tus cultivos actuales",
  "This plan": "Este plan",
  "bad nearly every year": "un año difícil casi todos los años",
  "almost never a bad year": "casi nunca un año difícil",
  "about {number} bad years in 10": "unos {number} años difíciles de cada 10",
  "A bad year means the crop was badly stressed by drought, heat, frost or a wet spring, in 35 years of NASA weather on this field.": "Un año difícil es aquel en que el cultivo sufrió mucho por sequía, calor, heladas o una primavera húmeda, según 35 años de datos meteorológicos de NASA para esta parcela.",
  "Limited water": "Agua limitada",
  "No irrigation, or the well has run dry": "Sin riego, o con el pozo agotado",
  "About 10 in a year: a declining well or an allocation": "Unas 10 pulgadas al año: un pozo con menor caudal o una asignación de agua",
  "Water whenever the crop needs it": "Agua siempre que la necesite el cultivo",
  "Your field": "Tu parcela",
  "3 questions": "3 preguntas",
  "Your plan": "Tu plan",
  "Progress": "Progreso",
  "Language": "Idioma",
  "Teaching satellites to speak Farmer": "Enseñamos a los satélites a hablar el idioma del campo",
  "Hi, I'm Sprout": "Hola, soy Sprout",
  "Where is your field?": "¿Dónde está tu parcela?",
  "We'll look at 35 years of weather and the soil under that exact spot, then suggest what to grow for the next 3 years.": "Analizaremos 35 años de datos meteorológicos y el suelo de ese lugar para sugerirte qué cultivar durante los próximos 3 años.",
  "ZIP code": "Código postal de EE. UU.",
  "Go": "Buscar",
  "or": "o",
  "📍 Use my location": "📍 Usar mi ubicación",
  "Then tap your field on the map.": "Después, selecciona tu parcela en el mapa.",
  "No field handy? Try an example:": "¿No tienes una parcela a mano? Prueba un ejemplo:",
  "Looking up your field…": "Buscando datos de tu parcela…",
  "Soil:": "Suelo:",
  "not mapped here, so we'll use typical values": "sin datos cartográficos aquí; usaremos valores típicos",
  "Seen from space:": "Visto desde el espacio:",
  "⚠️ Satellite crop maps show town or buildings here, not farmland. Tap the middle of your field on the map for a better plan.": "⚠️ Los mapas satelitales muestran una zona urbana o edificios aquí, no tierras de cultivo. Selecciona el centro de tu parcela para obtener un plan más adecuado.",
  "Yes, this is my field →": "Sí, esta es mi parcela →",
  "Three quick questions": "Tres preguntas rápidas",
  "About your field.": "Sobre tu parcela.",
  "About your field in {place}.": "Sobre tu parcela en {place}.",
  "What did you grow in {year}?": "¿Qué cultivaste en {year}?",
  "We guessed from satellite maps. Change it if it's wrong.": "Lo estimamos a partir de mapas satelitales. Corrígelo si no coincide.",
  "How is it watered?": "¿Cómo se abastece de agua?",
  "Check your irrigation allocation; the model allowance is not measured pumping or a legal water right.": "Revisa tu asignación de agua para riego; la cantidad supuesta por el modelo no es una medición de extracción ni un derecho legal de uso del agua.",
  "What matters most to you?": "¿Qué es lo más importante para ti?",
  "Corn": "Maíz",
  "Soybean": "Soja",
  "Winter wheat": "Trigo de invierno",
  "Oats": "Avena",
  "Alfalfa / hay": "Alfalfa / heno",
  "Grain sorghum": "Sorgo de grano",
  "Fallow (no crop)": "Barbecho (sin cultivo)",
  "A bit of everything": "Un poco de todo",
  "Profit, soil and safety": "Rentabilidad, suelo y seguridad",
  "Most profit": "Mayor rentabilidad",
  "Money per acre": "Ganancia por acre",
  "Healthier soil": "Un suelo más sano",
  "Build it up over time": "Mejorarlo con el tiempo",
  "Lowest risk": "Menor riesgo",
  "Safe in bad years": "Resistir los años difíciles",
  "Rain only": "Solo lluvia",
  "No watering system": "Sin sistema de riego",
  "Limited irrigation": "Riego limitado",
  "Some water, not all you need": "Algo de agua, pero no toda la necesaria",
  "Full irrigation": "Riego completo",
  "Enough water when needed": "Agua suficiente cuando hace falta",
  "← Back": "← Volver",
  "Show my plan →": "Ver mi plan →",
  "Pick what you grew to continue": "Selecciona tu cultivo para continuar",
  "Building your plan…": "Preparando tu plan…",
  "Sprout is checking the NASA data for your field.": "Sprout está revisando los datos de NASA para tu parcela.",
  "Reading 35 years of NASA weather for your field": "Analizando 35 años de datos meteorológicos de NASA para tu parcela",
  "Checking the soil under it": "Revisando el suelo de tu parcela",
  "Comparing about a thousand 3-year crop plans": "Comparando unas mil rotaciones de cultivos de 3 años",
  "Picking the best fit for you": "Eligiendo la opción más adecuada para ti",
  "Try again": "Intentar de nuevo",
  "No feasible rotation found": "No se encontró una rotación viable",
  "Review your crop history, water assumptions and priorities. Missing evidence is not a zero score.": "Revisa tu historial de cultivos, los supuestos sobre el agua y tus prioridades. La falta de datos no equivale a una puntuación de cero.",
  "Review inputs": "Revisar datos",
  "Our advice for": "Nuestra recomendación para",
  "Based on:": "Basado en:",
  "Change": "Cambiar",
  "What if your water changes?": "¿Qué pasa si cambia el agua disponible?",
  "Replay a bad year on your field": "Simula un año difícil en tu parcela",
  "Why we suggest this": "Por qué lo recomendamos",
  "How this plan builds your soil": "Cómo mejora el suelo este plan",
  "Checked against real harvests": "Contrastado con cosechas reales",
  "Compare with other options": "Comparar con otras opciones",
  "Our pick": "Nuestra elección",
  "Option {number}": "Opción {number}",
  "Keep doing what you do": "Mantener tus prácticas actuales",
  "How the weather on your field has changed": "Cómo ha cambiado el clima en tu parcela",
  "No big changes in the weather on this field.": "No se observan grandes cambios en el clima de esta parcela.",
  "Show charts": "Mostrar gráficos",
  "What the satellite measures mean": "Qué significan las mediciones satelitales",
  "Satellite data vs. measurements on the ground": "Datos satelitales frente a mediciones en el terreno",
  "All the reasons": "Todos los motivos",
  "Have a question about this plan?": "¿Tienes alguna pregunta sobre este plan?",
  "e.g. Why not corn next year?": "Por ejemplo: ¿por qué no sembrar maíz el próximo año?",
  "Ask": "Preguntar",
  "Source bibliography and model assumptions": "Fuentes bibliográficas y supuestos del modelo",
  "↺ Start over with another field": "↺ Empezar de nuevo con otra parcela",
  "Soil Sense · A crop consultant in every farmer's pocket · Data from NASA and USDA": "Soil Sense · Asesoría de cultivos al alcance de cada agricultor · Datos de NASA y USDA",
  "Enter a 5-digit US ZIP code.": "Introduce un código postal de EE. UU. de 5 dígitos.",
  "Looking it up…": "Buscando…",
  "Showing {place}. Now tap your field on the map.": "Mostrando {place}. Ahora selecciona tu parcela en el mapa.",
  "We couldn't find that ZIP code. Try another, or tap the map.": "No encontramos ese código postal. Prueba otro o selecciona tu parcela en el mapa.",
  "Your browser can't share its location. Tap the map instead.": "Tu navegador no puede compartir la ubicación. Selecciona tu parcela en el mapa.",
  "Finding you…": "Buscando tu ubicación…",
  "We couldn't get your location. Type a ZIP code or tap the map.": "No pudimos obtener tu ubicación. Introduce un código postal o selecciona tu parcela en el mapa.",
  "We couldn't load your field. Try again or select another field.": "No pudimos cargar los datos de tu parcela. Inténtalo de nuevo o selecciona otra parcela.",
  "We couldn't build your plan. Please try again.": "No pudimos preparar tu plan. Inténtalo de nuevo.",
  "We couldn't answer your question. Please try again.": "No pudimos responder a tu pregunta. Inténtalo de nuevo.",
  "Map: tap your field": "Mapa: selecciona tu parcela",
  "NASA satellite": "Satélite de NASA",
  "Close-up photo": "Imagen de detalle",
  "Street map": "Mapa de calles",
  "Plant greenness (NASA MODIS NDVI)": "Verdor de la vegetación (NASA MODIS NDVI)",
  "Soil moisture (NASA SMAP)": "Humedad del suelo (NASA SMAP)",
  "No cover crop": "Sin cultivo de cobertura",
  "+ {cover} over winter": "+ {cover} durante el invierno",
  "Compared with now": "Frente a la práctica actual",
  "Same as now": "Igual que ahora",
  "vs. now": "frente a la práctica actual",
  "Bad years": "Años difíciles",
  " in 10": " de cada 10",
  "Cover crops": "Cultivos de cobertura",
  "of 3": "de 3",
  " winters": " inviernos",
  "Net margin": "Margen neto",
  "about break-even": "aproximadamente sin pérdidas ni ganancias",
  "loses about {money}": "pérdida de unos {money}",
  "/acre/year": "/acre/año",
  "Decision notice": "SoilSense ayuda a explorar opciones con datos de NASA e investigaciones. Complementa el criterio del agricultor y el asesoramiento agronómico y de extensión agrícola local; no es un pronóstico ni una garantía.",
  "Low return warning": "A los precios actuales, ninguna de las rotaciones comparadas genera ganancias de forma fiable en esta parcela sin riego. Este plan ofrece el mejor equilibrio entre costos, riesgo y suelo: falla con menos frecuencia y protege el terreno hasta que mejoren los precios o la disponibilidad de agua.",
  "Lower return tradeoff": "En promedio, este plan genera unos ${less} menos por acre al año que tus prácticas actuales. Lo sugerimos porque mejora el suelo y se ajusta a tu objetivo.",
  "Risk return tradeoff": "En promedio, tus cultivos actuales generan unos ${less} más por acre al año porque los años buenos son muy rentables. Pero son poco frecuentes aquí: tus cultivos actuales salen adelante en unos {now} de cada 10 años, y este plan en unos {ours}. Varios años difíciles seguidos cuestan mucho más que esa diferencia promedio.",
} as const;

export type Language = "en" | "es";
export type TranslationKey = keyof typeof messages;
export const english = Object.fromEntries(Object.keys(messages).map((key) => [key, key])) as Record<TranslationKey, string>;
english["Decision notice"] = "SoilSense helps explore options using NASA data and research. It supports the farmer’s judgment together with local agronomist and extension advice; it is not a forecast or a guarantee.";
english["Low return warning"] = "At today's prices, none of the rotations we compared reliably makes money on this field without irrigation. This plan is the best balance of cost, risk and soil: it fails less often and protects the ground until prices or water improve.";
english["Lower return tradeoff"] = "On average this plan earns about ${less}/acre a year less than what you do now. We suggest it because it is better for your soil and fits your goal.";
english["Risk return tradeoff"] = "On average your current crops earn about ${less}/acre a year more, because their good years pay very well. But those good years are rare here: your current crops come through in about {now} of 10 years, this plan in about {ours}. A few bad years in a row cost far more than that average difference.";
export const dictionaries = { en: english, es: messages };
export function translate(language: Language, key: TranslationKey, values: Record<string, string | number> = {}): string {
  return dictionaries[language][key].replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
export const LANGUAGE_STORAGE_KEY = "soilsense.language";
function initialLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "es" ? "es" : "en"; } catch { return "en"; }
}
const LanguageContext = createContext({ language: "en" as Language, setLanguage: (_language: Language) => {} });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Storage can be blocked in private browsers. */ }
  }, [language]);
  return createElement(LanguageContext.Provider, { value: { language, setLanguage } }, children);
}
export function useI18n() {
  const context = useContext(LanguageContext);
  return { ...context, t: (key: TranslationKey, values?: Record<string, string | number>) => translate(context.language, key, values) };
}
export const cropKeys: Record<CropId, TranslationKey> = {
  corn: "Corn", soybean: "Soybean", winter_wheat: "Winter wheat", oats: "Oats", alfalfa: "Alfalfa / hay", sorghum: "Grain sorghum", fallow: "Fallow (no crop)",
};
export function cropName(crop: CropId, language: Language): string { return translate(language, cropKeys[crop]); }
export const coverNames: Record<string, string> = { cereal_rye: "centeno", crimson_clover: "trébol encarnado", hairy_vetch: "veza vellosa", none: "sin cultivo de cobertura" };
