// =============================================================
// DOCUMENTOS IMPRIMIBLES: tiquete de servicio y orden de trabajo
// =============================================================
// Mismo formato que la plataforma de Biomédica (membrete IMSS Bienestar +
// logo del hospital). Todo lo que viene de datos pasa por esc() antes de
// insertarse. La orden usa solo tablas (sin flex) porque el mismo HTML se
// convierte a PDF en Apps Script al validar el cierre.
(function () {
  var cfg = window.APP_CONFIG;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escO(v) { return v ? esc(v) : '&mdash;'; }
  function nl2br(v) { return v ? esc(v).replace(/\n/g, '<br>') : '&mdash;'; }

  // ISO (UTC) -> "2026-10-02 13:05" en hora de México (UTC-6 fijo).
  function fmt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var m = new Date(d.getTime() - cfg.UTC_OFFSET_HORAS * 3600 * 1000);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return m.getUTCFullYear() + '-' + p(m.getUTCMonth() + 1) + '-' + p(m.getUTCDate()) + ' ' + p(m.getUTCHours()) + ':' + p(m.getUTCMinutes());
  }

  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  function hospital() {
    return (window.HOSPITALES || {})[cfg.HOSPITAL] || { nombre: '', departamento: '', logo: '' };
  }

  function membrete(tam) {
    var h = hospital();
    var w = tam === 'chico' ? 72 : 100;
    return '<table class="membrete"><tr>' +
      '<td class="logo"><img src="' + window.LOGO_IMSS + '" alt="IMSS Bienestar" style="max-width:' + w + 'px;max-height:' + Math.round(w * 0.66) + 'px"></td>' +
      '<td class="mtxt"><div class="m1">Servicios P&uacute;blicos de Salud IMSS Bienestar</div>' +
      '<div class="m2">' + esc(String(h.nombre).toUpperCase()) + '</div>' +
      '<div class="m2">' + esc(h.departamento) + '</div></td>' +
      '<td class="logo"><img src="' + h.logo + '" alt="Logo del hospital" style="max-width:' + w + 'px;max-height:' + Math.round(w * 0.66) + 'px"></td>' +
      '</tr></table>';
  }

  var CSS_BASE =
    'body{font-family:Arial,Helvetica,sans-serif;color:#1B2530;margin:0;}' +
    'table.membrete{width:100%;border-collapse:collapse;margin-bottom:6px;}' +
    'table.membrete td{border:none;padding:2px 8px;vertical-align:middle;}' +
    'td.logo{width:110px;text-align:center;} td.mtxt{text-align:center;}' +
    '.m1{font-size:13px;font-weight:bold;} .m2{font-size:11px;color:#333;margin-top:2px;}' +
    '.titulo{border:2px solid #1B2530;text-align:center;font-weight:bold;font-size:13px;padding:6px;margin:0 0 6px;text-transform:uppercase;}' +
    '.sub{text-align:right;font-size:10.5px;color:#555;margin:0 0 10px;}' +
    'table.d{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px;}' +
    'table.d td{padding:5px 7px;border:1px solid #CCD5DD;vertical-align:top;}' +
    'td.k{background:#D9E2F3;font-weight:bold;width:130px;color:#243B55;}' +
    '.caja{border:1px solid #CCD5DD;padding:7px 9px;font-size:12px;margin-bottom:6px;}' +
    'h2{font-size:12.5px;text-transform:uppercase;color:#243B55;border-bottom:2px solid #243B55;padding-bottom:3px;margin:14px 0 8px;}' +
    'table.firmas{width:100%;border-collapse:collapse;margin-top:44px;}' +
    'table.firmas td{width:50%;padding:0 14px;text-align:center;font-size:11px;color:#555;vertical-align:top;}' +
    'table.firmas div{border-top:1px solid #888;padding-top:5px;}';

  // ---------------- Tiquete de servicio (2 copias por hoja) ----------------
  function htmlTiquete(r) {
    function copia(etiqueta) {
      return '<div class="copia"><div class="et">' + esc(etiqueta) + '</div>' +
        membrete('chico') +
        '<div class="titulo">Tiquete de servicio de mantenimiento</div>' +
        '<div class="sub">Folio: ' + esc(r.folio) + ' &nbsp;|&nbsp; Reportado: ' + esc(fmt(r.fecha)) + ' &nbsp;|&nbsp; Impreso: ' + esc(fmt(new Date().toISOString())) + '</div>' +
        '<table class="d">' +
        '<tr><td class="k">&Aacute;rea</td><td>' + escO(r.area) + '</td><td class="k">Lugar</td><td>' + escO(r.espacio) + '</td></tr>' +
        '<tr><td class="k">Tipo de falla</td><td>' + escO(r.categoria) + '</td><td class="k">Prioridad</td><td>' + esc(cap(r.prioridad)) + '</td></tr>' +
        '<tr><td class="k">Reporta</td><td>' + escO(r.reporta) + '</td><td class="k">Extensi&oacute;n</td><td>' + escO(r.extension) + '</td></tr>' +
        '<tr><td class="k">T&eacute;cnico asignado</td><td>' + escO(r.tecnicoNombre) + '</td><td class="k">Asignado</td><td>' + escO(fmt(r.fechaAsignacion)) + '</td></tr>' +
        '</table>' +
        '<div class="caja"><strong>Falla reportada:</strong> ' + nl2br(r.descripcion) + '</div>' +
        '<div class="caja" style="min-height:42px"><strong>Observaciones en sitio:</strong></div>' +
        '<table class="firmas" style="margin-top:30px"><tr><td><div>T&eacute;cnico</div></td><td><div>Recibe / conformidad del &aacute;rea</div></td></tr></table>' +
        '</div>';
    }
    return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Tiquete ' + esc(r.folio) + '</title><style>' + CSS_BASE +
      '@page{size:letter;margin:10mm;} body{padding:6px;}' +
      '.copia{position:relative;border-bottom:2px dashed #999;padding:8px 4px 16px;margin-bottom:16px;page-break-inside:avoid;}' +
      '.copia:last-child{border-bottom:none;margin-bottom:0;}' +
      '.et{position:absolute;top:0;right:4px;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:#888;}' +
      '</style></head><body>' + copia('Copia — Mantenimiento') + copia('Copia — Área / usuario') + '</body></html>';
  }

  // ---------------- Orden de trabajo ----------------
  // fotos = { reporte: [dataUrl...], trabajo: [dataUrl...] }
  function bloqueFotos(titulo, lista) {
    if (!lista || !lista.length) return '';
    var celdas = lista.map(function (src) {
      return '<td style="width:33%;padding:4px;text-align:center;vertical-align:top;"><img src="' + src + '" style="max-width:100%;max-height:170px;border:1px solid #CCD5DD"></td>';
    });
    while (celdas.length % 3) celdas.push('<td style="width:33%"></td>');
    var filas = [];
    for (var i = 0; i < celdas.length; i += 3) filas.push('<tr>' + celdas.slice(i, i + 3).join('') + '</tr>');
    return '<div style="font-size:11.5px;font-weight:bold;margin:6px 0 2px">' + esc(titulo) + '</div><table style="width:100%;border-collapse:collapse">' + filas.join('') + '</table>';
  }

  function htmlOrden(r, o, fotos) {
    fotos = fotos || {};
    var validacion = r.estado === 'Cerrado'
      ? '<tr><td class="k">Validado por</td><td>' + escO(r.validadoPor) + '</td><td class="k">Fecha de cierre</td><td>' + escO(fmt(r.fechaCierre)) + '</td></tr>'
      : '<tr><td class="k">Validaci&oacute;n</td><td colspan="3">Pendiente de validar por Jefatura o Administraci&oacute;n</td></tr>';
    return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Orden de trabajo ' + esc(o.folioOrden) + '</title><style>' + CSS_BASE +
      '@page{size:letter;margin:12mm;} body{padding:10px;}' +
      '</style></head><body>' +
      '<div style="text-align:right;font-size:11px;color:#555">' + esc(o.folioOrden) + '</div>' +
      membrete() +
      '<div class="titulo">Orden de trabajo de mantenimiento</div>' +
      '<div class="sub">Reporte origen: ' + esc(r.folio) + ' &nbsp;|&nbsp; Generado: ' + esc(fmt(new Date().toISOString())) + '</div>' +

      '<h2>Datos del reporte</h2>' +
      '<table class="d">' +
      '<tr><td class="k">Fecha del reporte</td><td>' + escO(fmt(r.fecha)) + '</td><td class="k">Prioridad</td><td>' + esc(cap(r.prioridad)) + '</td></tr>' +
      '<tr><td class="k">&Aacute;rea</td><td>' + escO(r.area) + '</td><td class="k">Lugar</td><td>' + escO(r.espacio) + '</td></tr>' +
      '<tr><td class="k">Tipo de falla</td><td>' + escO(r.categoria) + '</td><td class="k">Reporta</td><td>' + escO(r.reporta) + (r.extension ? ' (ext. ' + esc(r.extension) + ')' : '') + '</td></tr>' +
      '</table>' +
      '<div class="caja"><strong>Falla reportada:</strong><br>' + nl2br(r.descripcion) + '</div>' +
      bloqueFotos('Fotos del reporte', fotos.reporte) +

      '<h2>Atenci&oacute;n t&eacute;cnica</h2>' +
      '<table class="d">' +
      '<tr><td class="k">T&eacute;cnico</td><td>' + escO(o.tecnicoNombre) + '</td><td class="k">Tiempo</td><td>' + escO(o.tiempo) + '</td></tr>' +
      '<tr><td class="k">Terminado</td><td>' + escO(fmt(o.fechaTerminado)) + '</td><td class="k">Estado final</td><td>' + escO(o.estadoFinal) + '</td></tr>' +
      validacion +
      '</table>' +
      '<div class="caja"><strong>Diagn&oacute;stico:</strong><br>' + nl2br(o.diagnostico) + '</div>' +
      '<div class="caja"><strong>Trabajo realizado:</strong><br>' + nl2br(o.trabajo) + '</div>' +
      '<div class="caja"><strong>Materiales utilizados:</strong><br>' + nl2br(o.materiales) + '</div>' +
      (o.observaciones ? '<div class="caja"><strong>Observaciones:</strong><br>' + nl2br(o.observaciones) + '</div>' : '') +
      bloqueFotos('Fotos del trabajo terminado', fotos.trabajo) +

      '<table class="firmas"><tr><td><div>T&eacute;cnico<br>' + escO(o.tecnicoNombre) + '</div></td><td><div>Recibe / conformidad del &aacute;rea</div></td></tr></table>' +
      '<table class="firmas" style="margin-top:40px"><tr><td><div>Vo. Bo. Jefatura de Mantenimiento</div></td><td><div>Vo. Bo. Administraci&oacute;n</div></td></tr></table>' +
      '</body></html>';
  }

  // Abre la ventana ANTES de cualquier espera (await): si se abre después,
  // el navegador la bloquea por no venir directo de un clic.
  function abrirVentana() {
    var w = window.open('', '_blank');
    if (!w) {
      alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.');
      return null;
    }
    w.document.write('<p style="font-family:Arial;padding:20px;color:#555">Preparando documento…</p>');
    return w;
  }

  function imprimir(html, w) {
    w = w || abrirVentana();
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 500);
    return true;
  }

  window.DOCS = { esc: esc, fmt: fmt, cap: cap, hospital: hospital, htmlTiquete: htmlTiquete, htmlOrden: htmlOrden, imprimir: imprimir, abrirVentana: abrirVentana };
})();
