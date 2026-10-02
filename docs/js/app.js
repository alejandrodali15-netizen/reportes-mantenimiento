// =============================================================
// PLATAFORMA DE REPORTES DE MANTENIMIENTO — FRONTEND v1.0
// =============================================================
// Toda la lógica de permisos vive en el backend; aquí solo se muestran u
// ocultan botones para comodidad. Todo texto que viene de datos pasa por
// esc() antes de insertarse en el HTML.
(function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  var esc = DOCS.esc, fmt = DOCS.fmt, cap = DOCS.cap;
  var $ = function (id) { return document.getElementById(id); };

  var estado = {
    token: null,
    perfil: null,
    catalogos: null,
    reportes: [],
    tecnicos: [],
    pendientesDepurar: 0,
    vista: 'reportar',
    filtroEstado: '',
    fotosCache: {}
  };

  var ESTADOS = ['Nuevo', 'Asignado', 'En proceso', 'Terminado', 'Cerrado', 'Anulado'];
  var PRIORIDADES = ['urgente', 'alta', 'media', 'baja'];
  var ESTADOS_FINALES_ORDEN = ['Operativo', 'Operativo con observaciones', 'Pendiente de material', 'Requiere proveedor externo', 'Fuera de servicio'];

  var MENSAJES = {
    sin_url: 'Falta configurar la URL del backend en js/config.js.',
    red: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
    servidor_ocupado: 'El servidor está ocupado con otra operación. Intenta de nuevo en unos segundos.',
    demasiados_intentos: 'Demasiados intentos. Espera unos 10 minutos e intenta de nuevo.',
    credenciales_invalidas: 'Usuario o contraseña incorrectos.',
    pin_invalido: 'PIN no válido o inactivo.',
    sesion_expirada: 'Tu sesión expiró. Vuelve a entrar.',
    sin_permiso: 'Tu cuenta no tiene permiso para esta acción.',
    folio_no_encontrado: 'No existe un reporte con ese folio.',
    campos_incompletos: 'Completa los campos obligatorios.',
    categoria_invalida: 'Selecciona un tipo de falla de la lista.',
    transicion_invalida: 'El reporte cambió de estado. Actualiza la lista e intenta de nuevo.',
    tecnico_invalido: 'Ese técnico no existe o está inactivo.',
    sin_tecnico: 'Primero asigna un técnico al reporte.',
    motivo_requerido: 'Escribe el motivo.',
    prioridad_invalida: 'Prioridad no válida.',
    orden_no_encontrada: 'Este reporte aún no tiene orden de trabajo.',
    pdf_no_disponible: 'El PDF de esta orden no está disponible.',
    foto_borrada: 'Esta foto ya fue depurada.',
    nada_que_depurar: 'No hay fotos pendientes para ese folio.',
    confirmacion_invalida: 'El folio de confirmación no coincide.',
    accion_invalida: 'Acción no reconocida por el servidor. ¿Está publicada la última versión del backend?',
    error_interno: 'Error interno del servidor.'
  };
  function mensaje(codigo) { return MENSAJES[codigo] || ('Error: ' + codigo); }

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------
  async function api(accion, datos) {
    if (!cfg.WEBAPP_URL) return { error: 'sin_url' };
    var body = Object.assign({ accion: accion }, datos || {});
    if (estado.token) body.token = estado.token;
    var r;
    try {
      // text/plain evita el preflight CORS de Apps Script.
      var res = await fetch(cfg.WEBAPP_URL, { method: 'POST', body: JSON.stringify(body), cache: 'no-store' });
      r = await res.json();
    } catch (e) {
      return { error: 'red' };
    }
    if (r && r.error === 'sesion_expirada' && estado.token) {
      cerrarSesionLocal();
      toast(mensaje('sesion_expirada'), true);
    }
    return r || { error: 'red' };
  }

  // ---------------------------------------------------------------
  // Utilidades de interfaz
  // ---------------------------------------------------------------
  function toast(texto, esError) {
    var t = document.createElement('div');
    t.className = 'toast' + (esError ? ' err' : '');
    t.textContent = texto;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, esError ? 7000 : 4500);
  }

  function setMsg(el, texto, tipo) {
    el.textContent = texto || '';
    el.className = 'msg' + (tipo ? ' ' + tipo : '');
  }

  function cargando(btn, si, textoOriginal) {
    if (si) {
      btn.dataset.txt = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> ' + (textoOriginal || 'Procesando...');
    } else {
      btn.disabled = false;
      if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt;
    }
  }

  function badgeEstado(e) {
    return '<span class="badge e-' + esc(String(e).toLowerCase().replace(/\s+/g, '-')) + '">' + esc(e) + '</span>';
  }
  function badgePrioridad(p) {
    return '<span class="badge p-' + esc(p) + '">' + esc(cap(p)) + '</span>';
  }

  function verFoto(src) {
    var v = document.createElement('div');
    v.className = 'visor';
    v.innerHTML = '<img alt="Foto">';
    v.querySelector('img').src = src;
    v.addEventListener('click', function () { v.remove(); });
    document.body.appendChild(v);
  }

  // Redimensiona en el navegador (máx. 1280 px, JPEG) antes de enviar.
  function comprimir(archivo) {
    return new Promise(function (resolve, reject) {
      var lector = new FileReader();
      lector.onerror = reject;
      lector.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = 1280;
          var esc2 = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * esc2);
          c.height = Math.round(img.height * esc2);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL('image/jpeg', 0.72);
          if (url.length > 1900000) url = c.toDataURL('image/jpeg', 0.5);
          resolve(url);
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  // Selector de fotos reutilizable: miniaturas + botón para agregar.
  function crearSelectorFotos(contenedor, maximo) {
    var fotos = [];
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.className = 'oculto';
    contenedor.after(input);

    function pintar() {
      contenedor.innerHTML = '';
      fotos.forEach(function (src, i) {
        var d = document.createElement('div');
        d.className = 'foto-thumb';
        d.innerHTML = '<img alt="Foto ' + (i + 1) + '"><button type="button" aria-label="Quitar foto">&times;</button>';
        d.querySelector('img').src = src;
        d.querySelector('img').addEventListener('click', function () { verFoto(src); });
        d.querySelector('button').addEventListener('click', function () { fotos.splice(i, 1); pintar(); });
        contenedor.appendChild(d);
      });
      if (fotos.length < maximo) {
        var add = document.createElement('div');
        add.className = 'foto-add';
        add.setAttribute('role', 'button');
        add.tabIndex = 0;
        add.innerHTML = '<span>+</span>Agregar foto';
        add.addEventListener('click', function () { input.click(); });
        contenedor.appendChild(add);
      }
    }

    input.addEventListener('change', async function () {
      var archivos = Array.prototype.slice.call(input.files || []);
      input.value = '';
      for (var i = 0; i < archivos.length && fotos.length < maximo; i++) {
        try { fotos.push(await comprimir(archivos[i])); }
        catch (e) { toast('No se pudo leer una de las fotos.', true); }
      }
      pintar();
    });

    pintar();
    return {
      obtener: function () { return fotos.slice(); },
      limpiar: function () { fotos = []; pintar(); },
      maximo: function (n) { maximo = n; fotos = fotos.slice(0, n); pintar(); }
    };
  }

  // ---------------------------------------------------------------
  // Sesión y navegación
  // ---------------------------------------------------------------
  function guardarSesion(token, perfil) {
    estado.token = token;
    estado.perfil = perfil;
    try { sessionStorage.setItem('mant_token', token); } catch (e) { /* modo privado */ }
  }

  function cerrarSesionLocal() {
    estado.token = null;
    estado.perfil = null;
    estado.reportes = [];
    try { sessionStorage.removeItem('mant_token'); } catch (e) { /* nada */ }
    cerrarModal();
    pintarEncabezado();
    irA('ingresar');
  }

  function puede(permiso) {
    return !!(estado.perfil && estado.perfil.permisos.indexOf(permiso) !== -1);
  }
  function esTecnico() { return !!(estado.perfil && estado.perfil.rol === 'tecnico'); }
  function esStaff() { return puede('verTodos'); }

  function pintarEncabezado() {
    var p = estado.perfil;
    $('userBox').classList.toggle('oculto', !p);
    if (p) {
      $('userNombre').textContent = p.nombre;
      $('userRol').textContent = p.rolNombre;
    }
    Array.prototype.forEach.call(document.querySelectorAll('.soloStaff'), function (el) { el.classList.toggle('oculto', !esStaff()); });
    pintarNav();
  }

  function itemsNav() {
    if (!estado.perfil) {
      return [['reportar', 'Reportar falla'], ['consultar', 'Consultar folio'], ['ingresar', 'Ingresar']];
    }
    if (esTecnico()) {
      var mias = estado.reportes.filter(function (r) { return r.estado === 'Asignado' || r.estado === 'En proceso'; }).length;
      return [['lista', 'Mis órdenes', mias], ['reportar', 'Reportar falla']];
    }
    var items = [['lista', 'Reportes'],
      ['validar', 'Por validar', estado.reportes.filter(function (r) { return r.estado === 'Terminado'; }).length]];
    if (puede('depurarFotos')) items.push(['depuracion', 'Depuración de fotos', estado.pendientesDepurar]);
    if (puede('bitacora')) items.push(['bitacora', 'Bitácora']);
    items.push(['reportar', 'Reportar falla']);
    return items;
  }

  function pintarNav() {
    var nav = $('navBar');
    nav.innerHTML = '';
    itemsNav().forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = esc(it[1]) + (it[2] ? '<span class="count">' + Number(it[2]) + '</span>' : '');
      if (it[0] === estado.vista) b.classList.add('active');
      b.addEventListener('click', function () { irA(it[0]); });
      nav.appendChild(b);
    });
  }

  function irA(vista) {
    estado.vista = vista;
    var mapa = { reportar: 'vReportar', consultar: 'vConsultar', ingresar: 'vIngresar', lista: 'vLista',
      validar: 'vLista', depuracion: 'vDepuracion', bitacora: 'vBitacora' };
    Array.prototype.forEach.call(document.querySelectorAll('.vista'), function (s) { s.classList.add('oculto'); });
    $(mapa[vista] || 'vReportar').classList.remove('oculto');
    if (vista === 'validar') estado.filtroEstado = 'Terminado';
    else if (vista === 'lista' && estado.filtroEstado === 'Terminado') estado.filtroEstado = '';
    if (vista === 'lista' || vista === 'validar') pintarLista();
    if (vista === 'depuracion') cargarDepuracion();
    if (vista === 'bitacora') cargarBitacora();
    pintarNav();
    window.scrollTo(0, 0);
  }

  async function entrar(token, perfil) {
    guardarSesion(token, perfil);
    pintarEncabezado();
    await cargarReportes();
    irA('lista');
  }

  // ---------------------------------------------------------------
  // Catálogos y formulario público de reporte
  // ---------------------------------------------------------------
  var selectorReporte;

  async function cargarCatalogos() {
    var r = await api('catalogos');
    if (r.error) {
      if (r.error !== 'sin_url') toast(mensaje(r.error), true);
      return;
    }
    estado.catalogos = r;
    $('hospitalNombre').textContent = r.hospital;
    var sel = $('rCategoria');
    sel.innerHTML = '<option value="">Selecciona...</option>' + r.categorias.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    $('listaAreas').innerHTML = r.areas.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
    $('fCategoria').innerHTML = '<option value="">Todo tipo</option>' + r.categorias.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.maxFotosR'), function (el) { el.textContent = r.maxFotosReporte; });
    selectorReporte.maximo(r.maxFotosReporte);
    $('lPin').placeholder = 'PIN de ' + r.pinMin + ' dígitos o más';
  }

  async function enviarReporte(ev) {
    ev.preventDefault();
    var msg = $('rMsg');
    var datos = {
      area: $('rArea').value.trim(),
      espacio: $('rEspacio').value.trim(),
      categoria: $('rCategoria').value,
      descripcion: $('rDescripcion').value.trim(),
      afectaPacientes: $('rAfecta').checked,
      reporta: $('rReporta').value.trim(),
      extension: $('rExtension').value.trim(),
      fotos: selectorReporte.obtener()
    };
    if (!datos.area || !datos.categoria || !datos.descripcion || !datos.reporta) {
      setMsg(msg, 'Completa área, tipo de falla, descripción y tu nombre.', 'err');
      return;
    }
    var btn = $('rEnviar');
    cargando(btn, true, datos.fotos.length ? 'Enviando fotos...' : 'Enviando...');
    setMsg(msg, '');
    var r = await api('crearReporte', datos);
    cargando(btn, false);
    if (r.error) { setMsg(msg, mensaje(r.error), 'err'); return; }
    $('formReporte').reset();
    selectorReporte.limpiar();
    $('formReporteCard').classList.add('oculto');
    $('folioOk').classList.remove('oculto');
    $('folioOkTxt').textContent = r.folio;
    $('folioOkSub').textContent = 'Prioridad asignada: ' + cap(r.prioridad) + (r.fotos ? ' · ' + r.fotos + ' foto(s) recibida(s)' : '') +
      '. Guarda el folio para consultar el avance.';
    if (estado.perfil && esStaff()) cargarReportes();
  }

  // ---------------------------------------------------------------
  // Consulta pública por folio
  // ---------------------------------------------------------------
  async function consultarFolio(ev) {
    ev.preventDefault();
    var folio = $('cFolio').value.trim().toUpperCase();
    var msg = $('cMsg');
    $('cResultado').innerHTML = '';
    if (!folio) { setMsg(msg, 'Escribe un folio.', 'err'); return; }
    setMsg(msg, 'Buscando...');
    var r = await api('consultarFolio', { folio: folio });
    if (r.error) { setMsg(msg, mensaje(r.error), 'err'); return; }
    setMsg(msg, '');
    var rep = r.reporte;
    var pasos = [['Reportado', rep.fecha], ['Asignado a un técnico', rep.fechaAsignacion], ['Trabajo terminado', rep.fechaTerminado], ['Cerrado y validado', rep.fechaCierre]];
    $('cResultado').innerHTML =
      '<table class="datos" style="margin-top:12px">' +
      '<tr><td class="k">Folio</td><td class="mono">' + esc(rep.folio) + '</td></tr>' +
      '<tr><td class="k">Estado</td><td>' + badgeEstado(rep.estado) + '</td></tr>' +
      '<tr><td class="k">Prioridad</td><td>' + badgePrioridad(rep.prioridad) + '</td></tr>' +
      '<tr><td class="k">Área</td><td>' + esc(rep.area) + '</td></tr>' +
      '<tr><td class="k">Tipo de falla</td><td>' + esc(rep.categoria) + '</td></tr>' +
      pasos.map(function (p) {
        return '<tr><td class="k">' + esc(p[0]) + '</td><td>' + (p[1] ? esc(fmt(p[1])) : '<span style="color:var(--ink-soft)">Pendiente</span>') + '</td></tr>';
      }).join('') +
      '</table>';
  }

  // ---------------------------------------------------------------
  // Inicio de sesión
  // ---------------------------------------------------------------
  async function loginTecnico(ev) {
    ev.preventDefault();
    var msg = $('lPinMsg');
    var pin = $('lPin').value.trim();
    if (!pin) { setMsg(msg, 'Escribe tu PIN.', 'err'); return; }
    setMsg(msg, 'Verificando...');
    var r = await api('loginTecnico', { pin: pin });
    $('lPin').value = '';
    if (r.error) { setMsg(msg, mensaje(r.error), 'err'); return; }
    setMsg(msg, '');
    await entrar(r.token, r.perfil);
  }

  async function loginUsuario(ev) {
    ev.preventDefault();
    var msg = $('lUsuarioMsg');
    var usuario = $('lUsuario').value.trim();
    var password = $('lPassword').value;
    if (!usuario || !password) { setMsg(msg, 'Escribe usuario y contraseña.', 'err'); return; }
    setMsg(msg, 'Verificando...');
    var r = await api('loginUsuario', { usuario: usuario, password: password });
    $('lPassword').value = '';
    if (r.error) { setMsg(msg, mensaje(r.error), 'err'); return; }
    setMsg(msg, '');
    await entrar(r.token, r.perfil);
  }

  async function salir() {
    await api('logout');
    cerrarSesionLocal();
  }

  // ---------------------------------------------------------------
  // Lista de reportes
  // ---------------------------------------------------------------
  async function cargarReportes() {
    var r = await api('listarReportes');
    if (r.error) { if (r.error !== 'sesion_expirada') toast(mensaje(r.error), true); return; }
    estado.reportes = r.reportes || [];
    estado.tecnicos = r.tecnicos || [];
    estado.pendientesDepurar = r.pendientesDepurar || 0;
    $('fTecnico').innerHTML = '<option value="">Todo técnico</option>' + estado.tecnicos.map(function (t) {
      return '<option value="' + esc(t.nombre) + '">' + esc(t.nombre) + '</option>';
    }).join('');
    pintarNav();
    if (estado.vista === 'lista' || estado.vista === 'validar') pintarLista();
  }

  var RANGO_P = { urgente: 0, alta: 1, media: 2, baja: 3 };

  function ordenar(lista) {
    return lista.slice().sort(function (a, b) {
      var fa = (a.estado === 'Cerrado' || a.estado === 'Anulado') ? 1 : 0;
      var fb = (b.estado === 'Cerrado' || b.estado === 'Anulado') ? 1 : 0;
      if (fa !== fb) return fa - fb;
      if (fa === 1) return String(b.fechaCierre || b.fechaActualizacion).localeCompare(String(a.fechaCierre || a.fechaActualizacion));
      var pa = RANGO_P[a.prioridad], pb = RANGO_P[b.prioridad];
      if (pa !== pb) return pa - pb;
      return String(a.fecha).localeCompare(String(b.fecha)); // más antiguo primero
    });
  }

  function pintarLista() {
    var todos = estado.reportes;
    var conteo = {};
    ESTADOS.forEach(function (e) { conteo[e] = 0; });
    todos.forEach(function (r) { conteo[r.estado] = (conteo[r.estado] || 0) + 1; });

    var visibles = ESTADOS.filter(function (e) { return e !== 'Anulado' || conteo.Anulado > 0; });
    $('stats').innerHTML = visibles.map(function (e) {
      return '<div class="stat' + (estado.filtroEstado === e ? ' on' : '') + '" data-e="' + esc(e) + '"><div class="n">' + conteo[e] + '</div><div class="l">' + esc(e) + '</div></div>';
    }).join('');
    Array.prototype.forEach.call($('stats').querySelectorAll('.stat'), function (el) {
      el.addEventListener('click', function () {
        var e = el.getAttribute('data-e');
        estado.filtroEstado = estado.filtroEstado === e ? '' : e;
        if (estado.vista === 'validar' && estado.filtroEstado !== 'Terminado') { estado.vista = 'lista'; pintarNav(); }
        pintarLista();
      });
    });

    var q = $('fTexto').value.trim().toLowerCase();
    var fp = $('fPrioridad').value, fc = $('fCategoria').value, ft = $('fTecnico').value;
    var lista = todos.filter(function (r) {
      if (estado.filtroEstado) { if (r.estado !== estado.filtroEstado) return false; }
      else if (r.estado === 'Anulado') return false;
      if (fp && r.prioridad !== fp) return false;
      if (fc && r.categoria !== fc) return false;
      if (ft && r.tecnicoNombre !== ft) return false;
      if (q) {
        var txt = [r.folio, r.area, r.espacio, r.categoria, r.descripcion, r.reporta, r.tecnicoNombre].join(' ').toLowerCase();
        if (txt.indexOf(q) === -1) return false;
      }
      return true;
    });

    var cont = $('lista');
    if (!lista.length) {
      cont.innerHTML = '<div class="vacio">' + (todos.length ? 'No hay reportes con esos filtros.' : (esTecnico() ? 'No tienes órdenes asignadas.' : 'Aún no hay reportes.')) + '</div>';
      return;
    }
    cont.innerHTML = ordenar(lista).map(function (r) {
      return '<div class="rep pr-' + esc(r.prioridad) + '" data-folio="' + esc(r.folio) + '" tabindex="0">' +
        '<div class="row1"><span class="folio">' + esc(r.folio) + '</span><span>' + badgePrioridad(r.prioridad) + ' ' + badgeEstado(r.estado) + '</span></div>' +
        '<div class="lugar">' + esc(r.area) + (r.espacio ? ' · ' + esc(r.espacio) : '') + '</div>' +
        '<div style="font-size:12px;color:var(--teal);font-weight:600;margin-bottom:3px">' + esc(r.categoria) + '</div>' +
        '<div class="desc">' + esc(r.descripcion) + '</div>' +
        '<div class="meta"><span>' + esc(fmt(r.fecha)) + '</span><span>' + (r.tecnicoNombre ? '🔧 ' + esc(r.tecnicoNombre) : 'Sin asignar') + '</span></div>' +
        '</div>';
    }).join('');
    Array.prototype.forEach.call(cont.querySelectorAll('.rep'), function (el) {
      var abrir = function () { abrirDetalle(el.getAttribute('data-folio')); };
      el.addEventListener('click', abrir);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrir(); });
    });
  }

  function exportarCSV() {
    var cols = [['folio', 'Folio'], ['fecha', 'Fecha'], ['area', 'Área'], ['espacio', 'Lugar'], ['categoria', 'Tipo de falla'],
      ['descripcion', 'Descripción'], ['reporta', 'Reporta'], ['extension', 'Extensión'], ['prioridad', 'Prioridad'], ['estado', 'Estado'],
      ['tecnicoNombre', 'Técnico'], ['fechaAsignacion', 'Asignado'], ['fechaTerminado', 'Terminado'], ['fechaCierre', 'Cerrado'], ['validadoPor', 'Validado por']];
    var fechas = { fecha: 1, fechaAsignacion: 1, fechaTerminado: 1, fechaCierre: 1 };
    var filas = estado.reportes.map(function (r) {
      return cols.map(function (c) {
        var v = fechas[c[0]] ? fmt(r[c[0]]) : r[c[0]];
        return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      }).join(',');
    });
    var csv = cols.map(function (c) { return c[1]; }).join(',') + '\n' + filas.join('\n');
    var url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'reportes_mantenimiento_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------
  // Detalle de reporte (modal)
  // ---------------------------------------------------------------
  var detalle = null; // { reporte, orden, fotos }

  function cerrarModal() {
    $('modalRaiz').innerHTML = '';
    detalle = null;
  }

  function abrirModal(titulo, cuerpo) {
    $('modalRaiz').innerHTML =
      '<div class="overlay" id="overlay"><div class="modal" role="dialog" aria-modal="true">' +
      '<div class="mh"><h3>' + titulo + '</h3><button type="button" id="mCerrar" aria-label="Cerrar">&times;</button></div>' +
      '<div class="mb" id="mCuerpo">' + cuerpo + '</div></div></div>';
    $('mCerrar').addEventListener('click', cerrarModal);
    $('overlay').addEventListener('click', function (e) { if (e.target.id === 'overlay') cerrarModal(); });
  }

  async function abrirDetalle(folio) {
    abrirModal(esc(folio), '<div class="vacio">Cargando...</div>');
    var r = await api('detalleReporte', { folio: folio });
    if (r.error) { $('mCuerpo').innerHTML = '<div class="msg err">' + esc(mensaje(r.error)) + '</div>'; return; }
    detalle = { reporte: r.reporte, orden: r.orden, fotos: r.fotos || [] };
    pintarDetalle();
  }

  function tablaDatos(filas) {
    return '<table class="datos">' + filas.filter(function (f) { return f[1] !== null; }).map(function (f) {
      return '<tr><td class="k">' + esc(f[0]) + '</td><td>' + f[1] + '</td></tr>';
    }).join('') + '</table>';
  }

  function contenedorFotos(tipo) {
    var lista = detalle.fotos.filter(function (f) { return f.tipo === tipo; });
    if (!lista.length) return '';
    return '<div class="fotos-picker" style="margin-bottom:10px">' + lista.map(function (f) {
      if (f.estado === 'borrada') return '<div class="foto-thumb"><div class="cap" style="top:0;display:flex;align-items:center;justify-content:center">Depurada</div></div>';
      return '<div class="foto-thumb" data-foto="' + esc(f.id) + '"><div class="cap">Cargando...</div></div>';
    }).join('') + '</div>';
  }

  async function cargarFoto(id) {
    if (estado.fotosCache[id]) return estado.fotosCache[id];
    var r = await api('obtenerFoto', { fotoId: id });
    if (r.error) return null;
    estado.fotosCache[id] = r.dataUrl;
    return r.dataUrl;
  }

  function pintarMiniaturas() {
    Array.prototype.forEach.call(document.querySelectorAll('#mCuerpo [data-foto]'), async function (el) {
      var src = await cargarFoto(el.getAttribute('data-foto'));
      if (!src) { el.innerHTML = '<div class="cap">No disponible</div>'; return; }
      el.innerHTML = '<img alt="Foto">';
      var img = el.querySelector('img');
      img.src = src;
      img.addEventListener('click', function () { verFoto(src); });
    });
  }

  function pintarDetalle() {
    var r = detalle.reporte, o = detalle.orden;
    var html = '<div style="margin-bottom:10px">' + badgePrioridad(r.prioridad) + ' ' + badgeEstado(r.estado) + '</div>';

    if (r.motivoUltimo && (r.estado === 'En proceso' || r.estado === 'Anulado' || r.estado === 'Nuevo')) {
      html += '<div class="motivo"><strong>' + (r.estado === 'Anulado' ? 'Motivo de anulación' : 'Motivo de devolución / reapertura') + ':</strong> ' + esc(r.motivoUltimo) + '</div>';
    }

    html += tablaDatos([
      ['Área', esc(r.area) + (r.espacio ? ' · ' + esc(r.espacio) : '')],
      ['Tipo de falla', esc(r.categoria)],
      ['Descripción', esc(r.descripcion).replace(/\n/g, '<br>')],
      ['Afecta pacientes', r.afectaPacientes ? 'Sí' : 'No'],
      ['Reporta', esc(r.reporta) + (r.extension ? ' · ext. ' + esc(r.extension) : '')],
      ['Fecha', esc(fmt(r.fecha))],
      ['Técnico', r.tecnicoNombre ? esc(r.tecnicoNombre) + (r.fechaAsignacion ? ' <span style="color:var(--ink-soft)">(' + esc(fmt(r.fechaAsignacion)) + ')</span>' : '') : 'Sin asignar'],
      ['Cerrado', r.fechaCierre ? esc(fmt(r.fechaCierre)) + ' por ' + esc(r.validadoPor) : null]
    ]);
    html += contenedorFotos('reporte');

    if (o) {
      html += '<div class="seccion">Orden de trabajo ' + esc(o.folioOrden) + '</div>';
      html += tablaDatos([
        ['Diagnóstico', esc(o.diagnostico).replace(/\n/g, '<br>')],
        ['Trabajo realizado', esc(o.trabajo).replace(/\n/g, '<br>')],
        ['Materiales', o.materiales ? esc(o.materiales).replace(/\n/g, '<br>') : '—'],
        ['Tiempo', o.tiempo ? esc(o.tiempo) : '—'],
        ['Estado final', esc(o.estadoFinal)],
        ['Observaciones', o.observaciones ? esc(o.observaciones).replace(/\n/g, '<br>') : null],
        ['Terminado', esc(fmt(o.fechaTerminado))],
        ['Devoluciones', o.devoluciones ? String(o.devoluciones) : null]
      ]);
      html += contenedorFotos('trabajo');
    }

    html += '<div class="seccion">Acciones</div><div id="accionesCaja"></div><div id="accionPanel"></div><div class="msg" id="accionMsg"></div>';
    $('mCuerpo').innerHTML = html;
    pintarAcciones();
    pintarMiniaturas();
  }

  function boton(texto, clase, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small ' + (clase || '');
    b.textContent = texto;
    b.addEventListener('click', function () { fn(b); });
    return b;
  }

  function pintarAcciones() {
    var r = detalle.reporte, o = detalle.orden;
    var caja = $('accionesCaja');
    caja.className = 'acciones';
    caja.innerHTML = '';
    $('accionPanel').innerHTML = '';
    var abierta = ['Nuevo', 'Asignado', 'En proceso'].indexOf(r.estado) !== -1;
    var esMio = esTecnico();

    if (puede('asignar') && abierta) caja.appendChild(boton(r.tecnicoAsignado ? 'Reasignar técnico' : 'Asignar técnico', '', panelAsignar));
    if (puede('prioridad') && ['Cerrado', 'Anulado'].indexOf(r.estado) === -1) caja.appendChild(boton('Cambiar prioridad', 'ghost', panelPrioridad));
    if (r.tecnicoAsignado && r.estado !== 'Anulado') caja.appendChild(boton('Imprimir tiquete', 'ghost', function () { DOCS.imprimir(DOCS.htmlTiquete(r)); }));

    if (puede('trabajarOrden') && (esMio || esStaff())) {
      if (r.estado === 'Asignado') caja.appendChild(boton('Iniciar trabajo', 'navy', function (b) { ejecutar(b, 'iniciar', {}, 'Trabajo iniciado.'); }));
      if (r.tecnicoAsignado && (r.estado === 'Asignado' || r.estado === 'En proceso')) {
        caja.appendChild(boton(o ? 'Corregir orden y marcar terminado' : 'Llenar orden y marcar terminado', '', panelOrden));
      }
    }

    if (puede('validar') && r.estado === 'Terminado') {
      caja.appendChild(boton('Validar cierre', '', validarCierre));
      caja.appendChild(boton('Devolver al técnico', 'danger', function () {
        panelMotivo('Motivo de la devolución (lo verá el técnico)', 'Devolver', function (motivo, b) {
          ejecutar(b, 'devolver', { motivo: motivo }, 'Orden devuelta al técnico.');
        });
      }));
    }

    if (o) caja.appendChild(boton('Imprimir orden', 'ghost', imprimirOrden));
    if (o && o.tienePdf) caja.appendChild(boton('Ver PDF validado', 'ghost', verPdf));

    if (puede('anular') && r.estado !== 'Anulado') caja.appendChild(boton('Anular', 'danger', function () {
      panelMotivo('Motivo de anulación', 'Anular reporte', function (motivo, b) { ejecutar(b, 'anular', { motivo: motivo }, 'Reporte anulado.'); });
    }));
    if (puede('reabrir') && (r.estado === 'Cerrado' || r.estado === 'Anulado')) caja.appendChild(boton('Reabrir', 'ghost', function () {
      panelMotivo('Motivo de reapertura', 'Reabrir', function (motivo, b) { ejecutar(b, 'reabrir', { motivo: motivo }, 'Reporte reabierto.'); });
    }));
    if (puede('bitacora')) caja.appendChild(boton('Ver bitácora', 'ghost', function () {
      var folio = r.folio; cerrarModal(); $('bFolio').value = folio; irA('bitacora');
    }));
    if (puede('borrar')) caja.appendChild(boton('Borrar definitivamente', 'danger', panelBorrar));

    if (!caja.children.length) caja.innerHTML = '<span style="color:var(--ink-soft);font-size:13px">No hay acciones disponibles para este reporte.</span>';
  }

  // Ejecuta una acción sobre el reporte abierto y refresca todo.
  async function ejecutar(btn, accion, datos, textoOk) {
    var folio = detalle.reporte.folio;
    cargando(btn, true);
    var r = await api(accion, Object.assign({ folio: folio }, datos));
    cargando(btn, false);
    if (r.error) { setMsg($('accionMsg'), mensaje(r.error) + (r.detalle ? ' (' + r.detalle + ')' : ''), 'err'); return null; }
    toast(textoOk);
    await cargarReportes();
    if (accion === 'borrarReporte') { cerrarModal(); return r; }
    await abrirDetalle(folio);
    return r;
  }

  function panelMotivo(etiqueta, textoBoton, alConfirmar) {
    var p = $('accionPanel');
    p.innerHTML = '<div class="card" style="margin:12px 0 0;padding:14px"><div class="field"><label>' + esc(etiqueta) + '</label>' +
      '<textarea id="pMotivo" maxlength="250"></textarea></div><div class="acciones" id="pBtns"></div></div>';
    var b = boton(textoBoton, 'danger', function (bb) {
      var m = $('pMotivo').value.trim();
      if (!m) { setMsg($('accionMsg'), mensaje('motivo_requerido'), 'err'); return; }
      alConfirmar(m, bb);
    });
    $('pBtns').appendChild(b);
    $('pBtns').appendChild(boton('Cancelar', 'ghost', function () { p.innerHTML = ''; }));
    $('pMotivo').focus();
  }

  function panelAsignar() {
    var r = detalle.reporte;
    var p = $('accionPanel');
    if (!estado.tecnicos.length) {
      p.innerHTML = '<div class="notice" style="margin-top:12px">No hay técnicos activos. Da de alta su PIN en la hoja Personal del libro de Google Sheets.</div>';
      return;
    }
    p.innerHTML = '<div class="card" style="margin:12px 0 0;padding:14px"><div class="field"><label>Técnico</label><select id="pTecnico">' +
      estado.tecnicos.map(function (t) {
        return '<option value="' + esc(t.pin) + '"' + (t.nombre === r.tecnicoNombre ? ' selected' : '') + '>' + esc(t.nombre) + (t.oficio ? ' · ' + esc(t.oficio) : '') + '</option>';
      }).join('') + '</select></div><div class="acciones" id="pBtns"></div></div>';
    $('pBtns').appendChild(boton('Asignar', '', function (b) {
      ejecutar(b, 'asignar', { pin: $('pTecnico').value }, 'Técnico asignado.');
    }));
    $('pBtns').appendChild(boton('Cancelar', 'ghost', function () { p.innerHTML = ''; }));
  }

  function panelPrioridad() {
    var r = detalle.reporte;
    var p = $('accionPanel');
    p.innerHTML = '<div class="card" style="margin:12px 0 0;padding:14px"><div class="field"><label>Prioridad</label><select id="pPrioridad">' +
      PRIORIDADES.map(function (x) { return '<option value="' + x + '"' + (x === r.prioridad ? ' selected' : '') + '>' + cap(x) + '</option>'; }).join('') +
      '</select></div><div class="acciones" id="pBtns"></div></div>';
    $('pBtns').appendChild(boton('Guardar prioridad', '', function (b) {
      ejecutar(b, 'cambiarPrioridad', { prioridad: $('pPrioridad').value }, 'Prioridad actualizada.');
    }));
    $('pBtns').appendChild(boton('Cancelar', 'ghost', function () { p.innerHTML = ''; }));
  }

  function panelBorrar() {
    var r = detalle.reporte;
    var p = $('accionPanel');
    p.innerHTML = '<div class="card" style="margin:12px 0 0;padding:14px;border-color:var(--red)">' +
      '<p style="margin:0 0 10px;font-size:13px">Esto elimina el reporte, su orden, sus fotos y su PDF (los archivos van a la papelera de Drive). Úsalo solo para datos de prueba; para un reporte real usa <strong>Anular</strong>.</p>' +
      '<div class="field"><label>Escribe el folio ' + esc(r.folio) + ' para confirmar</label><input type="text" id="pConfirma" autocomplete="off"></div>' +
      '<div class="acciones" id="pBtns"></div></div>';
    $('pBtns').appendChild(boton('Borrar definitivamente', 'danger', function (b) {
      ejecutar(b, 'borrarReporte', { confirmacion: $('pConfirma').value.trim() }, 'Reporte borrado.');
    }));
    $('pBtns').appendChild(boton('Cancelar', 'ghost', function () { p.innerHTML = ''; }));
  }

  function panelOrden() {
    var r = detalle.reporte, o = detalle.orden || {};
    var maxF = estado.catalogos ? estado.catalogos.maxFotosOrden : 2;
    var yaHay = detalle.fotos.filter(function (f) { return f.tipo === 'trabajo' && f.estado !== 'borrada'; }).length;
    var disponibles = Math.max(0, maxF - yaHay);
    var p = $('accionPanel');
    p.innerHTML = '<div class="card" style="margin:12px 0 0;padding:14px">' +
      '<div class="field"><label for="oDiag">Diagnóstico *</label><textarea id="oDiag" maxlength="2000" placeholder="Causa encontrada"></textarea></div>' +
      '<div class="field"><label for="oTrabajo">Trabajo realizado *</label><textarea id="oTrabajo" maxlength="2000"></textarea></div>' +
      '<div class="field"><label for="oMat">Materiales utilizados</label><textarea id="oMat" maxlength="2000" placeholder="Ej. 2 contactos dobles, 3 m de cable cal. 12"></textarea></div>' +
      '<div class="grid2"><div class="field"><label for="oTiempo">Tiempo de trabajo</label><input type="text" id="oTiempo" maxlength="120" placeholder="Ej. 1.5 horas"></div>' +
      '<div class="field"><label for="oEstado">Estado final *</label><select id="oEstado">' +
      ESTADOS_FINALES_ORDEN.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="oObs">Observaciones</label><textarea id="oObs" maxlength="2000"></textarea></div>' +
      '<div class="field"><label>Fotos del trabajo terminado (hasta ' + disponibles + ')</label>' +
      (disponibles ? '<div class="fotos-picker" id="oFotos"></div>' : '<div class="hint">Ya se adjuntó el máximo de fotos para esta orden.</div>') + '</div>' +
      '<div class="acciones" id="pBtns"></div></div>';
    $('oDiag').value = o.diagnostico || '';
    $('oTrabajo').value = o.trabajo || '';
    $('oMat').value = o.materiales || '';
    $('oTiempo').value = o.tiempo || '';
    $('oObs').value = o.observaciones || '';
    if (o.estadoFinal) $('oEstado').value = o.estadoFinal;
    var selector = disponibles ? crearSelectorFotos($('oFotos'), disponibles) : null;
    $('pBtns').appendChild(boton('Guardar orden y marcar Terminado', '', function (b) {
      var datos = {
        diagnostico: $('oDiag').value.trim(), trabajo: $('oTrabajo').value.trim(), materiales: $('oMat').value.trim(),
        tiempo: $('oTiempo').value.trim(), estadoFinal: $('oEstado').value, observaciones: $('oObs').value.trim(),
        fotos: selector ? selector.obtener() : []
      };
      if (!datos.diagnostico || !datos.trabajo) { setMsg($('accionMsg'), 'Escribe el diagnóstico y el trabajo realizado.', 'err'); return; }
      ejecutar(b, 'terminar', datos, 'Orden guardada. Queda pendiente de validación.');
    }));
    $('pBtns').appendChild(boton('Cancelar', 'ghost', function () { p.innerHTML = ''; }));
    $('oDiag').focus();
  }

  // Carga todas las fotos vigentes del reporte para incrustarlas en la orden.
  async function fotosParaOrden() {
    var res = { reporte: [], trabajo: [] };
    for (var i = 0; i < detalle.fotos.length; i++) {
      var f = detalle.fotos[i];
      if (f.estado === 'borrada') continue;
      var src = await cargarFoto(f.id);
      if (src && res[f.tipo]) res[f.tipo].push(src);
    }
    return res;
  }

  async function imprimirOrden() {
    var w = DOCS.abrirVentana();
    if (!w) return;
    var fotos = await fotosParaOrden();
    DOCS.imprimir(DOCS.htmlOrden(detalle.reporte, detalle.orden, fotos), w);
  }

  async function validarCierre(btn) {
    if (!confirm('¿Validar el cierre de ' + detalle.reporte.folio + '? Se genera el PDF definitivo de la orden.')) return;
    cargando(btn, true, 'Generando PDF...');
    var fotos = await fotosParaOrden();
    // El PDF congelado ya muestra quién valida y cuándo.
    var rep = Object.assign({}, detalle.reporte, { estado: 'Cerrado', validadoPor: estado.perfil.nombre, fechaCierre: new Date().toISOString() });
    var html = DOCS.htmlOrden(rep, detalle.orden, fotos);
    cargando(btn, false);
    var r = await ejecutar(btn, 'validar', { ordenHtml: html }, 'Cierre validado.');
    if (r && r.aviso === 'pdf_no_generado') toast('El reporte quedó cerrado, pero no se pudo generar el PDF. Puedes imprimir la orden.', true);
  }

  async function verPdf(btn) {
    var w = DOCS.abrirVentana();
    if (!w) return;
    cargando(btn, true);
    var r = await api('obtenerPdf', { folio: detalle.reporte.folio });
    cargando(btn, false);
    if (r.error) { w.close(); setMsg($('accionMsg'), mensaje(r.error), 'err'); return; }
    var bytes = Uint8Array.from(atob(r.base64), function (c) { return c.charCodeAt(0); });
    w.location.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }

  // ---------------------------------------------------------------
  // Depuración de fotos
  // ---------------------------------------------------------------
  async function cargarDepuracion() {
    var cont = $('depLista');
    cont.innerHTML = '<div class="vacio">Cargando...</div>';
    var r = await api('listarDepuracion');
    if (r.error) { cont.innerHTML = '<div class="msg err">' + esc(mensaje(r.error)) + '</div>'; return; }
    if (!r.grupos.length) { cont.innerHTML = '<div class="vacio">No hay fotos pendientes de depurar.</div>'; return; }
    cont.innerHTML = '<div class="scroll-x"><table class="t"><thead><tr><th>Folio</th><th>Área / tipo</th><th>Cerrado</th><th>Fotos</th><th></th></tr></thead><tbody>' +
      r.grupos.map(function (g) {
        return '<tr><td class="mono">' + esc(g.folio) + '</td><td>' + esc(g.area) + '<div style="color:var(--ink-soft)">' + esc(g.categoria) + '</div></td>' +
          '<td>' + esc(fmt(g.fechaCierre)) + '</td><td>' + Number(g.fotos) + '</td>' +
          '<td style="white-space:nowrap"><button type="button" class="btn small danger" data-dep="borrar" data-folio="' + esc(g.folio) + '">Autorizar borrado</button> ' +
          '<button type="button" class="btn small ghost" data-dep="conservar" data-folio="' + esc(g.folio) + '">Conservar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    Array.prototype.forEach.call(cont.querySelectorAll('[data-dep]'), function (b) {
      b.addEventListener('click', async function () {
        var folio = b.getAttribute('data-folio');
        var borrar = b.getAttribute('data-dep') === 'borrar';
        if (borrar && !confirm('¿Autorizar el borrado de las fotos de ' + folio + '? Irán a la papelera de Drive.')) return;
        cargando(b, true);
        var res = await api(borrar ? 'autorizarDepuracion' : 'conservarFotos', { folio: folio });
        cargando(b, false);
        if (res.error) { toast(mensaje(res.error), true); return; }
        toast(borrar ? 'Fotos de ' + folio + ' enviadas a la papelera.' : 'Fotos de ' + folio + ' se conservarán.');
        await cargarReportes();
        cargarDepuracion();
      });
    });
  }

  // ---------------------------------------------------------------
  // Bitácora (desarrollo)
  // ---------------------------------------------------------------
  async function cargarBitacora() {
    var cont = $('bLista');
    cont.innerHTML = '<div class="vacio">Cargando...</div>';
    var r = await api('listarBitacora', { folio: $('bFolio').value.trim().toUpperCase() });
    if (r.error) { cont.innerHTML = '<div class="msg err">' + esc(mensaje(r.error)) + '</div>'; return; }
    if (!r.registros.length) { cont.innerHTML = '<div class="vacio">Sin registros.</div>'; return; }
    cont.innerHTML = '<table class="t"><thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Folio</th><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>' +
      r.registros.map(function (b) {
        return '<tr><td class="mono" style="white-space:nowrap">' + esc(fmt(b.Fecha)) + '</td><td>' + esc(b.Usuario) + '<div style="color:var(--ink-soft)">' + esc(b.Rol) + '</div></td>' +
          '<td>' + esc(b.Accion) + '</td><td class="mono">' + esc(b.Folio) + '</td><td>' + esc(b.Campo) + '</td><td>' + esc(b.Anterior) + '</td><td>' + esc(b.Nuevo) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------
  async function iniciar() {
    $('versionTxt').textContent = 'v' + cfg.VERSION;
    $('versionPie').textContent = 'v' + cfg.VERSION;
    var h = DOCS.hospital();
    if (h.nombre) $('hospitalNombre').textContent = h.nombre;
    if (!cfg.WEBAPP_URL) $('avisoConfig').classList.remove('oculto');

    $('fPrioridad').innerHTML = '<option value="">Toda prioridad</option>' + PRIORIDADES.map(function (p) { return '<option value="' + p + '">' + cap(p) + '</option>'; }).join('');
    selectorReporte = crearSelectorFotos($('rFotos'), 3);

    $('formReporte').addEventListener('submit', enviarReporte);
    $('btnOtroReporte').addEventListener('click', function () {
      $('folioOk').classList.add('oculto');
      $('formReporteCard').classList.remove('oculto');
      setMsg($('rMsg'), '');
    });
    $('formConsulta').addEventListener('submit', consultarFolio);
    $('formPin').addEventListener('submit', loginTecnico);
    $('formUsuario').addEventListener('submit', loginUsuario);
    $('btnSalir').addEventListener('click', salir);
    $('btnRefrescar').addEventListener('click', async function () { cargando(this, true); await cargarReportes(); cargando(this, false); });
    $('btnExportar').addEventListener('click', exportarCSV);
    $('btnBitacora').addEventListener('click', cargarBitacora);
    ['fTexto', 'fPrioridad', 'fCategoria', 'fTecnico'].forEach(function (id) {
      $(id).addEventListener(id === 'fTexto' ? 'input' : 'change', pintarLista);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var v = document.querySelector('.visor'); if (v) v.remove(); else cerrarModal(); } });

    pintarEncabezado();
    irA('reportar');
    await cargarCatalogos();

    var token = null;
    try { token = sessionStorage.getItem('mant_token'); } catch (e) { /* nada */ }
    if (token) {
      estado.token = token;
      var r = await api('sesion');
      if (r.error) { estado.token = null; return; }
      await entrar(token, r.perfil);
    }
  }

  iniciar();
})();
