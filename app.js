'use strict';

/* ============================================================
   FlyDrone — lógica do app
   Dados: Open-Meteo (https://open-meteo.com/)
   ============================================================ */

/* ------------------------------------------------------------
   1. MODELOS DE DRONE
   Limite de vento = resistência máxima ao vento (especificação DJI)
   Faixa de temperatura operacional conforme fabricante.
   ------------------------------------------------------------ */
const DRONES = [
  {
    id: 'mini3', name: 'Mini 3', windLimit: 10.7, tempMin: -10, tempMax: 40,
    specs: {
      speed: '57,6 km/h', speedHint: 'modo S',
      weight: '248 g',
      distance: '18 km', distanceHint: '25 km com bateria Plus',
      flightTime: '38 min', flightHint: '51 min com bateria Plus',
    },
  },
  {
    id: 'mini3pro', name: 'Mini 3 Pro', windLimit: 10.7, tempMin: -10, tempMax: 40,
    specs: {
      speed: '57,6 km/h', speedHint: 'modo S',
      weight: '< 249 g',
      distance: '18 km', distanceHint: '25 km com bateria Plus',
      flightTime: '34 min', flightHint: '47 min com bateria Plus',
    },
  },
  {
    id: 'mini4', name: 'Mini 4 Pro', windLimit: 10.7, tempMin: -10, tempMax: 40,
    specs: {
      speed: '57,6 km/h', speedHint: 'modo S',
      weight: '< 249 g',
      distance: '18 km', distanceHint: '25 km com bateria Plus',
      flightTime: '34 min', flightHint: '45 min com bateria Plus',
    },
  },
  {
    id: 'mini5', name: 'Mini 5 Pro', windLimit: 12.0, tempMin: -10, tempMax: 40,
    specs: {
      speed: '64,8 km/h', speedHint: '68,4 km/h com bateria Plus',
      weight: '249,9 g',
      distance: '21 km', distanceHint: '32 km com bateria Plus',
      flightTime: '36 min', flightHint: '52 min com bateria Plus',
    },
  },
  {
    id: 'air3', name: 'Air 3', windLimit: 12.0, tempMin: -10, tempMax: 40,
    specs: {
      speed: '75,6 km/h', speedHint: 'modo S',
      weight: '720 g',
      distance: '32 km', distanceHint: '',
      flightTime: '46 min', flightHint: '',
    },
  },
  {
    id: 'air3s', name: 'Air 3S', windLimit: 12.0, tempMin: -10, tempMax: 40,
    specs: {
      speed: '75,6 km/h', speedHint: 'modo S',
      weight: '724 g',
      distance: '32 km', distanceHint: '',
      flightTime: '45 min', flightHint: '',
    },
  },
];

const STORAGE = {
  drone: 'flydrone.drone',
  place: 'flydrone.place',
};

/* Atualiza sozinho a cada 10 min; ao voltar para o app, se ficou 3 min fora. */
const AUTO_REFRESH_MS = 10 * 60 * 1000;
const RETURN_REFRESH_MS = 3 * 60 * 1000;

const DEFAULT_PLACE = {
  latitude: -23.5505,
  longitude: -46.6333,
  name: 'São Paulo',
  admin: 'SP',
  country: 'Brasil',
};

const API_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const API_GEOCODE  = 'https://geocoding-api.open-meteo.com/v1/search';

const STATUS_RANK = { good: 0, warn: 1, bad: 2 };

/* Faixas de alerta como fração do limite de vento do drone.
   Rajada: 80% = margem de 20% abaixo do limite DJI. */
const WIND_GOOD_RATIO = 0.60;
const WIND_WARN_RATIO = 0.85;
const GUST_GOOD_RATIO = 0.80;
const GUST_WARN_RATIO = 0.90;

/* ------------------------------------------------------------
   2. ESTADO
   ------------------------------------------------------------ */
const state = {
  droneId: localStorage.getItem(STORAGE.drone) || 'mini3',
  place: readSavedPlace(),
  weather: null,
  loading: false,
  fetchedAt: 0,      // última busca bem-sucedida
  lastAttemptAt: 0,  // última tentativa (evita repetir em caso de erro)
  hourKey: null,
  windUnit: 'kmh', // sempre volta para km/h ao recarregar a página
};

function readSavedPlace() {
  try {
    const raw = localStorage.getItem(STORAGE.place);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.latitude === 'number' && typeof p?.longitude === 'number') return p;
  } catch { /* ignora */ }
  return null;
}

