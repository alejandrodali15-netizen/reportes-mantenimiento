// =============================================================
// CONFIGURACIÓN DEL FRONTEND
// =============================================================
// URL de la aplicación web de Apps Script (Implementar > Nueva
// implementación > Aplicación web). Mientras esté vacía, la página muestra
// un aviso en lugar de intentar conectarse.
window.APP_CONFIG = {
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxpzeod7w__6Dfd2Wv-Yyavql_jam3vBYpL_oJfXHVii6XE4Bs43eovQe15jECL6y_epA/exec',
  VERSION: '1.0.0',
  // Clave del hospital activo en js/hospitales.js (membrete de documentos).
  HOSPITAL: 'rioverde',
  // Hora de México: UTC-6 fijo todo el año (sin horario de verano).
  UTC_OFFSET_HORAS: 6
};
