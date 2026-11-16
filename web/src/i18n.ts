import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { CropId } from "../../src/shared/types";
import { fieldMessages } from "./i18n-fields";
import { cardMessages } from "./i18n-cards";

/** English strings are the typed keys; every entry requires a Spanish translation. */
export const messages = {
  ...fieldMessages,
  ...cardMessages,
  "District outlook (next ~4 weeks, team's Kansas model)": "Perspectiva del distrito (próximas ~4 semanas, modelo de Kansas del equipo)",
  "drought likely to continue.": "es probable que la sequía continúe.",
  "possible drought onset (low confidence).": "posible inicio de sequía (baja confianza).",
  "The model's tested skill is strong for persistence and weak for onsets: logistic onset hit rate 0.17, false-alarm ratio 0.47 (2023–2026 test). Districts approximate nine points, not official NASS boundaries. County USDM context uses any D1 or worse area, not a field measurement. This outlook does not change Dry/Watch/OK.": "El modelo probado es fuerte para la persistencia y débil para los inicios: tasa de detección de inicios del modelo logístico 0.17, razón de falsas alarmas 0.47 (prueba 2023–2026). Los distritos aproximan nueve puntos, no los límites oficiales de NASS. El contexto USDM del condado usa cualquier área D1 o peor, no una medición de la parcela. Esta perspectiva no cambia Seco/Vigilar/OK.",
  "Why this outlook?": "¿Por qué esta perspectiva?",
  "Model backtest report": "Informe de evaluación histórica del modelo",
  "Model data through {date}": "Datos del modelo hasta {date}",
  "County Drought Monitor map: {date}": "Mapa del Monitor de Sequía del condado: {date}",
  "U.S. Drought Monitor": "Monitor de Sequía de EE. UU.",
  "K-State rotations for this county are ranked for a dry year": "Las rotaciones de K-State para este condado se ordenan para un año seco",
  "Second opinion": "Segunda opinión",
  "Separate Kansas model; rain-fed rotations, not a change to Field Watch status.": "Modelo separado de Kansas; rotaciones de secano, sin cambiar el estado de Field Watch.",
  "County rotations unavailable. Try the link again.": "Rotaciones del condado no disponibles. Vuelve a intentar el enlace.",
  "Loading county rotations…": "Cargando rotaciones del condado…",
  "Using a saved copy.": "Se usa una copia guardada.",

  "US short tons/acre": "toneladas cortas de EE. UU./acre",
  "bu/acre": "bushels/acre",
  "Your measurements in this plan": "Tus mediciones en este plan",
  "Add your own measurements": "Añade tus propias mediciones",
  "Optional. Saved only in this browser for this field; sent to compute your plan, not saved to an account.": "Opcional. Se guarda solo en este navegador para esta parcela; se envía para calcular tu plan, no se guarda en una cuenta.",
  "Leave blanks to use regional estimates. Confirm the field and water supply match your records.": "Deja campos vacíos para usar estimaciones regionales. Confirma que la parcela y el riego coincidan con tus registros.",
  "Your soil test": "Tu análisis de suelo",
  "USDA soil map": "Mapa de suelos USDA",
  "Soil measurements used for this plan": "Mediciones de suelo usadas para este plan",
  "Not entered": "Sin ingresar",
  "Not available": "No disponible",
  "pH (0–14)": "pH (0–14)",
  "Organic matter % (0–100)": "Materia orgánica % (0–100)",
  "Available water capacity (0.01–0.6 cm/cm)": "Capacidad de agua disponible (0.01–0.6 cm/cm)",
  "Soil texture (optional)": "Textura del suelo (opcional)",
  "Use the soil map": "Usar el mapa de suelos",
  "Sand": "Arena",
  "Sandy loam": "Franco arenoso",
  "Loam": "Franco",
  "Silt loam": "Franco limoso",
  "Clay loam": "Franco arcilloso",
  "Clay": "Arcilla",
  "Water capacity uses cm/cm (same number as in/in), not total inches. A measured value wins over texture. Texture gives an approximate model value, not a lab result.": "La capacidad usa cm/cm (el mismo número que pulg/pulg), no pulgadas totales. El valor medido tiene prioridad sobre la textura. La textura da una aproximación del modelo, no un resultado de laboratorio.",
  "Organic matter is shown as soil evidence; the model does not infer yield or water changes from it.": "La materia orgánica se muestra como evidencia de suelo; el modelo no infiere cambios de rendimiento ni de agua a partir de ella.",
  "Past yields": "Rendimientos anteriores",
  "Up to 5 past calendar years per crop. Grain: bu/acre (0–1000). Alfalfa: US short tons/acre (0–30). Zero means a failed harvest.": "Hasta 5 años anteriores por cultivo. Grano: bu/acre (0–1000). Alfalfa: toneladas cortas de EE. UU./acre (0–30). Cero indica una cosecha perdida.",
  "The model adds 50% of the local-minus-regional potential difference, bounded to 60–115% of the state value. This is calibration, not independent validation.": "El modelo añade el 50% de la diferencia de potencial local menos regional, limitada al 60–115% del valor estatal. Es una calibración, no una validación independiente.",
  "Add a yield year": "Añadir un año de rendimiento",
  "Harvest year": "Año de cosecha",
  "Yield": "Rendimiento",
  "Remove yield year": "Eliminar año de rendimiento",
  "Clear my measurements": "Borrar mis mediciones",
  "Check your measurements: use the ranges shown, complete each yield row, and enter distinct past years (at most 5 per crop).": "Revisa tus mediciones: usa los rangos indicados, completa cada fila de rendimiento e ingresa años anteriores distintos (máximo 5 por cultivo).",
  "Browser storage is unavailable. Your measurements work for this visit but will not survive a reload.": "El almacenamiento del navegador no está disponible. Tus mediciones funcionan en esta visita pero se perderán al recargar.",
  "Map estimate used": "Se usa la estimación del mapa",
  "Approximate from your texture": "Aproximado a partir de tu textura",
  "Your entries override only the supplied properties; map drainage and profile depth are unchanged.": "Tus datos reemplazan solo las propiedades ingresadas; el drenaje y la profundidad del mapa no cambian.",

  "Add a research document by URL": "Añadir un documento de investigación por URL",
  "Only approved research hosts over HTTPS, up to 10 MiB. Source metadata still requires human confirmation.": "Solo sitios de investigación permitidos por HTTPS, hasta 10 MiB. Una persona debe confirmar los metadatos de la fuente.",
  "Research document URL": "URL del documento de investigación",
  "Add document from URL": "Añadir documento desde URL",
  "URL accepted using plain HTML fallback (Browser Rendering unavailable). Refresh to check review status.": "URL aceptada mediante extracción HTML básica (Browser Rendering no disponible). Actualiza para ver el estado de revisión.",
  "URL accepted. Refresh to check review status.": "URL aceptada. Actualiza para ver el estado de revisión.",
  "Retrieved source (confirm before approving)": "Fuente recuperada (confirmar antes de aprobar)",
  "In short": "En resumen",
  "Crop grown this season": "Cultivo de esta temporada",
  "Water supply": "Suministro de agua",
  "Keyboard: focus the map, use arrow keys to move, + or − to zoom, and Enter to select the center. Or choose an example below.": "Teclado: enfoca el mapa, usa las flechas para moverte, + o − para acercar o alejar, y Enter para elegir el centro. O elige un ejemplo abajo.",
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
/** Judge/farmer guide: paired copy keeps the tables and diagram fully bilingual. */
const bilingual = (en: string, es: string): Record<Language, string> => ({ en, es });
export const howItWorksCopy = {
  title: bilingual("How it works", "Cómo funciona"),
  menu: bilingual("Open sidebar", "Abrir navegación"),
  intro: bilingual("From public Earth observations to a crop rotation you can question. The planner calculates; AI helps explain. Neither replaces your judgment or local agronomic advice.", "De observaciones públicas de la Tierra a una rotación de cultivos que puedes cuestionar. El planificador calcula; la IA ayuda a explicar. Ninguno sustituye tu criterio ni el asesoramiento agronómico local."),
  architecture: bilingual("Architecture and data flow", "Arquitectura y flujo de datos"),
  flowTitles: [bilingual("When you ask for a plan", "Cuando pides un plan"), bilingual("Working in the background", "Trabajo en segundo plano"), bilingual("Growing the research library", "Ampliar la biblioteca de investigación")],
  flows: [
    [bilingual("Farmer · browser / phone", "Agricultor · navegador / teléfono"), bilingual("Static assets · React dashboard", "Archivos estáticos · panel React"), bilingual("Worker API · web + Twilio", "API Worker · web + Twilio"), bilingual("Planner · calculated, not AI", "Planificador · cálculo, no IA"), bilingual("Plan explanation · RAG", "Explicación del plan · RAG"), bilingual("Sprout · tools", "Sprout · herramientas"), bilingual("Phone agent · tools", "Agente telefónico · herramientas"), bilingual("AI Gateway → Workers AI", "AI Gateway → Workers AI"), bilingual("Gemini · phone / Sprout backup", "Gemini · teléfono / respaldo"), bilingual("D1 cache · Vectorize research", "Caché D1 · textos en Vectorize")],
    [bilingual("Cron · hourly + daily", "Cron · cada hora y cada día"), bilingual("Field Watch · Agents SDK", "Field Watch · Agents SDK"), bilingual("Durable Objects · saved checks", "Durable Objects · revisiones"), bilingual("NASA refresh Workflow", "Workflow de actualización NASA"), bilingual("Fetch → validate → publish", "Obtener → validar → publicar"), bilingual("R2 evidence + D1 snapshots", "Evidencia R2 + registros D1"), bilingual("Vectorize · optional context", "Vectorize · contexto opcional")],
    [bilingual("R2 upload · docs/", "Carga en R2 · docs/"), bilingual("R2 object-create event", "Evento de creación en R2"), bilingual("Queue · soilsense-docs", "Cola · soilsense-docs"), bilingual("Document Workflow", "Workflow de documentos"), bilingual("Extract → chunk → hash", "Extraer → dividir → hash"), bilingual("Human review · wait for approval", "Revisión humana · aprobación"), bilingual("Workers AI · embed via Gateway", "Workers AI · vectores vía Gateway"), bilingual("Vectorize + D1 source passages", "Vectorize + textos fuente en D1")],
  ],
  flowAlternative: bilingual("Browser and Twilio callers reach the Worker API. The deterministic planner replays historical weather and ranks rotations; plan explanations retrieve research (RAG) without changing the plan. Sprout and the phone agent call tools, including the same planner and research search. Sprout uses Workers AI through AI Gateway, with a Gemini backup; the phone agent uses Gemini. Cron starts hourly Field Watch checks in per-field Durable Objects and a daily NASA refresh Workflow that validates data before saving R2 evidence and D1 snapshots. These are parallel jobs, not a sequence. In the document pipeline, an R2 upload emits an object-create notification to a Queue, which starts a Workflow. After extraction and chunking it waits for human approval; only approved passages are embedded with Workers AI (via Gateway when configured) and indexed in Vectorize, with exact source text and review state in D1. Research can support explanations, chats and optional Field Watch notes; it never changes the fixed alert rule.", "El navegador y las llamadas de Twilio llegan a la API Worker. El planificador determinista reproduce el clima histórico y ordena rotaciones; las explicaciones buscan investigación (RAG) sin cambiar el plan. Sprout y el agente telefónico usan herramientas, incluido el mismo planificador y la búsqueda de textos. Sprout usa Workers AI mediante AI Gateway, con Gemini de respaldo; el agente telefónico usa Gemini. Cron inicia revisiones horarias de Field Watch en Durable Objects por parcela y un Workflow diario de NASA que valida los datos antes de guardar evidencia en R2 y registros en D1. Son tareas paralelas, no una secuencia. En la biblioteca, una carga en R2 emite una notificación de creación a una cola, que inicia un Workflow. Tras extraer y dividir el texto, espera la aprobación humana; solo los textos aprobados se convierten en vectores mediante Workers AI (vía Gateway si está configurado) y se indexan en Vectorize, con el texto exacto y el estado de revisión en D1. La investigación apoya explicaciones, conversaciones y notas opcionales de Field Watch; nunca cambia la regla fija de alertas."),
  flowDescriptions: [
    bilingual("Users reach the Worker API, which fans out to the planner, research explanations, Sprout and phone tools. Workers AI calls can use AI Gateway; the phone model is Gemini. D1 caches data and Vectorize retrieves research.", "Los usuarios llegan a la API Worker, que conecta el planificador, las explicaciones, Sprout y las herramientas telefónicas. Workers AI puede usar AI Gateway; el modelo telefónico es Gemini. D1 guarda la caché y Vectorize busca investigación."),
    bilingual("Cron starts two independent jobs: Field Watch agents in Durable Objects, and the NASA refresh Workflow. Refresh publishes validated R2 evidence and D1 snapshots. Field Watch can retrieve optional Vectorize context.", "Cron inicia dos tareas independientes: agentes Field Watch en Durable Objects y el Workflow de actualización NASA. La actualización publica evidencia validada en R2 y registros en D1. Field Watch puede buscar contexto opcional en Vectorize."),
    bilingual("Document upload to R2 triggers an event and Queue. The Workflow extracts and chunks text, waits for human approval, then embeds approved passages with Workers AI and indexes them in Vectorize; exact source text remains in D1.", "La carga en R2 activa un evento y una cola. El Workflow extrae y divide texto, espera aprobación humana, convierte los textos aprobados en vectores con Workers AI y los indexa en Vectorize; el texto fuente exacto queda en D1."),
  ],
  textAlternative: bilingual("Read the diagram as text", "Leer el diagrama como texto"),
  diagramNote: bilingual("Arrows show data or request flow. The background panel contains parallel scheduled jobs; not every service calls the next box. Details in the text alternative.", "Las flechas muestran el flujo de datos o solicitudes. El panel de segundo plano contiene tareas programadas paralelas; no todos los servicios llaman al siguiente recuadro. Más detalles en la alternativa textual."),
  products: bilingual("Which Cloudflare product does what", "Qué hace cada producto de Cloudflare"),
  productCaption: bilingual("Products selected from the checked-in wrangler.jsonc; bindings describe configuration, not proof of a live deployment. Event notifications are account setup documented in INGEST.md; AI Gateway is selected in code, not a separate binding.", "Productos seleccionados de wrangler.jsonc; los enlaces describen la configuración, no demuestran un despliegue activo. Las notificaciones son configuración de cuenta documentada en INGEST.md; AI Gateway se selecciona en el código, no mediante un enlace independiente."),
  product: bilingual("Product / binding", "Producto / enlace"),
  use: bilingual("Used in SoilSense", "Uso en SoilSense"),
  source: bilingual("Source", "Fuente"),
  limits: bilingual("Limits and scope", "Límites y alcance"),
  sources: bilingual("Where the data comes from", "De dónde vienen los datos"),
  sourcesIntro: bilingual("Core inputs, optional evidence and map-only layers are distinguished below. A point lookup is not a field measurement. The planner accepts locations in the contiguous United States.", "Abajo se distinguen los datos principales, la evidencia opcional y las capas solo cartográficas. Una consulta puntual no es una medición de la parcela. El planificador acepta ubicaciones de los Estados Unidos contiguos."),
  validation: bilingual("How we check ourselves", "Cómo comprobamos los resultados"),
  validationIntro: bilingual("Recorded out-of-sample test: model frozen before evaluation, 13 previously unseen counties, 43 county–crop cases, four crops, 12–35 years per case. These compare detrended county yields with historical model estimates, not next-season forecasts.", "Prueba registrada fuera de muestra: modelo fijado antes de evaluar, 13 condados no usados antes, 43 casos de condado y cultivo, cuatro cultivos y 12–35 años por caso. Compara rendimientos de condado sin tendencia con estimaciones históricas, no pronósticos de la próxima temporada."),
  metrics: [
    bilingual("0.41 average Pearson correlation", "0.41 de correlación de Pearson media"),
    bilingual("42 of 43 cases: positive correlation (right direction)", "42 de 43 casos: correlación positiva (dirección correcta)"),
    bilingual("33 of 43 cases beat rainfall-only (0.41 vs 0.21 average)", "33 de 43 casos superan usar solo lluvia (media de 0.41 frente a 0.21)"),
    bilingual("OpenET: average modelled water use within 6% on one Finney County, KS center-pivot field, 2016–2024; year-to-year correlation 0.88", "OpenET: uso medio de agua modelado dentro del 6% en una parcela con pivote central de Finney, Kansas, 2016–2024; correlación interanual de 0.88"),
  ],
  validationLimits: bilingual("County averages are not field-level accuracy. Recent yield records can mix irrigated and rain-fed fields. Winter wheat is the weakest crop; no agronomist or farmer review yet. OpenET is a separate, single-field water-use check, not validation of every rotation. Field Watch's exploratory backtest is separate and does not establish live alert accuracy.", "Los promedios de condado no miden la precisión por parcela. Los registros recientes pueden mezclar riego y secano. El trigo de invierno es el cultivo más débil; aún no hay revisión de agricultores ni agrónomos. OpenET es una comprobación independiente del uso de agua en una sola parcela, no una validación de todas las rotaciones. El análisis exploratorio de Field Watch es independiente y no establece la precisión de alertas en vivo."),
  validationLink: bilingual("Read the recorded validation and its limits", "Leer la validación registrada y sus límites"),
};
export const howItWorksProducts = {
  main: bilingual("Hono API, deterministic rotation engine, Twilio webhooks and phone-agent WebSocket.", "API Hono, motor determinista de rotaciones, webhooks de Twilio y WebSocket telefónico."),
  assets: bilingual("ASSETS serves the built React dashboard; API and voice requests run the Worker first.", "ASSETS sirve el panel React compilado; las solicitudes de API y voz pasan primero por el Worker."),
  d1_databases: bilingual("DB: upstream cache, plans/calls, published refresh snapshots, document chunks and review state.", "DB: caché de fuentes, planes/llamadas, registros de actualización, textos de documentos y revisiones."),
  r2_buckets: bilingual("EVIDENCE stores fingerprinted NASA bundles; DOCS stores uploads, extracted text and manifests. DOCS object-create notifications feed the document queue (account-side setup).", "EVIDENCE guarda paquetes NASA con huella; DOCS guarda cargas, texto extraído y manifiestos. Las notificaciones de creación en DOCS alimentan la cola (configuración de cuenta)."),
  queues: bilingual("DOC_QUEUE / soilsense-docs buffers R2 notifications and starts a version-specific document Workflow; bounded retries, no dead-letter queue configured.", "DOC_QUEUE / soilsense-docs almacena notificaciones R2 e inicia un Workflow por versión; reintentos limitados, sin cola de mensajes fallidos configurada."),
  workflows: bilingual("POWER_REFRESH fetches, validates and publishes NASA snapshots; DOC_INGEST extracts/chunks documents, waits for review, then embeds and indexes approved text.", "POWER_REFRESH obtiene, valida y publica registros NASA; DOC_INGEST extrae/divide documentos, espera revisión e indexa el texto aprobado."),
  durable_objects: bilingual("FIELD_AGENT: Agents SDK, one SQLite-backed Field Watch agent per watched field. LIVE_ROOM streams call and field-check events to the dashboard.", "FIELD_AGENT: Agents SDK, un agente Field Watch con SQLite por parcela vigilada. LIVE_ROOM transmite eventos de llamadas y revisiones al panel."),
  triggers: bilingual("17 * * * * checks watched fields hourly; 43 5 * * * starts NASA refresh daily at 05:43 UTC.", "17 * * * * revisa las parcelas cada hora; 43 5 * * * inicia la actualización NASA a las 05:43 UTC cada día."),
  ai: bilingual("AI runs plan Q&A, Sprout, research explanations and embeddings; PDF conversion uses toMarkdown. The planner itself is not an AI model.", "AI ejecuta preguntas del plan, Sprout, explicaciones y vectores de investigación; toMarkdown convierte PDF. El planificador no es un modelo de IA."),
  vectorize: bilingual("RESEARCH_INDEX retrieves crop-filtered research passages for explanations, chat tools and optional Field Watch notes. Exact text stays in the corpus or D1.", "RESEARCH_INDEX busca textos por cultivo para explicaciones, conversaciones y notas opcionales de Field Watch. El texto exacto permanece en el corpus o D1."),
  gateway: bilingual("AI Gateway is passed in Workers AI call options (AI_GATEWAY_ID, with route defaults); not a wrangler binding. Centralizes AI request observability; calls without a configured or route-default ID bypass it.", "AI Gateway se pasa en las opciones de Workers AI (AI_GATEWAY_ID, con valores predeterminados por ruta); no es un enlace de wrangler. Centraliza la observación de solicitudes; las llamadas sin ID configurado ni predeterminado por ruta lo omiten."),
  ratelimits: bilingual("SCOUT_LIMITER caps public Sprout requests at 20 per visitor IP per minute; this is not a universal API quota.", "SCOUT_LIMITER limita Sprout a 20 solicitudes por IP de visitante por minuto; no es una cuota universal de API."),
};
// Inventory checked against README, service.ts, data clients and the cited evidence modules.
export const howItWorksSources = [
  { name: "NASA GRACE / GRACE-FO · JPL mascons", url: "https://doi.org/10.5067/TEMSC-3JC634", use: bilingual("Stored regional total-water-storage anomalies compared descriptively with selected Kansas wells.", "Anomalías regionales guardadas del agua total, comparadas descriptivamente con pozos seleccionados de Kansas."), limits: bilingual("Finney demo only; roughly 3° mascon support, not independent 0.5° field pixels. Includes soil water, surface water and snow, not groundwater alone.", "Solo demostración de Finney; soporte de mascon de unos 3°, no píxeles independientes de parcela de 0.5°. Incluye agua del suelo, superficial y nieve, no solo acuíferos.") },
  { name: "Kansas Geological Survey · WIZARD", url: "https://geohydro.kgs.ku.edu/geohydro/wizard/", use: bilingual("Stored well-level measurements paired by available month with GRACE in the Finney demonstration.", "Mediciones guardadas de pozos emparejadas por mes disponible con GRACE en la demostración de Finney."), limits: bilingual("Selected nearby wells; missing months stay missing. Agreement in direction does not validate a mascon or predict your own well.", "Pozos cercanos seleccionados; los meses ausentes siguen ausentes. Coincidir en dirección no valida un mascon ni predice tu pozo.") },
  { name: "SoilSense Kansas · R2", url: "https://pub-fe3948f31a9c462890b089ed5356c336.r2.dev/app_rotation_advice.json", use: bilingual("Separate weather-only model ranks K-State dryland rotations for a second opinion and supplies Field Watch county context.", "Un modelo independiente basado solo en clima ordena rotaciones de secano de K-State como segunda opinión y aporta contexto de condado a Field Watch."), limits: bilingual("Kansas only; not the main planner or a profitability guarantee. Read the file's data-through date; a saved copy is labelled when the live file fails.", "Solo Kansas; no es el planificador principal ni garantía de rentabilidad. Revisa la fecha de datos; se identifica la copia guardada si falla el archivo remoto.") },
  { name: "NASA POWER", url: "https://power.larc.nasa.gov/", use: bilingual("Core daily rain, temperature and root-zone wetness; historical climate trends and crop-stress replay.", "Lluvia, temperatura y humedad radicular diarias; tendencias históricas y simulación de estrés."), limits: bilingual("MERRA-2 grid 0.5° × 0.625° (roughly 50–55 km), not a field weather station; history from 1991.", "Malla MERRA-2 de 0.5° × 0.625° (unos 50–55 km), no estación de la parcela; historial desde 1991.") },
  { name: "NASA / ORNL Daymet", url: "https://daymet.ornl.gov/", use: bilingual("Core weather: averaged with POWER when available; POWER-only fallback otherwise.", "Clima principal: se promedia con POWER si está disponible; si no, solo POWER."), limits: bilingual("1 km, North American station-derived grid; finer resolution is not a field measurement.", "Malla de 1 km derivada de estaciones de Norteamérica; no es una medición de la parcela.") },
  { name: "USDA NRCS SSURGO", url: "https://sdmdataaccess.sc.egov.usda.gov/", use: bilingual("Soil drainage, texture, pH, organic matter and available water capacity.", "Drenaje, textura, pH, materia orgánica y capacidad de agua disponible del suelo."), limits: bilingual("U.S. soil-survey map units, not a fresh soil test; typical values are used when unavailable.", "Unidades cartográficas de suelo de EE. UU., no análisis reciente; se usan valores típicos si faltan datos.") },
  { name: "USDA Cropland Data Layer", url: "https://nassgeodata.gmu.edu/CropScape/", use: bilingual("Recent crop-history lookup for rotation continuity.", "Consulta del historial reciente de cultivos para continuar la rotación."), limits: bilingual("Annual 30 m classification; U.S. only; the farmer must confirm this season's crop.", "Clasificación anual de 30 m; solo EE. UU.; el agricultor debe confirmar el cultivo actual.") },
  { name: "USDA NASS Quick Stats", url: "https://quickstats.nass.usda.gov/", use: bilingual("Optional runtime county yields and crop prices; recorded yields also support offline validation.", "Rendimientos de condado y precios opcionales; los rendimientos registrados también permiten validar sin conexión."), limits: bilingual("Runtime needs NASS_API_KEY. County averages, not field yields; recent records can combine irrigation and rain-fed farming.", "Requiere NASS_API_KEY en ejecución. Promedios de condado, no de parcela; registros recientes pueden mezclar riego y secano.") },
  { name: "USDA RMA Cause of Loss", url: "https://www.rma.usda.gov/tools-reports/summary-of-business/cause-loss", use: bilingual("Saved county crop-insurance loss records give context for bad harvest years.", "Registros guardados de pérdidas aseguradas por condado contextualizan las malas cosechas."), limits: bilingual("County insurance payouts, not all farm losses and not measured stress on this field.", "Indemnizaciones de condado, no todas las pérdidas ni estrés medido en esta parcela.") },
  { name: "OpenET", url: "https://etdata.org/", use: bilingual("Optional satellite evapotranspiration check and irrigation context; independent recorded water-use validation.", "Comprobación opcional de evapotranspiración y contexto de riego; validación independiente registrada del uso de agua."), limits: bilingual("Needs OPENET_API_KEY for runtime; 30 m point pixels, since 2016. Published within-6% result is one Kansas field.", "Requiere OPENET_API_KEY en ejecución; píxeles puntuales de 30 m desde 2016. El resultado del 6% corresponde a una parcela de Kansas.") },
  { name: "FCC Area API", url: "https://geo.fcc.gov/api/census/", use: bilingual("County / FIPS lookup to label a location and join county statistics.", "Consulta de condado / FIPS para identificar la ubicación y vincular estadísticas."), limits: bilingual("U.S. administrative geography, not a field boundary.", "Geografía administrativa de EE. UU., no límites de parcela.") },
  { name: "Zippopotam.us", url: "https://www.zippopotam.us/", use: bilingual("ZIP-to-location lookup for the planner, Sprout and phone calls.", "Consulta de ubicación por código postal para el planificador, Sprout y llamadas."), limits: bilingual("A ZIP location is approximate; confirm the field on the map.", "La ubicación postal es aproximada; confirma la parcela en el mapa.") },
  { name: "U.S. Drought Monitor", url: "https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx", use: bilingual("Weekly county drought context alongside Field Watch and historical evidence.", "Contexto semanal de sequía por condado junto a Field Watch y evidencia histórica."), limits: bilingual("County area statistics; regional context is not field-level drought confirmation.", "Estadísticas de superficie por condado; el contexto regional no confirma sequía en la parcela.") },
  { name: "NASA MODIS MOD13Q1.061 / ORNL DAAC", url: "https://modis.ornl.gov/rst/api/v1/MOD13Q1", use: bilingual("Supplemental historical vegetation greenness (NDVI) evidence with strict quality screening.", "Evidencia histórica complementaria del verdor (NDVI), con control estricto de calidad."), limits: bilingual("250 m nominal point pixel, 16-day composites; unknown field-area coverage. Low NDVI does not prove bare soil; unavailable is not zero.", "Píxel puntual nominal de 250 m, compuestos de 16 días; cobertura de parcela desconocida. NDVI bajo no prueba suelo desnudo; sin datos no equivale a cero.") },
  { name: "NASA SMAP SPL4SMGP v008", url: "https://nsidc.org/data/spl4smgp/versions/8", use: bilingual("Stored, provenance-labelled soil-moisture evidence for selected demo locations.", "Evidencia guardada de humedad del suelo con procedencia para ubicaciones de demostración."), limits: bilingual("9 km, 3-hour model-assimilated estimates; Finney demo subset only. Not a field probe or an input to rotation ranking.", "Estimaciones asimiladas de 9 km y 3 horas; solo subconjunto de Finney. No es sonda de parcela ni entrada a la clasificación de rotaciones.") },
  { name: "NASA GIBS · MODIS Terra", url: "https://gibs.earthdata.nasa.gov/", use: bilingual("Map-only satellite backdrop when locating a field.", "Fondo satelital solo cartográfico para localizar la parcela."), limits: bilingual("True-color imagery is not used to calculate rotation scores or measure soil moisture.", "Las imágenes en color real no calculan las puntuaciones de rotación ni miden humedad del suelo.") },
  { name: "USGS National Map", url: "https://www.usgs.gov/programs/national-geospatial-program/national-map", use: bilingual("Map-only close-up aerial imagery for finding field edges.", "Imágenes aéreas de detalle solo cartográficas para encontrar bordes de parcela."), limits: bilingual("A location aid, not a crop-history or crop-health observation used by the planner.", "Ayuda para ubicarse, no observación de historial ni salud de cultivos usada por el planificador.") },
  { name: "OpenStreetMap", url: "https://www.openstreetmap.org/", use: bilingual("Map-only roads, towns and place labels.", "Carreteras, pueblos y nombres de lugares solo cartográficos."), limits: bilingual("Map context, not an agronomic input or a surveyed field boundary.", "Contexto cartográfico, no entrada agronómica ni límite de parcela levantado por topografía.") },
  { name: "K-State · limited-irrigation rotations", url: "https://ksu.janeway.systems/kaesrr/article/7218/galley/7152/download", use: bilingual("Curated verbatim research for cited explanations and agent research tools.", "Investigación textual seleccionada para explicaciones con citas y herramientas de agentes."), limits: bilingual("Tribune, Kansas; no-till, 10 in/year limited irrigation. Context, not a universal treatment recommendation.", "Tribune, Kansas; siembra directa y riego limitado de 10 pulgadas/año. Contexto, no recomendación universal.") },
  { name: "K-State · Corn Rootworms", url: "https://entomology.k-state.edu/extension/crop-protection/corn/cornrootworm.html", use: bilingual("Curated research on corn rootworm and crop rotation.", "Investigación seleccionada sobre gusano de la raíz del maíz y rotación."), limits: bilingual("Regional extension context; retrieval relevance is not agronomic confidence.", "Contexto regional de extensión; la relevancia de búsqueda no es confianza agronómica.") },
  { name: "SARE · Building Soils for Better Crops", url: "https://www.sare.org/publications/building-soils-for-better-crops/diversifying-cropping-systems", use: bilingual("Curated passages on diversifying cropping systems.", "Textos seleccionados sobre diversificación de sistemas de cultivo."), limits: bilingual("General research context; not evidence that a specific field will achieve a stated return.", "Contexto general; no demuestra que una parcela obtendrá una rentabilidad concreta.") },
];
export type TranslationKey = keyof typeof messages;
export const english = Object.fromEntries(Object.keys(messages).map((key) => [key, key])) as Record<TranslationKey, string>;
english["Decision notice"] = "SoilSense helps explore options using NASA data and research. It supports the farmer’s judgment together with local agronomist and extension advice; it is not a forecast or a guarantee.";
english["Low return warning"] = "At today's prices, none of the rotations we compared reliably makes money on this field without irrigation. This plan is the best balance of cost, risk and soil: it fails less often and protects the ground until prices or water improve.";
english["Lower return tradeoff"] = "On average this plan earns about ${less}/acre a year less than what you do now. We suggest it because it is better for your soil and fits your goal.";
english["Risk return tradeoff"] = "On average your current crops earn about ${less}/acre a year more, because their good years pay very well. But those good years are rare here: your current crops come through in about {now} of 10 years, this plan in about {ours}. A few bad years in a row cost far more than that average difference.";
export const dictionaries = { en: english, es: messages };
/** Translate fixed metadata/enum labels at their render site; unknown provider text is preserved. */
export function translateKnown(language: Language, value: string): string {
  return Object.hasOwn(messages, value) ? translate(language, value as TranslationKey) : value;
}
export function translate(language: Language, key: TranslationKey, values: Record<string, string | number> = {}): string {
  return dictionaries[language][key].replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
export const LANGUAGE_STORAGE_KEY = "soilsense.language";
function initialLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "es" ? "es" : "en"; } catch { return "en"; }
}
const defaultLanguage = { language: "en" as Language, setLanguage: (_language: Language) => {} };
const LanguageContext = createContext<typeof defaultLanguage | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const parent = useContext(LanguageContext);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    if (parent) return;
    const doc = (globalThis as { document?: { documentElement: { lang: string } } }).document;
    if (doc) doc.documentElement.lang = language;
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Storage can be blocked in private browsers. */ }
  }, [language, parent]);
  if (parent) return children;
  return createElement(LanguageContext.Provider, { value: { language, setLanguage } }, children);
}
export function useI18n() {
  const context = useContext(LanguageContext) ?? defaultLanguage;
  return { ...context, t: (key: TranslationKey, values?: Record<string, string | number>) => translate(context.language, key, values), text: (value: string | null | undefined) => translateKnown(context.language, value ?? "") };
}
export const cropKeys: Record<CropId, TranslationKey> = {
  corn: "Corn", soybean: "Soybean", winter_wheat: "Winter wheat", oats: "Oats", alfalfa: "Alfalfa / hay", sorghum: "Grain sorghum", fallow: "Fallow (no crop)",
};
export function cropName(crop: CropId, language: Language): string { return translate(language, cropKeys[crop]); }
/** Crop IDs and display names from providers share the same agricultural vocabulary. */
export function cropText(value: string, language: Language): string {
  if (language === "en") return Object.hasOwn(cropKeys, value) ? cropName(value as CropId, language) : value;
  const normalized = value.toLowerCase().replaceAll(" ", "_");
  const aliases: Record<string, CropId> = { wheat: "winter_wheat", grain_sorghum: "sorghum", "alfalfa_/_hay": "alfalfa", "alfalfa_(hay)": "alfalfa", "fallow_(no_crop)": "fallow" };
  const crop = aliases[normalized] ?? normalized;
  return Object.hasOwn(cropKeys, crop) ? cropName(crop as CropId, language) : translateKnown(language, value);
}
export function rotationText(value: string, language: Language): string {
  if (language === "es" && value.startsWith("Current pattern: ")) return `Práctica actual: ${rotationText(value.slice("Current pattern: ".length), language)}`;
  return value.split(" → ").map(crop => cropText(crop, language)).join(" → ");
}
export const coverNames: Record<string, string> = { cereal_rye: "centeno", crimson_clover: "trébol encarnado", hairy_vetch: "veza vellosa", none: "sin cultivo de cobertura" };