function getDrone() {
  return DRONES.find((d) => d.id === state.droneId) || DRONES[0];
}

/* ------------------------------------------------------------
   3. ELEMENTOS
   ------------------------------------------------------------ */
const $ = (sel) => document.querySelector(sel);

const el = {
  menuBtn:      $('#menuBtn'),
  refreshBtn:   $('#refreshBtn'),
  locationBtn:  $('#locationBtn'),
  placeName:    $('#placeName'),
  main:         $('#main'),

  verdict:      $('#verdict'),
  verdictBadge: $('#verdictBadge'),
  verdictLabel: $('#verdictLabel'),
  verdictDrone: $('#verdictDrone'),
  verdictDroneName: $('#verdictDroneName'),
  verdictReason:$('#verdictReason'),
  windFill:     $('#windFill'),
  windLimitMark:$('#windLimitMark'),
  windNow:      $('#windNow'),
  windLimit:    $('#windLimit'),
  unitToggle:   $('#unitToggle'),

  tileTemp:  $('#tileTemp'),
  tileSky:   $('#tileSky'),
  tileWind:  $('#tileWind'),
  tileGust:  $('#tileGust'),
  tileCloud: $('#tileCloud'),
  tileDir:   $('#tileDir'),

  tempValue: $('#tempValue'),
  tempSub:   $('#tempSub'),
  skyIcon:   $('#skyIcon'),
  skyValue:  $('#skyValue'),
  skySub:    $('#skySub'),
  windValue: $('#windValue'),
  windSub:   $('#windSub'),
  gustValue: $('#gustValue'),
  gustSub:   $('#gustSub'),
  cloudValue:$('#cloudValue'),
  cloudSub:  $('#cloudSub'),
  compass:   $('#compass'),
  dirArrow:  $('#dirArrow'),
  dirValue:  $('#dirValue'),
  dirSub:    $('#dirSub'),

  hourly:      $('#hourly'),
  hourlyTrack: $('#hourlyTrack'),
  updated:     $('#updated'),

  scrim:       $('#scrim'),
  drawer:      $('#drawer'),
  drawerClose: $('#drawerClose'),
  droneList:   $('#droneList'),

  droneModal:   $('#droneModal'),
  droneTitle:   $('#droneTitle'),
  droneSpecs:   $('#droneSpecs'),
  droneClose:   $('#droneClose'),
  droneSwap:    $('#droneSwap'),

  locModal:   $('#locModal'),
  locInput:   $('#locInput'),
  locResults: $('#locResults'),
  gpsBtn:     $('#gpsBtn'),

  toast: $('#toast'),
};

/* ------------------------------------------------------------
   4. UTILITÁRIOS
   ------------------------------------------------------------ */
function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function timeOf(iso) {
  return typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '—';
}

/* Unidade do vento: km/h por padrão, m/s ao tocar em "Limite". */
function windValue(ms, msDigits = 1) {
  if (state.windUnit === 'ms') {
    return { text: fmt(ms, msDigits), unit: 'm/s' };
  }
  return { text: fmt(ms * 3.6, 0), unit: 'km/h' };
}

