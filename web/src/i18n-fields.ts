export const fieldMessages = {
  'Choose public field outlines': 'Elegir contornos públicos de parcelas',
  'CSB outlines are synthetic crop boundaries, not ownership or tax parcels. Coverage tonight: about 3 × 3 km around each demo farm only.': 'Los contornos CSB son límites sintéticos de cultivos, no de propiedad ni parcelas fiscales. Cobertura esta noche: unos 3 × 3 km alrededor de cada finca de ejemplo.',
  'Boundary area': 'Zona de contornos',
  'Show boundaries on map': 'Mostrar contornos en el mapa',
  'Click an outline to select it. Shift/Ctrl-click to add or remove; or use the checkboxes below.': 'Haz clic en un contorno para elegirlo. Mayús/Ctrl-clic para añadir o quitar; o usa las casillas de abajo.',
  'Loading field outlines…': 'Cargando contornos de parcelas…',
  'Field outlines unavailable. Choose an area to retry.': 'Contornos no disponibles. Elige una zona para reintentar.',
  'Fields in this area': 'Parcelas de esta zona',
  'Selected fields': 'Parcelas seleccionadas',
  '{count} fields · {acres} acres total': '{count} parcelas · {acres} acres en total',
  '{acres} acres': '{acres} acres',
  'Add shared-edge neighbours': 'Añadir vecinas con borde compartido',
  'Clear field selection': 'Borrar selección de parcelas',
  'No fields selected.': 'No hay parcelas seleccionadas.',
  'CSB crop sequence (2018–2025)': 'Secuencia de cultivos CSB (2018–2025)',
  'Use this field centroid for the plan': 'Usar el centroide de esta parcela para el plan',
  'Selection does not change the planning point unless you choose the centroid button. Crop history remains the existing point-based history.': 'La selección no cambia el punto del plan salvo que elijas el botón del centroide. El historial sigue siendo el historial del punto existente.',
  'Nearby fields share coarse NASA POWER weather (~50 km); outlines do not make weather field-scale.': 'Las parcelas cercanas comparten el clima de NASA POWER (~50 km); los contornos no hacen que el clima sea a escala de parcela.',
  'Source and limitations': 'Fuente y limitaciones',
  'Remove selected field': 'Quitar parcela seleccionada',
} as const;

export const csbCropSpanish: Record<number, string> = {
  1:'Maíz',4:'Sorgo',5:'Soja',12:'Maíz dulce',24:'Trigo de invierno',28:'Avena',36:'Alfalfa',37:'Otro heno (sin alfalfa)',61:'Barbecho/tierras sin cultivar',121:'Urbanizado/espacio abierto',131:'Suelo desnudo',141:'Bosque caducifolio',176:'Pastizal/pasto',205:'Triticale',
};