/** Complete templates from the deterministic Field Watch rules; never used for research or model text. */
export function watchText(value: string, language: Language): string {
  if (language === "en") return value;
  if (value.startsWith("Historical replay: ")) return `${translate(language, "Historical replay")}: ${watchText(value.slice(19), language)}`;
  const rules: [RegExp, TranslationKey, string[]][] = [
    [/^Kansas weekly outlook for (.+) \(data through (\d{4}-\d{2}-\d{2}), context only\): alert "(.*)"\.$/, 'Kansas weekly outlook for {county} (data through {date}, context only): alert "{alert}".', ["county", "date", "alert"]],
    [/^Not enough recent NASA data to check (.+)$/, "Not enough recent NASA data to check {field}", ["field"]],
    [/^Not enough past years to judge (.+)$/, "Not enough past years to judge {field}", ["field"]],
    [/^Check failed for (.+): a data service didn't answer$/, "Check failed for {field}: a data service didn't answer", ["field"]],
    [/^Dry spell starting: ([\d.]+) in of rain in 14 days, drier than (\d+)% of past years, and soil drier than usual \((\d+)(?:st|nd|rd|th) percentile\)$/, "Dry spell starting: {rain} in of rain in 14 days, drier than {pct}% of past years, and soil drier than usual ({root} percentile)", ["rain", "pct", "root"]],
    [/^Watch: rain below normal \(([\d.]+) in in 14 days\)$/, "Watch: rain below normal ({rain} in in 14 days)", ["rain"]],
    [/^Watch: rain below normal \(([\d.]+) in in 14 days\), soil unconfirmed$/, "Watch: rain below normal ({rain} in in 14 days), soil unconfirmed", ["rain"]],
    [/^Watch: soil drier than usual \((\d+)(?:st|nd|rd|th) percentile\)$/, "Watch: soil drier than usual ({pct} percentile)", ["pct"]],
    [/^OK: ([\d.]+) in of rain in 14 days, wetter than usual for this time of year$/, "OK: {rain} in of rain in 14 days, wetter than usual for this time of year", ["rain"]],
    [/^OK: ([\d.]+) in of rain in 14 days, near normal for this time of year$/, "OK: {rain} in of rain in 14 days, near normal for this time of year", ["rain"]],
    [/^NASA POWER has no complete (\d+)-day stretch of rain in the last (\d+) days\.$/, "NASA POWER has no complete {days}-day stretch of rain in the last {lookback} days.", ["days", "lookback"]],
    [/^Root-zone soil wetness \(7 days to ([A-Z][a-z]{2} \d{1,2})\): (\d+)(?:st|nd|rd|th) percentile for this time of year\.$/, "Root-zone soil wetness (7 days to {date}): {pct} percentile for this time of year.", ["date", "pct"]],
    [/^Water balance (.+): not shown, because NASA POWER is missing temperature for some of these days\.$/, "Water balance {span}: not shown, because NASA POWER is missing temperature for some of these days.", ["span"]],
    [/^Only (\d+) past years have complete rain for (.+); at least (\d+) are needed\.$/, "Only {count} past years have complete rain for {span}; at least {minimum} are needed.", ["count", "span", "minimum"]],
    [/^Rain (.+): ([\d.]+) in, drier than (\d+)% of the same two weeks in (\d{4}–\d{4}) \(typical: ([\d.]+) in\)\.$/, "Rain {span}: {rain} in, drier than {pct}% of the same two weeks in {years} (typical: {normal} in).", ["span", "rain", "pct", "years", "normal"]],
    [/^Rain (.+): ([\d.]+) in, wetter than (\d+)% of the same two weeks in (\d{4}–\d{4}) \(typical: ([\d.]+) in\)\.$/, "Rain {span}: {rain} in, wetter than {pct}% of the same two weeks in {years} (typical: {normal} in).", ["span", "rain", "pct", "years", "normal"]],
    [/^Rain (.+): ([\d.]+) in, about normal for these two weeks in (\d{4}–\d{4}) \((\d+)(?:st|nd|rd|th) percentile\) \(typical: ([\d.]+) in\)\.$/, "Rain {span}: {rain} in, about normal for these two weeks in {years} ({pct} percentile) (typical: {normal} in).", ["span", "rain", "years", "pct", "normal"]],
    [/^Water balance (.+) \(context only\): rain minus estimated crop water demand is ([+−][\d.]+) in \(demand ([\d.]+) in, FAO-56 Hargreaves\)\.$/, "Water balance {span} (context only): rain minus estimated crop water demand is {balance} in (demand {demand} in, FAO-56 Hargreaves).", ["span", "balance", "demand"]],
    [/^Water balance (.+) \(context only\): rain minus estimated crop water demand is about even \(demand ([\d.]+) in, FAO-56 Hargreaves\)\.$/, "Water balance {span} (context only): rain minus estimated crop water demand is about even (demand {demand} in, FAO-56 Hargreaves).", ["span", "demand"]],
    [/^Weekly checks need a 14-day window ending within (\d+) days of the check; this one ends (.+)\.$/, "Weekly checks need a 14-day window ending within {days} days of the check; this one ends {date}.", ["days", "date"]],
    [/^(.+)'s reference stress window \((\d{2}-\d{2}) to (\d{2}-\d{2})\) isn't open, so no stress check this week$/, "{crop}'s reference stress window ({from} to {to}) isn't open, so no stress check this week", ["crop", "from", "to"]],
    [/^(.+) reference stress window (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2}) opened: checking current conditions\. This is an estimate from crop defaults, not an observed crop stage, and not a forecast\.$/, "{crop} reference stress window {from} to {to} opened: checking current conditions. This is an estimate from crop defaults, not an observed crop stage, and not a forecast.", ["crop", "from", "to"]],
    [/^NASA POWER has no rain value for (.+) in the replay window\.$/, "NASA POWER has no rain value for {dates} in the replay window.", ["dates"]],
    [/^Not enough fresh NASA data for (.+): the latest complete 14 days end (.+)$/, "Not enough fresh NASA data for {field}: the latest complete 14 days end {date}", ["field", "date"]],
    [/^not enough NASA data for (.+)$/, "not enough NASA data for {field}", ["field"]],
  ];
  for (const [pattern, key, names] of rules) {
    const match = pattern.exec(value);
    if (!match) continue;
    const values = Object.fromEntries(names.map((name, i) => {
      let text = match[i + 1]!;
      if (name === "crop") text = cropText(text, language).toLowerCase();
      if (name === "span" || name === "date") text = text.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, month => translateKnown(language, month));
      return [name, translateKnown(language, text)];
    }));
    return translate(language, key, values);
  }
  return translateKnown(language, value);
}