/* Hora atual no fuso do local consultado (a API devolve o offset). */
function currentHourKey() {
  const offset = state.weather?.utc_offset_seconds;
  if (typeof offset !== 'number') return null;
  const d = new Date(Date.now() + offset * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}`;
}

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

/* Ponto de orvalho (Magnus) — usado para estimar a base das nuvens */
function dewPoint(temp, humidity) {
  const a = 17.27;
  const b = 237.7;
  const rh = Math.min(Math.max(humidity, 1), 100);
  const alpha = (a * temp) / (b + temp) + Math.log(rh / 100);
  return (b * alpha) / (a - alpha);
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
              'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

function cardinal(deg) {
  if (typeof deg !== 'number') return '—';
  return DIRS[Math.round(deg / 22.5) % 16];
}

/* ------------------------------------------------------------
   5. AVALIAÇÃO DAS CONDIÇÕES
   ------------------------------------------------------------ */
function skyInfo(code, isDay = true) {
  if (code === 0) {
    return isDay
      ? { icon: 'i-sun',  label: 'Ensolarado', status: 'good' }
      : { icon: 'i-moon', label: 'Céu limpo',  status: 'good' };
  }
  if (code === 1 || code === 2) {
    return {
      icon: isDay ? 'i-cloud-sun' : 'i-cloud-moon',
      label: 'Nublado',
      status: 'good',
    };
  }
  if (code === 3) return { icon: 'i-cloud',     label: 'Nublado',    status: 'warn' };
  if (code === 45 || code === 48) return { icon: 'i-fog', label: 'Nevoeiro', status: 'bad' };
  if (code >= 51 && code <= 57) return { icon: 'i-rain',  label: 'Garoando', status: 'bad' };
  if (code >= 61 && code <= 67) return { icon: 'i-rain',  label: 'Chuvoso',  status: 'bad' };
  if (code >= 71 && code <= 77) return { icon: 'i-snow',  label: 'Neve',     status: 'bad' };
  if (code >= 80 && code <= 82) return { icon: 'i-rain',  label: 'Chuvoso',  status: 'bad' };
  if (code === 85 || code === 86) return { icon: 'i-snow', label: 'Neve',    status: 'bad' };
  if (code >= 95) return { icon: 'i-storm', label: 'Tempestade', status: 'bad' };
  return { icon: 'i-cloud', label: 'Nublado', status: 'warn' };
}

function assess(c, drone) {
  /* ---- Vento ---- */
  const wind = Number(c.wind_speed_10m) || 0;
  const gust = Number(c.wind_gusts_10m) || 0;
  const limit = drone.windLimit;

  const windRatio = wind / limit;
  const windStatus = windRatio <= WIND_GOOD_RATIO ? 'good'
    : windRatio <= WIND_WARN_RATIO ? 'warn' : 'bad';

  const gustRatio = gust / limit;
  const gustStatus = gustRatio <= GUST_GOOD_RATIO ? 'good'
    : gustRatio <= GUST_WARN_RATIO ? 'warn' : 'bad';

  /* ---- Temperatura ---- */
  const temp = Number(c.temperature_2m);
  let tempStatus = 'good';
  if (temp < drone.tempMin || temp > drone.tempMax) tempStatus = 'bad';
  else if (temp < 5 || temp > 32) tempStatus = 'warn';

  /* ---- Céu / precipitação ---- */
  const code = Number(c.weather_code);
  const visibility = c.visibility == null ? NaN : Number(c.visibility);
  const isDay = c.is_day == null ? true : Number(c.is_day) === 1;
  const sky = skyInfo(code, isDay);
  let skyStatus = sky.status;
  if ((Number(c.precipitation) || 0) > 0.1 && skyStatus !== 'bad') {
    skyStatus = 'bad';
  }
  if (Number.isFinite(visibility) && visibility < 3000) {
    skyStatus = 'bad';
  }

  /* ---- Base das nuvens ----
     A API não entrega a base pronta, então usamos o nível de condensação
     (125 m por °C de diferença entre temperatura e ponto de orvalho) e as
     camadas de nuvem (baixa/média/alta) para saber se há nuvens baixas.   */
  const rh = Number(c.relative_humidity_2m) || 50;
  const dewApi = c.dew_point_2m == null ? NaN : Number(c.dew_point_2m);
  const dew = Number.isFinite(dewApi) ? dewApi : dewPoint(temp, rh);

  const cloudCover = Number(c.cloud_cover) || 0;
  const lowCover = Number(c.cloud_cover_low) || 0;
  const midCover = Number(c.cloud_cover_mid) || 0;

  const lcl = Math.max(0, 125 * (temp - dew));
  const base = Math.round(lcl / 50) * 50;

  let cloudStatus;
  let cloudLabel;
  let cloudApprox = false;

  if (cloudCover < 15) {
    cloudStatus = 'good';
    cloudLabel = 'Céu limpo';
    cloudApprox = true;
  } else if (lowCover >= 20) {
    cloudStatus = base < 200 ? 'bad' : base < 400 ? 'warn' : 'good';
    cloudLabel = `${Math.round(cloudCover)}% de cobertura`;
  } else if (midCover >= 20) {
    cloudStatus = 'good';
    cloudLabel = 'Nuvens médias';
    cloudApprox = true;
  } else {
    cloudStatus = 'good';
    cloudLabel = 'Nuvens altas';
    cloudApprox = true;
  }

  const cloudBase = cloudApprox ? (cloudCover < 15 ? 3000 : midCover >= 20 ? 2000 : 4000) : base;

  /* ---- Direção do vento (informativa, colorida pelo vento) ---- */
  const dir = Number(c.wind_direction_10m);
  const dirStatus = windStatus;

  /* ---- Status geral ---- */
  const all = [windStatus, gustStatus, tempStatus, skyStatus, cloudStatus];
  const overall = all.reduce(
    (acc, s) => (STATUS_RANK[s] > STATUS_RANK[acc] ? s : acc),
    'good'
  );

  /* ---- Motivos ---- */
  const reasons = [];

  if (skyStatus !== 'good') {
    let text;
    if (code >= 95) text = 'Risco de tempestade na região.';
    else if (code === 45 || code === 48) text = 'Nevoeiro — visibilidade reduzida.';
    else if (Number.isFinite(visibility) && visibility < 3000) {
      text = `Visibilidade de apenas ${fmt(visibility / 1000, 1)} km.`;
    }
    else if (skyStatus === 'bad') text = `${sky.label} na região — voo não recomendado.`;
    else text = 'Céu encoberto, sem chuva no momento.';
    reasons.push({ status: skyStatus, prio: 6, text });
  }

  if (gustStatus !== 'good') {
    const g = windValue(gust);
    reasons.push({
      status: gustStatus,
      prio: 5,
      text: gustStatus === 'bad'
        ? `Rajadas de ${g.text} ${g.unit} acima do limite do ${drone.name}.`
        : `Rajadas de ${g.text} ${g.unit} próximas do limite do drone.`,
    });
  }

  if (windStatus !== 'good') {
    const w = windValue(wind);
    reasons.push({
      status: windStatus,
      prio: 4,
      text: windStatus === 'bad'
        ? `Vento de ${w.text} ${w.unit} acima do limite do ${drone.name}.`
        : `Vento de ${w.text} ${w.unit} exigindo atenção.`,
    });
  }

  if (cloudStatus !== 'good') {
    reasons.push({
      status: cloudStatus,
      prio: 3,
      text: cloudStatus === 'bad'
        ? `Base das nuvens muito baixa (${fmt(base, 0)} m).`
        : `Nuvens a ${fmt(base, 0)} m — abaixo do ideal.`,
    });
  }

  if (tempStatus !== 'good') {
    reasons.push({
      status: tempStatus,
      prio: 2,
      text: tempStatus === 'bad'
        ? `Temperatura de ${fmt(temp)} °C fora da faixa operacional.`
        : `Temperatura de ${fmt(temp)} °C — atenção à bateria.`,
    });
  }

  reasons.sort((a, b) =>
    STATUS_RANK[b.status] - STATUS_RANK[a.status] || b.prio - a.prio
  );

  const reasonText = reasons.length
    ? reasons[0].text
    : `Vento e clima dentro dos limites do ${drone.name}.`;

  return {
    overall,
    reasonText,
    wind:  { value: wind,  status: windStatus,  ratio: windRatio },
    gust:  { value: gust,  status: gustStatus,  ratio: gustRatio },
    temp:  { value: temp,  status: tempStatus },
    sky:   { ...sky, status: skyStatus, code, cloudCover },
    cloud: { base: cloudBase, status: cloudStatus, cover: cloudCover, label: cloudLabel, approx: cloudApprox },
    dir:   { value: dir, status: dirStatus },
  };
}

/* ------------------------------------------------------------
   6. RENDERIZAÇÃO
   ------------------------------------------------------------ */
function render() {
  if (!state.weather?.current) return;

  const c = state.weather.current;
  const drone = getDrone();
  const a = assess(c, drone);

  renderVerdict(a, drone);
  renderTiles(a, drone, c);
  renderHourly(drone);

  el.updated.textContent = `Atualizado às ${timeOf(c.time)} · Open-Meteo`;
  state.hourKey = currentHourKey();
}

function renderVerdict(a, drone) {
  el.verdict.dataset.status = a.overall;

  el.verdictLabel.textContent =
    a.overall === 'good' ? 'Bom para voo'
    : a.overall === 'warn' ? 'Voo com atenção'
    : 'Ruim para voo';

  el.verdictDroneName.textContent = drone.name;
  el.verdictReason.textContent = a.reasonText;

  const max = drone.windLimit * 1.15;
  const pct = Math.min(100, (a.wind.value / max) * 100);
  el.windFill.style.width = `${pct}%`;
  el.windLimitMark.style.left = `${(drone.windLimit / max) * 100}%`;

  const now = windValue(a.wind.value);
  const lim = windValue(drone.windLimit);
  el.windNow.textContent = `${now.text} ${now.unit}`;
  el.windLimit.textContent = `${lim.text} ${lim.unit}`;
}

function renderTiles(a, drone, c) {
  /* --- Temperatura --- */
  el.tileTemp.dataset.status = a.temp.status;
  el.tempValue.innerHTML = `${fmt(a.temp.value)}<small>°C</small>`;
  el.tempSub.textContent = 'Ideal 5–32 °C';

  /* --- Céu --- */
  el.tileSky.dataset.status = a.sky.status;
  el.tileSky.dataset.weather = a.sky.icon;
  el.skyIcon.firstElementChild.setAttribute('href', `#${a.sky.icon}`);
  el.skyValue.textContent = a.sky.label;
  el.skySub.textContent = `${Math.round(a.sky.cloudCover)}% de nuvens`;

  /* --- Vento --- */
  const windNow = windValue(a.wind.value);
  el.tileWind.dataset.status = a.wind.status;
  el.windValue.innerHTML = `${windNow.text}<small>${windNow.unit}</small>`;
  el.windSub.textContent = `${Math.round(a.wind.ratio * 100)}% do limite`;

  /* --- Rajadas --- */
  const gustNow = windValue(a.gust.value);
  el.tileGust.dataset.status = a.gust.status;
  el.gustValue.innerHTML = `${gustNow.text}<small>${gustNow.unit}</small>`;
  el.gustSub.textContent = `${Math.round(a.gust.ratio * 100)}% do limite`;

  /* --- Nuvens --- */
  el.tileCloud.dataset.status = a.cloud.status;
  el.cloudValue.innerHTML = `${fmt(a.cloud.base, 0)}<small>m</small>`;
  el.cloudSub.textContent = a.cloud.label;

  /* --- Direção --- */
  const dirCardinal = cardinal(a.dir.value);
  el.tileDir.dataset.status = a.dir.status;
  el.dirValue.textContent = dirCardinal;
  el.dirSub.textContent = `Vindo de ${Math.round(a.dir.value)}°`;
  el.compass.setAttribute(
    'aria-label',
    `Vento vindo de ${dirCardinal} (${Math.round(a.dir.value)}°)`
  );
  /* A seta verde da bússola aponta para a origem do vento (de onde ele vem). */
  el.dirArrow.style.transform = `rotate(${a.dir.value}deg)`;
}

/* --- Ficha técnica do drone selecionado --- */
function renderDroneSpecs(drone) {
  const windKmh = `${fmt(drone.windLimit * 3.6, 0)} km/h`;
  const rows = [
    { label: 'Velocidade máxima', value: drone.specs.speed, hint: drone.specs.speedHint },
    { label: 'Rajada suportada', value: windKmh, hint: `alerta a partir de ${fmt(drone.windLimit * 3.6 * GUST_GOOD_RATIO, 0)} km/h` },
    { label: 'Vento suportado', value: windKmh, hint: `${fmt(drone.windLimit, 1)} m/s` },
    { label: 'Peso', value: drone.specs.weight },
    { label: 'Distância máxima', value: drone.specs.distance, hint: drone.specs.distanceHint },
    { label: 'Tempo estimado de voo', value: drone.specs.flightTime, hint: drone.specs.flightHint },
  ];

  const frag = document.createDocumentFragment();

  rows.forEach(({ label, value, hint }) => {
    const li = document.createElement('li');
    li.className = 'spec';

    const key = document.createElement('span');
    key.className = 'spec__label';
    key.textContent = label;

    const val = document.createElement('span');
    val.className = 'spec__val';

    const main = document.createElement('span');
    main.textContent = value;
    val.appendChild(main);

    if (hint) {
      const sub = document.createElement('span');
      sub.className = 'spec__hint';
      sub.textContent = hint;
      val.appendChild(sub);
    }

    li.append(key, val);
    frag.appendChild(li);
  });

  el.droneSpecs.replaceChildren(frag);
}

function renderHourly(drone) {
  const hourly = state.weather?.hourly;
  const now = state.weather?.current?.time;
  if (!hourly?.time || !now) {
    el.hourly.hidden = true;
    return;
  }

  /* Sempre começa na hora atual: quando vira a hora, a primeira sai
     e a lista desliza (ex.: 01,02,03... → 02,03,04...). */
  const hourKey = currentHourKey() || now.slice(0, 13);
  let start = hourly.time.findIndex((t) => t.slice(0, 13) === hourKey);
  if (start < 0) start = hourly.time.findIndex((t) => t >= now);
  if (start < 0) start = 0;

  const slice = hourly.time.slice(start, start + 5);
  if (!slice.length) {
    el.hourly.hidden = true;
    return;
  }

  const frag = document.createDocumentFragment();

  slice.forEach((t, i) => {
    const idx = start + i;
    const wind = Number(hourly.wind_speed_10m[idx]) || 0;
    const gust = Number(hourly.wind_gusts_10m[idx]) || 0;
    const ratio = wind / drone.windLimit;
    const gustRatio = gust / drone.windLimit;

    const status = Math.max(
      ratio <= WIND_GOOD_RATIO ? 0 : ratio <= WIND_WARN_RATIO ? 1 : 2,
      gustRatio <= GUST_GOOD_RATIO ? 0 : gustRatio <= GUST_WARN_RATIO ? 1 : 2
    );

    const card = document.createElement('div');
    card.className = 'hour';
    card.dataset.status = status === 0 ? 'good' : status === 1 ? 'warn' : 'bad';

    const time = document.createElement('div');
    time.className = 'hour__time';
    time.textContent = timeOf(t);

    const w = document.createElement('div');
    w.className = 'hour__wind';
    const wv = windValue(wind, 0);
    w.innerHTML = `${wv.text}<small>${wv.unit}</small>`;

    const g = document.createElement('div');
    g.className = 'hour__gust';
    g.textContent = `↑ ${windValue(gust, 0).text}`;

    card.append(time, w, g);
    frag.appendChild(card);
  });

  el.hourlyTrack.replaceChildren(frag);
  el.hourly.hidden = false;
}

/* ------------------------------------------------------------
   7. MENU DE DRONES
   ------------------------------------------------------------ */
function renderDroneList() {
  const frag = document.createDocumentFragment();

  DRONES.forEach((d) => {
    const li = document.createElement('li');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'drone';
    btn.dataset.id = d.id;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(d.id === state.droneId));

    btn.innerHTML = `
      <span class="drone__mark"><svg class="icon"><use href="#i-drone"/></svg></span>
      <span class="drone__body">
        <span class="drone__name"></span>
        <span class="drone__meta"></span>
      </span>
      <span class="drone__check"><svg class="icon"><use href="#i-check"/></svg></span>
    `;

    btn.querySelector('.drone__name').textContent = d.name;
    btn.querySelector('.drone__meta').textContent =
      `Suporta até ${fmt(d.windLimit * 3.6, 0)} km/h de vento`;

    btn.addEventListener('click', () => selectDrone(d.id));

    li.appendChild(btn);
    frag.appendChild(li);
  });

  el.droneList.replaceChildren(frag);
  syncDroneList();
}

function syncDroneList() {
  el.droneList.querySelectorAll('.drone').forEach((btn) => {
    const active = btn.dataset.id === state.droneId;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

function selectDrone(id) {
  if (!DRONES.some((d) => d.id === id)) return;
  state.droneId = id;
  localStorage.setItem(STORAGE.drone, id);

  syncDroneList();
  closeDrawer();

  if (state.weather) render();

  const d = getDrone();
  toast(`Drone selecionado: ${d.name}`);
  if (navigator.vibrate) navigator.vibrate(8);
}

function openDrawer() {
  el.scrim.hidden = false;
  requestAnimationFrame(() => {
    el.scrim.classList.add('is-visible');
    el.drawer.classList.add('is-open');
  });
  el.drawer.setAttribute('aria-hidden', 'false');
  el.menuBtn.setAttribute('aria-expanded', 'true');
  document.body.classList.add('no-scroll');
}

function closeDrawer() {
  el.drawer.classList.remove('is-open');
  el.scrim.classList.remove('is-visible');
  el.drawer.setAttribute('aria-hidden', 'true');
  el.menuBtn.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { el.scrim.hidden = true; }, 280);
}

/* ------------------------------------------------------------
   7.1 FICHA DO DRONE
   ------------------------------------------------------------ */
function openDroneModal() {
  const drone = getDrone();
  el.droneTitle.textContent = drone.name;
  renderDroneSpecs(drone);

  el.droneModal.hidden = false;
  requestAnimationFrame(() => el.droneModal.classList.add('is-open'));
  document.body.classList.add('no-scroll');
  setTimeout(() => el.droneClose.focus({ preventScroll: true }), 320);
}

function closeDroneModal() {
  el.droneModal.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { el.droneModal.hidden = true; }, 280);
}

/* ------------------------------------------------------------
   8. LOCALIZAÇÃO
   ------------------------------------------------------------ */
function setPlaceLabel(place) {
  if (!place) return;
  const parts = [place.name];
  if (place.admin && place.admin !== place.name) parts.push(place.admin);
  el.placeName.textContent = parts.filter(Boolean).join(' · ');
}

function openModal() {
  el.locModal.hidden = false;
  requestAnimationFrame(() => el.locModal.classList.add('is-open'));
  document.body.classList.add('no-scroll');
  setTimeout(() => el.locInput.focus({ preventScroll: true }), 320);
}

function closeModal() {
  el.locModal.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { el.locModal.hidden = true; }, 280);
}

function choosePlace(place, silent = false) {
  state.place = place;
  localStorage.setItem(STORAGE.place, JSON.stringify(place));
  setPlaceLabel(place);
  closeModal();
  loadWeather();
  if (!silent) toast(`Local: ${place.name}`);
}

function detectLocation() {
  if (!navigator.geolocation) {
    toast('Geolocalização não suportada neste navegador.');
    if (!state.place) choosePlace(DEFAULT_PLACE, true);
    return;
  }

  toast('Obtendo sua localização…');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const place = {
        latitude,
        longitude,
        name: 'Minha localização',
        admin: '',
        country: '',
      };

      try {
        const res = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`
        );
        if (res.ok) {
          const j = await res.json();
          const city = j.city || j.locality || j.principalSubdivision;
          if (city) place.name = city;
          if (j.principalSubdivision && j.principalSubdivision !== city) {
            place.admin = j.principalSubdivision;
          }
          if (j.countryName) place.country = j.countryName;
        }
      } catch { /* mantém "Minha localização" */ }

      choosePlace(place);
    },
    () => {
      toast('Não foi possível obter sua localização.');
      if (!state.place) choosePlace(DEFAULT_PLACE, true);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/* ---------- Busca de cidades ---------- */
let searchTimer = null;
let searchSeq = 0;

function renderSearchMessage(text) {
  const li = document.createElement('li');
  li.className = 'results__empty';
  li.textContent = text;
  el.locResults.replaceChildren(li);
}

async function runSearch(query) {
  const seq = ++searchSeq;
  renderSearchMessage('Buscando…');

  try {
    const res = await fetch(
      `${API_GEOCODE}?name=${encodeURIComponent(query)}&count=8&language=pt&format=json`
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (seq !== searchSeq) return;

    const results = json.results || [];
    if (!results.length) {
      renderSearchMessage('Nenhum local encontrado.');
      return;
    }

    const frag = document.createDocumentFragment();

    results.forEach((r) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'result';
      btn.innerHTML = `
        <svg class="icon icon--sm result__pin" aria-hidden="true"><use href="#i-pin"/></svg>
        <span>
          <span class="result__name"></span>
          <span class="result__meta"></span>
        </span>
      `;
      btn.querySelector('.result__name').textContent = r.name;
      btn.querySelector('.result__meta').textContent =
        [r.admin1, r.country].filter(Boolean).join(' · ') || '—';

      btn.addEventListener('click', () => {
        choosePlace({
          latitude: r.latitude,
          longitude: r.longitude,
          name: r.name,
          admin: r.admin1 || '',
          country: r.country || '',
        });
      });

      li.appendChild(btn);
      frag.appendChild(li);
    });

    el.locResults.replaceChildren(frag);
  } catch {
    if (seq === searchSeq) renderSearchMessage('Falha na busca. Tente novamente.');
  }
}

/* ------------------------------------------------------------
   9. DADOS METEOROLÓGICOS
   ------------------------------------------------------------ */
async function fetchWeather() {
  const { latitude, longitude } = state.place;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'dew_point_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      'visibility',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'precipitation_probability',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
    timezone: 'auto',
    wind_speed_unit: 'ms',
    forecast_days: '2',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_FORECAST}?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadWeather() {
  if (!state.place || state.loading) return;

  state.loading = true;
  state.lastAttemptAt = Date.now();
  document.body.classList.add('is-spinning');
  el.main.classList.add('is-loading');

  if (!state.weather) {
    el.verdict.dataset.status = 'loading';
    el.verdictLabel.textContent = 'Analisando…';
    el.verdictReason.textContent = 'Buscando condições de voo…';
  }

  try {
    const data = await fetchWeather();
    state.weather = data;
    state.fetchedAt = Date.now();
    render();
  } catch (err) {
    if (!state.weather) {
      el.verdict.dataset.status = 'loading';
      el.verdictLabel.textContent = 'Sem dados';
      el.verdictReason.textContent =
        'Não foi possível carregar as condições. Verifique a conexão e toque em atualizar.';
    }
    toast('Falha ao buscar dados meteorológicos.');
    console.error(err);
  } finally {
    state.loading = false;
    document.body.classList.remove('is-spinning');
    el.main.classList.remove('is-loading');
  }
}

/* ------------------------------------------------------------
   10. EVENTOS
   ------------------------------------------------------------ */
function bindEvents() {
  el.menuBtn.addEventListener('click', openDrawer);
  el.drawerClose.addEventListener('click', closeDrawer);
  el.scrim.addEventListener('click', closeDrawer);

  /* Toque no nome do drone abre a ficha técnica. */
  el.verdictDrone.addEventListener('click', openDroneModal);
  el.droneClose.addEventListener('click', closeDroneModal);
  el.droneModal.querySelector('[data-close-drone-modal]')
    .addEventListener('click', closeDroneModal);

  el.droneSwap.addEventListener('click', () => {
    closeDroneModal();
    setTimeout(openDrawer, 240);
  });

  el.refreshBtn.addEventListener('click', () => {
    if (state.loading) return;
    loadWeather();
  });

  /* Toque em "Limite …" alterna km/h ⇄ m/s (volta ao km/h ao recarregar) */
  el.unitToggle.addEventListener('click', () => {
    state.windUnit = state.windUnit === 'kmh' ? 'ms' : 'kmh';
    if (state.weather) render();
    toast(state.windUnit === 'ms' ? 'Vento em m/s' : 'Vento em km/h');
  });

  el.locationBtn.addEventListener('click', () => {
    openModal();
    el.locResults.replaceChildren();
    el.locInput.value = '';
    if (!state.place) return;
    const li = document.createElement('li');
    li.className = 'results__empty';
    li.textContent = 'Digite o nome do local ou use sua localização atual.';
    el.locResults.replaceChildren(li);
  });

  el.gpsBtn.addEventListener('click', detectLocation);

  el.locInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = el.locInput.value.trim();
    if (q.length < 2) {
      renderSearchMessage('Digite ao menos 2 letras.');
      return;
    }
    searchTimer = setTimeout(() => runSearch(q), 420);
  });

  el.locModal.querySelector('[data-close-modal]').addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (el.locModal.classList.contains('is-open')) closeModal();
    else if (el.droneModal.classList.contains('is-open')) closeDroneModal();
    else if (el.drawer.classList.contains('is-open')) closeDrawer();
  });

  /* Atualiza ao voltar para o app (se passou mais de 3 min) */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!state.lastAttemptAt) return;
    if (Date.now() - state.lastAttemptAt > RETURN_REFRESH_MS) loadWeather();
  });
}

/* ------------------------------------------------------------
   11. PWA
   ------------------------------------------------------------ */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* opcional */ });
  });
}

/* ------------------------------------------------------------
   12. INICIALIZAÇÃO
   ------------------------------------------------------------ */
function init() {
  renderDroneList();
  bindEvents();

  if (state.place) {
    setPlaceLabel(state.place);
    loadWeather();
  } else {
    setPlaceLabel(DEFAULT_PLACE);
    detectLocation();
  }

  registerSW();

  /* A cada minuto verifica se já passaram 10 min (atualiza sozinho)
     ou se virou a hora (para a faixa "Próximas horas" deslizar). */
  setInterval(() => {
    if (state.loading) return;
    if (document.visibilityState !== 'visible') return;

    const key = currentHourKey();
    const hourChanged = Boolean(key && state.hourKey && key !== state.hourKey);
    const stale = Boolean(state.lastAttemptAt && Date.now() - state.lastAttemptAt >= AUTO_REFRESH_MS);

    if (hourChanged) state.hourKey = key;
    if (hourChanged || stale) loadWeather();
  }, 60 * 1000);
}

init();
