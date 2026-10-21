const $ = (query, root = document) => root.querySelector(query);
const $$ = (query, root = document) => [...root.querySelectorAll(query)];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  truck:
    '<path d="M3 7h12v11H3zM15 11h4l3 4v3h-7M6 7V4h5v3M5 11h7M5 14h7"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M18 11v4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  out: '<path d="M9 5H4v14h5M9 12h12M17 8l4 4-4 4"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.info}</svg>`;
const statusLabels = {
  unverified: "E-Mail unbestätigt",
  pending: "Freigabe ausstehend",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
  expired: "Abgelaufen",
  completed: "Abgeschlossen",
  blocked: "Gesperrt",
};
const badge = (status) =>
  `<span class="badge ${esc(status)}">${esc(statusLabels[status] || status)}</span>`;
const local = (ms) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
const dateText = (ms, options = {}) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    ...options,
  }).format(new Date(ms));
const period = (b) =>
  `${dateText(b.start, { dateStyle: "medium", timeStyle: "short" })} – ${dateText(b.end - (b.allDay || b.all_day ? 60000 : 0), { dateStyle: "medium", timeStyle: "short" })} Uhr`;
const dayKey = (ms) => local(ms).slice(0, 10);
const fromKey = (key) => new Date(`${key}T12:00:00Z`);
const shiftDay = (key, delta) => {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const today = () => dayKey(Date.now());
const dateValue = (date) => date.toISOString().slice(0, 10);
const state = {
  session: null,
  vehicles: [],
  data: { bookings: [], blocks: [] },
  todayData: { bookings: [], blocks: [] },
  page: "overview",
  view: matchMedia("(max-width:600px)").matches ? "week" : "month",
  date: fromKey(today()),
  filter: "",
  adminTab: "bookings",
  overview: null,
};

async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(state.session ? { "X-CSRF-Token": state.session.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/pin" && path !== "/admin/login") {
      state.session = await api("/session");
      renderGate();
    }
    throw new Error(
      result.message || "Die Anfrage konnte nicht ausgeführt werden.",
    );
  }
  if (result.csrf && state.session) Object.assign(state.session, result);
  return result;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("visible"), 5000);
}
function bind(query, event, handler, root = document) {
  $$(query, root).forEach((el) => el.addEventListener(event, handler));
}
function paint() {
  $$("[data-color]").forEach((el) => {
    if (/^#[a-f\d]{6}$/i.test(el.dataset.color))
      el.style.backgroundColor = el.dataset.color;
  });
}
function formData(form) {
  const data = Object.fromEntries(new FormData(form));
  $$("input[type=checkbox][name]", form).forEach((el) => {
    if (!el.name.endsWith("Ids")) data[el.name] = el.checked;
  });
  return data;
}
function showModal(title, body) {
  const modal = $("#modal");
  modal.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" id="close-modal" aria-label="Schließen">${icon("close")}</button></div><div class="modal-body">${body}</div>`;
  $("#close-modal").onclick = () => modal.close();
  if (!modal.open) modal.showModal();
  return modal;
}
function errorIn(root, message) {
  let el = $(".form-error", root);
  if (!el) {
    el = document.createElement("div");
    el.className = "form-error error";
    el.setAttribute("role", "alert");
    root.prepend(el);
  }
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest" });
}
async function submitForm(event, action) {
  event.preventDefault();
  const form = event.currentTarget,
    button = $("[type=submit]", form);
  if (button) button.disabled = true;
  try {
    await action(formData(form), form);
  } catch (error) {
    errorIn(form, error.message);
  } finally {
    if (button) button.disabled = false;
  }
}
function field(
  label,
  name,
  value = "",
  type = "text",
  required = false,
  extra = "",
) {
  return `<div class="field"><label for="f-${esc(name)}">${esc(label)}</label><input id="f-${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${extra}></div>`;
}
function textarea(label, name, value = "", max = 2000) {
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><textarea id="f-${name}" name="${name}" maxlength="${max}">${esc(value)}</textarea></div>`;
}
function selectField(label, name, options, current = "") {
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${options.map(([value, label]) => `<option value="${esc(value)}" ${String(current) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></div>`;
}

function renderGate() {
  $("#app").innerHTML =
    `<div class="gate"><section class="gate-story"><div class="brand"><img src="/icon.svg" alt=""><div><strong>BlaulichtBooking</strong><small>Fahrzeuge. Gemeinsam. Planen.</small></div></div><div class="eyebrow">${esc(state.session.siteName)}</div><h1>Für jeden Einsatz.<br>Für jeden <span>Plan.</span></h1><p>Fahrzeuge anfragen, Belegung im Blick behalten und gemeinsam gut organisiert sein.</p><footer>Ein Buchungssystem für unsere Feuerwehr.</footer></section><main class="gate-form" id="main"><h2>Gude, schön dich zu sehen.</h2><p>Gib unsere vierstellige PIN ein, um die Fahrzeugbuchung zu öffnen.</p><form id="pin-form"><label for="pin">Website-PIN</label><input class="pin-input" id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" autocomplete="off" required aria-label="Vierstellige Website-PIN"><button class="btn dark" type="submit">${icon("lock")} Buchungssystem öffnen ${icon("right")}</button></form><p class="gate-note">Den Zugang erhältst du bei deiner Feuerwehr.</p></main></div>`;
  $("#pin-form").onsubmit = (event) =>
    submitForm(event, async (data) => {
      await api("/pin", data);
      await start();
    });
}
function shell() {
  const nav = (page, symbol, label) =>
    `<button data-nav="${page}" class="${state.page === page ? "active" : ""}" title="${label}" aria-label="${label}" ${state.page === page ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span></button>`;
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar"><div class="brand"><img src="/icon.svg" alt=""><div><strong>BlaulichtBooking</strong><small>Fahrzeugverwaltung</small></div></div><div class="nav-label">Planen & organisieren</div><nav class="nav" aria-label="Hauptnavigation">${nav("overview", "grid", "Übersicht")}${nav("calendar", "calendar", "Belegungskalender")}${nav("fleet", "truck", "Fahrzeuge")}<button data-book title="Fahrzeug buchen" aria-label="Fahrzeug buchen">${icon("plus")}<span>Fahrzeug buchen</span></button><button data-nav="admin" class="${state.page === "admin" ? "active" : ""}" title="Verwaltung" aria-label="Verwaltung">${icon("settings")}<span>Verwaltung</span></button></nav><div class="sidebar-bottom"><div class="nav"><button id="logout">${icon("out")}<span>Abmelden</span></button></div><div class="secured">${icon("shield")} Geschützter Feuerwehrbereich</div></div></aside><div class="content"><header class="topbar"><div class="location">${icon("shield")} ${esc(state.session.siteName)}</div><div class="top-actions"><div class="access-pill"><span class="status-dot"></span><span>Interner Bereich</span></div><button class="avatar" id="account" aria-label="Zugang und Abmeldung">${icon("user")}</button></div></header><main id="main" class="page" tabindex="-1"></main></div></div>`;
  bind("[data-nav]", "click", (event) =>
    navigate(event.currentTarget.dataset.nav),
  );
  bind("[data-book]", "click", () => bookingWizard());
  $("#logout").onclick = async () => {
    await api("/logout", {});
    state.session = await api("/session");
    renderGate();
  };
  $("#account").onclick = () => {
    showModal(
      "Dein Zugang",
      `<p>Du bist im internen Bereich${state.session.admin ? " als Administrator" : " über die gemeinsame PIN"} angemeldet.</p><div class="modal-footer"><button class="btn secondary" id="account-logout">Abmelden</button></div>`,
    );
    $("#account-logout").onclick = () => {
      $("#modal").close();
      $("#logout").click();
    };
  };
}
async function loadCalendar() {
  const first = new Date(state.date);
  first.setUTCDate(1);
  first.setUTCMonth(first.getUTCMonth() - 1);
  const end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + 3);
  [state.data, state.todayData] = await Promise.all([
    api(
      `/calendar?start=${first.getTime() - 86400000}&end=${end.getTime() + 86400000}`,
    ),
    api(
      `/calendar?start=${Date.now() - 2 * 86400000}&end=${Date.now() + 2 * 86400000}`,
    ),
  ]);
}
async function start() {
  state.session = await api("/session");
  if (!state.session.pin) return renderGate();
  state.vehicles = await api("/vehicles");
  await loadCalendar();
  const match = location.hash.match(
    /^#\/(verify|manage|approve)\/([A-Za-z0-9_-]+)$/,
  );
  if (match) {
    shell();
    await linkPage(match[2]);
  } else await navigate(state.page);
}
async function navigate(page) {
  state.page = page;
  if (location.hash.startsWith("#/"))
    history.replaceState(null, "", location.pathname);
  shell();
  try {
    if (page === "admin") await adminPage();
    else if (page === "fleet") fleetPage();
    else {
      await loadCalendar();
      overviewPage(page === "calendar");
    }
  } catch (error) {
    $("#main").innerHTML = `<div class="error">${esc(error.message)}</div>`;
  }
}
function head(title, subtitle, action = true) {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${action ? `<button class="btn primary" data-book>${icon("plus")} Neue Buchung</button>` : ""}</div>`;
}
function bookingRows(bookings) {
  if (!bookings.length)
    return `<div class="empty">${icon("calendar")}Hier sind noch keine Buchungen geplant.</div>`;
  return bookings
    .map(
      (b) =>
        `<button class="booking-row" data-detail="${b.id}"><div class="date-tile"><strong>${dateText(b.start, { day: "2-digit" })}</strong><span>${dateText(b.start, { month: "short" }).replace(".", "")}</span></div><div class="row-main"><strong>${esc(b.purpose)}</strong><small>${esc(b.vehicles.map((v) => v.name).join(", "))} · ${esc(b.name)}<br>${esc(period(b))}</small></div>${badge(b.status)}${icon("right")}</button>`,
    )
    .join("");
}
function overviewPage(calendarOnly = false) {
  const now = Date.now(),
    upcoming = state.data.bookings
      .filter(
        (b) =>
          b.end > now &&
          (!state.filter || b.vehicles.some((v) => v.id === state.filter)),
      )
      .sort((a, b) => a.start - b.start);
  const dayBookings = state.todayData.bookings.filter(
    (b) => dayKey(b.start) <= today() && dayKey(b.end - 1) >= today(),
  );
  const busy = new Set(
    dayBookings
      .filter((b) => b.status === "approved")
      .flatMap((b) => b.vehicles.map((v) => v.id)),
  );
  const blocksNow = state.todayData.blocks.filter(
    (b) => dayKey(b.start) <= today() && dayKey(b.end - 1) >= today(),
  );
  blocksNow.forEach((b) => busy.add(b.vehicle_id));
  const free = state.vehicles.filter((v) => !busy.has(v.id));
  $("#main").innerHTML =
    head(
      calendarOnly ? "Belegungskalender" : "Alles im Blick.",
      calendarOnly
        ? "Gemeinsam planen. Überschneidungen früh erkennen."
        : `${esc(dateText(now, { weekday: "long", day: "numeric", month: "long" }))} · Unsere Fahrzeuge, eure Vorhaben.`,
    ) +
    (calendarOnly
      ? ""
      : `<div class="stats"><div class="stat"><div class="stat-icon">${icon("truck")}</div><div><strong>${state.vehicles.length}</strong><span>Fahrzeuge im Fuhrpark</span></div></div><div class="stat"><div class="stat-icon">${icon("check")}</div><div><strong>${free.length}</strong><span>Heute ohne feste Belegung</span></div></div><div class="stat"><div class="stat-icon">${icon("clock")}</div><div><strong>${upcoming.filter((b) => b.status === "pending").length}</strong><span>Offene Freigaben im Zeitraum</span></div></div></div>`) +
    `<div class="${calendarOnly ? "" : "dashboard-grid"}"><section><div class="panel" id="calendar-panel"></div><div class="panel upcoming"><div class="panel-head"><div><h2>Nächste Buchungen</h2><p>Die anstehenden Termine im angezeigten Zeitraum.</p></div><span class="eyebrow">${upcoming.length} Termine</span></div>${bookingRows(upcoming.slice(0, 6))}</div></section>${calendarOnly ? "" : `<aside class="side-stack"><section class="panel"><div class="panel-head"><div><h2>Unser Fuhrpark</h2><p>Belegung heute · ${dateText(now, { day: "2-digit", month: "2-digit" })}</p></div>${icon("truck")}</div><div class="panel-body">${state.vehicles.length ? state.vehicles.map((v) => `<div class="fleet-status"><div class="truck-tile">${icon("truck")}</div><div><strong>${esc(v.name)}</strong><small>${esc(v.callsign || v.plate || "Fahrzeug")}</small></div><span class="availability ${busy.has(v.id) ? "busy" : "free"}">${busy.has(v.id) ? "Belegt / gesperrt" : "Ohne Belegung"}</span></div>`).join("") : '<p class="muted">Die Verwaltung kann jetzt Fahrzeuge und Freigabepersonen anlegen.</p>'}</div></section><section class="hint-card">${icon("info")}<h3>Gut zu wissen</h3><p>Deine Anfrage ist erst nach der Freigabe verbindlich. Bei mehreren Fahrzeugen müssen alle freigegeben sein.</p><p>Ganztägig heißt bei uns: 06:00 bis 23:59 Uhr. Über mehrere Tage bleibt das Fahrzeug durchgehend reserviert.</p></section></aside>`}</div><div class="footer-note"><span>Alle Uhrzeiten: Europe/Berlin · Namen sichtbar, E-Mail-Adressen geschützt.</span><span>BlaulichtBooking</span></div>`;
  renderCalendar();
  bind("[data-book]", "click", () => bookingWizard(), $("#main"));
  bind(
    "[data-detail]",
    "click",
    (event) => showBooking(event.currentTarget.dataset.detail),
    $("#main"),
  );
}
function entries(key) {
  return [
    ...state.data.bookings
      .filter(
        (b) =>
          dayKey(b.start) <= key &&
          dayKey(b.end - 1) >= key &&
          (!state.filter || b.vehicles.some((v) => v.id === state.filter)),
      )
      .map((b) => ({
        ...b,
        title: b.purpose,
        color: b.vehicles.find((v) => !state.filter || v.id === state.filter)
          ?.color,
        vehicleNames: b.vehicles
          .filter((v) => !state.filter || v.id === state.filter)
          .map((v) => v.name)
          .join(", "),
        block: false,
      })),
    ...state.data.blocks
      .filter(
        (b) =>
          dayKey(b.start) <= key &&
          dayKey(b.end - 1) >= key &&
          (!state.filter || b.vehicle_id === state.filter),
      )
      .map((b) => ({
        ...b,
        status: "blocked",
        title: b.reason,
        vehicleNames: b.vehicle_name,
        block: true,
      })),
  ].sort((a, b) => a.start - b.start);
}
function calEvent(e, expanded = false) {
  const title = `${e.vehicleNames} · ${e.title}${e.name ? " · " + e.name : ""} · ${statusLabels[e.status]} · ${period(e)}`;
  return `<button class="cal-event ${e.status}" data-${e.block ? "block" : "detail"}="${e.id}" title="${esc(title)}"><span class="dot" data-color="${esc(e.color)}"></span>${expanded ? `<strong>${esc(e.vehicleNames)}</strong><br>` : `${esc(e.vehicleNames)} · `}${esc(e.title)}${expanded ? `<br>${esc(dateText(e.start, { hour: "2-digit", minute: "2-digit" }))}–${esc(dateText(e.end - (e.allDay || e.all_day ? 60000 : 0), { hour: "2-digit", minute: "2-digit" }))} · ${esc(e.name || "Sperre")}<br>${esc(statusLabels[e.status])}` : ""}</button>`;
}
function renderCalendar() {
  const panel = $("#calendar-panel");
  if (!panel) return;
  const title =
    state.view === "month"
      ? dateText(state.date, { month: "long", year: "numeric" })
      : dateText(state.date, {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
  let body = "";
  if (state.view === "month") {
    const first = new Date(state.date);
    first.setUTCDate(1);
    const firstKey = shiftDay(dateValue(first), -((first.getUTCDay() + 6) % 7));
    body = `<div class="weekdays">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => `<span>${d}</span>`).join("")}</div><div class="month-grid">${Array.from(
      { length: 42 },
      (_, i) => {
        const key = shiftDay(firstKey, i),
          d = fromKey(key),
          items = entries(key);
        return `<div class="day ${d.getUTCMonth() !== state.date.getUTCMonth() ? "other" : ""} ${key === today() ? "today" : ""}"><button class="day-num" data-day="${key}" aria-label="${esc(dateText(d, { dateStyle: "full" }))}">${d.getUTCDate()}</button>${items
          .slice(0, 2)
          .map((e) => calEvent(e))
          .join(
            "",
          )}${items.length > 2 ? `<button class="more" data-day="${key}">+${items.length - 2} weitere</button>` : ""}</div>`;
      },
    ).join("")}</div>`;
  } else if (state.view === "week") {
    const firstKey = shiftDay(
      dateValue(state.date),
      -((state.date.getUTCDay() + 6) % 7),
    );
    body = `<div class="agenda">${Array.from({ length: 7 }, (_, i) => {
      const key = shiftDay(firstKey, i),
        items = entries(key);
      return `<section class="agenda-day"><h3>${esc(dateText(fromKey(key), { weekday: "short", day: "numeric", month: "numeric" }))}</h3>${items.length ? items.map((e) => calEvent(e, true)).join("") : "<small>Keine Belegung</small>"}</section>`;
    }).join("")}</div>`;
  } else {
    const key = dateValue(state.date),
      items = entries(key);
    body = `<div class="day-view">${items.length ? "" : '<div class="notice success">Für diesen Tag liegen keine Belegungen vor.</div>'}${Array.from(
      { length: 24 },
      (_, hour) => {
        const matching = items.filter((e) =>
          dayKey(e.start) < key
            ? hour === 0
            : Number(local(e.start).slice(11, 13)) === hour,
        );
        return `<div class="timeline-row"><span>${String(hour).padStart(2, "0")}:00</span><div>${matching.map((e) => calEvent(e, true)).join("")}</div></div>`;
      },
    ).join("")}</div>`;
  }
  panel.innerHTML = `<div class="calendar-toolbar"><div class="calendar-nav"><button class="icon-btn" data-shift="-1" aria-label="Vorheriger Zeitraum">${icon("left")}</button><button class="icon-btn" data-shift="1" aria-label="Nächster Zeitraum">${icon("right")}</button><h2 class="calendar-title">${esc(title)}</h2><button class="btn small secondary" id="today">Heute</button></div><div class="calendar-controls"><select id="vehicle-filter" aria-label="Kalender nach Fahrzeug filtern"><option value="">Alle Fahrzeuge</option>${state.vehicles.map((v) => `<option value="${v.id}" ${v.id === state.filter ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select><div class="segments" aria-label="Kalenderansicht">${[
    ["month", "Monat"],
    ["week", "Woche"],
    ["day", "Tag"],
  ]
    .map(
      ([v, label]) =>
        `<button data-view="${v}" class="${v === state.view ? "active" : ""}" aria-pressed="${v === state.view}">${label}</button>`,
    )
    .join(
      "",
    )}</div></div></div>${body}<div class="legend"><span><i></i> Genehmigt / abgeschlossen</span><span class="pending"><i></i> Angefragt</span><span class="blocked"><i></i> Gesperrt</span></div>`;
  const redraw = async () => {
    try {
      await loadCalendar();
      overviewPage(state.page === "calendar");
    } catch (error) {
      toast(error.message);
    }
  };
  bind(
    "[data-shift]",
    "click",
    (e) => {
      const value = Number(e.currentTarget.dataset.shift);
      if (state.view === "month") {
        state.date.setUTCDate(1);
        state.date.setUTCMonth(state.date.getUTCMonth() + value);
      } else
        state.date.setUTCDate(
          state.date.getUTCDate() + value * (state.view === "week" ? 7 : 1),
        );
      redraw();
    },
    panel,
  );
  bind(
    "[data-view]",
    "click",
    (e) => {
      state.view = e.currentTarget.dataset.view;
      renderCalendar();
    },
    panel,
  );
  bind(
    "[data-day]",
    "click",
    (e) => {
      state.date = fromKey(e.currentTarget.dataset.day);
      state.view = "day";
      renderCalendar();
    },
    panel,
  );
  bind(
    "[data-detail]",
    "click",
    (e) => showBooking(e.currentTarget.dataset.detail),
    panel,
  );
  bind(
    "[data-block]",
    "click",
    (e) => {
      const b = state.data.blocks.find(
        (b) => b.id === e.currentTarget.dataset.block,
      );
      showModal(
        "Fahrzeugsperre",
        `<div class="notice warning"><strong>${esc(b.vehicle_name)}</strong><p>${esc(b.reason)}</p><p>${esc(period(b))}</p></div>`,
      );
    },
    panel,
  );
  $("#today").onclick = () => {
    state.date = fromKey(today());
    redraw();
  };
  $("#vehicle-filter").onchange = (e) => {
    state.filter = e.target.value;
    redraw();
  };
  paint();
}
function summary(b, privateView = false) {
  return `<div class="summary"><dl><dt>Fahrzeuge</dt><dd>${b.vehicles.map((v) => `<span class="dot" data-color="${esc(v.color)}"></span>${esc(v.name)}`).join("<br>")}</dd><dt>Zeitraum</dt><dd>${esc(period(b))}${b.allDay || b.all_day ? "<br><small>Durchgehend · Ganztagsmodus</small>" : ""}</dd><dt>Zweck</dt><dd>${esc(b.purpose)}</dd><dt>Gebucht von</dt><dd>${esc(b.name)}</dd>${privateView ? `<dt>E-Mail</dt><dd>${esc(b.email)}</dd>` : ""}${b.department ? `<dt>Abteilung</dt><dd>${esc(b.department)}</dd>` : ""}${privateView && b.notes ? `<dt>Bemerkung</dt><dd>${esc(b.notes)}</dd>` : ""}<dt>Status</dt><dd>${badge(b.status)}</dd></dl></div>`;
}
function showBooking(id) {
  const b = state.data.bookings.find((b) => b.id === id);
  if (!b) return;
  showModal(
    "Buchungsdetails",
    `${summary(b)}<p class="privacy divider"></p><p class="privacy">Eine fremde Buchung kann hier nicht geändert werden. Nutze für deine eigene Buchung den persönlichen Link aus deiner E-Mail.</p>`,
  );
  paint();
}
function fleetPage() {
  $("#main").innerHTML =
    head(
      "Unser Fuhrpark",
      "Das passende Fahrzeug für euer nächstes Vorhaben.",
    ) +
    `<div class="fleet-grid">${state.vehicles.map((v) => `<article class="vehicle-card"><div class="vehicle-art">${v.image ? `<img src="${esc(v.image)}" alt="${esc(v.name)}" loading="lazy">` : icon("truck")}</div><div class="panel-body"><h3><span class="dot" data-color="${esc(v.color)}"></span>${esc(v.name)}</h3><small>${esc(v.callsign)}</small><p>${esc(v.description || "Für eure Vorhaben anfragen und gemeinsam planen.")}</p><div class="vehicle-meta"><span>${v.seats ? `${v.seats} Sitzplätze` : "Sitzplätze nicht hinterlegt"}</span><span>${esc(v.plate)}</span></div><button class="btn secondary" data-vehicle-book="${v.id}">${icon("plus")} Fahrzeug anfragen</button></div></article>`).join("") || '<div class="panel empty">Noch keine Fahrzeuge eingerichtet. Lege zuerst Freigabepersonen und anschließend Fahrzeuge in der Verwaltung an.</div>'}</div>`;
  bind("[data-book]", "click", () => bookingWizard(), $("#main"));
  bind(
    "[data-vehicle-book]",
    "click",
    (e) => bookingWizard({ vehicleIds: [e.currentTarget.dataset.vehicleBook] }),
    $("#main"),
  );
  paint();
}
function conflictHtml(conflicts) {
  return conflicts.length
    ? `<div class="notice warning"><strong>Überschneidungen vorhanden</strong>${conflicts.map((c) => `<div class="conflict"><strong>${esc(c.vehicle_name)} · ${c.blocking ? "Verbindliche Belegung / Sperre" : "Offene Anfrage"}</strong>${esc(c.purpose)} · ${esc(c.name)}<br>${esc(period(c))}</div>`).join("")}<p>Du kannst trotzdem anfragen. Bestätigte Überschneidungen und Sperren müssen vor einer Genehmigung geklärt werden.</p></div>`
    : '<div class="notice success">Keine Überschneidungen im gewählten Zeitraum gefunden.</div>';
}
function bookingWizard(options = {}) {
  const editing = options.booking,
    manual = options.manual;
  const nextDay = shiftDay(today(), 1);
  const initial = editing
    ? {
        name: editing.name,
        email: editing.email,
        purpose: editing.purpose,
        department: editing.department,
        notes: editing.notes,
        startDate: dayKey(editing.start),
        endDate: dayKey(editing.end - (editing.allDay ? 60000 : 0)),
        startTime: local(editing.start).slice(11, 16),
        endTime: local(editing.end - (editing.allDay ? 60000 : 0)).slice(
          11,
          16,
        ),
        allDay: editing.allDay,
      }
    : {
        startDate: nextDay,
        endDate: nextDay,
        startTime: "18:00",
        endTime: "20:00",
      };
  const chosen = options.vehicleIds || editing?.vehicles.map((v) => v.id) || [];
  let step = 0,
    draft = {},
    conflicts = [],
    checkVersion = 0,
    conflictTimer;
  const modal = showModal(
    editing
      ? "Buchung ändern"
      : manual
        ? "Direkte Admin-Buchung"
        : "Neue Fahrzeugbuchung",
    `<form id="booking-form" novalidate><div class="wizard-progress">${[0, 1, 2].map(() => "<span></span>").join("")}</div><div class="form-error error" hidden role="alert"></div><section data-step="0"><div class="step-label">Schritt 1 von 3</div><h3 class="step-title">Was habt ihr vor?</h3><p class="step-intro">Wähle ein oder mehrere Fahrzeuge und euren Zeitraum.</p><div class="vehicle-options">${state.vehicles.map((v) => `<label class="vehicle-option">${icon("truck")}<span>${esc(v.name)}<small>${esc(v.callsign)}${v.seats ? ` · ${v.seats} Plätze` : ""}</small></span><input type="checkbox" name="vehicleIds" value="${v.id}" ${chosen.includes(v.id) ? "checked" : ""} aria-label="${esc(v.name)} auswählen"></label>`).join("") || '<div class="notice warning">Es sind noch keine Fahrzeuge eingerichtet.</div>'}</div><label class="checkbox"><input type="checkbox" name="allDay" ${initial.allDay ? "checked" : ""}> Ganztägig · 06:00 bis 23:59 Uhr</label><div class="fields">${field("Von", "startDate", initial.startDate, "date", true)}${field("Bis", "endDate", initial.endDate, "date", true)}${field("Beginn", "startTime", initial.startTime, "time", true)}${field("Ende", "endTime", initial.endTime, "time", true)}</div><p class="privacy" id="all-day-note" hidden>Mehrtägige Ganztagsbuchungen sind durchgehend reserviert: vom ersten Tag um 06:00 Uhr bis zum letzten Tag um 23:59 Uhr.</p><div id="live-conflicts" aria-live="polite"></div></section><section data-step="1" hidden><div class="step-label">Schritt 2 von 3</div><h3 class="step-title">Für wen und wofür?</h3><p class="step-intro">Wir brauchen kein Benutzerkonto. Alles Weitere läuft per E-Mail.</p><div class="fields">${field("Vor- und Nachname", "name", initial.name, "text", true, `maxlength="100" autocomplete="name" ${editing ? "readonly" : ""}`)}${field("E-Mail-Adresse", "email", initial.email, "email", true, `maxlength="254" autocomplete="email" ${editing ? "readonly" : ""}`)}</div>${field("Buchungszweck", "purpose", initial.purpose, "text", true, 'maxlength="300" placeholder="z. B. Jugendfeuerwehr · Ausflug"')}${field("Abteilung / Gruppe (optional)", "department", initial.department, "text", false, 'maxlength="100"')}${textarea("Bemerkungen (optional)", "notes", initial.notes)}<p class="privacy">Dein Name und der Buchungszweck sind im internen Kalender sichtbar. Deine E-Mail-Adresse und Bemerkungen bleiben in den geschützten Verwaltungsansichten.</p></section><section data-step="2" hidden><div class="step-label">Schritt 3 von 3</div><h3 class="step-title">Passt das so?</h3><p class="step-intro">Prüfe eure Angaben, bevor du die ${manual ? "Buchung speicherst" : "Anfrage absendest"}.</p><div id="review"></div><div id="review-conflicts"></div><div class="notice">${manual ? "Diese Buchung wird direkt genehmigt. Die Konfliktprüfung bleibt verbindlich." : editing ? "Änderungen benötigen erneut die Freigabe aller betroffenen Fahrzeuge. Eine bisherige Genehmigung wird zurückgenommen." : "Du erhältst zuerst eine E-Mail zur Bestätigung. Danach wird die Anfrage zur Freigabe weitergeleitet. Deine Anfrage ist noch keine bestätigte Reservierung."}</div></section><div class="modal-footer"><span class="muted" id="step-indicator">1 / 3</span><div><button class="btn secondary" id="wizard-back" type="button" hidden>Zurück</button><button class="btn primary" id="wizard-next" type="button">Weiter ${icon("right")}</button><button class="btn primary" id="wizard-submit" type="submit" hidden>${manual ? "Verbindlich buchen" : editing ? "Änderung anfragen" : "Anfrage absenden"}</button></div></div></form>`,
  );
  const form = $("#booking-form");
  const collect = () => ({
    ...formData(form),
    vehicleIds: $$("input[name=vehicleIds]:checked", form).map(
      (el) => el.value,
    ),
    ...(options.token ? { token: options.token } : {}),
    ...(editing && options.admin ? { excludeBookingId: editing.id } : {}),
  });
  const check = async () => {
    const version = ++checkVersion;
    draft = collect();
    if (!draft.vehicleIds.length) {
      $("#live-conflicts").innerHTML = "";
      return;
    }
    try {
      const result = await api("/conflicts", draft);
      if (version !== checkVersion || !form.isConnected) return;
      conflicts = result;
      $("#live-conflicts").innerHTML = conflictHtml(result);
      $("#review-conflicts").innerHTML = conflictHtml(result);
    } catch (error) {
      if (version === checkVersion && form.isConnected)
        $("#live-conflicts").innerHTML =
          `<div class="error">${esc(error.message)}</div>`;
    }
  };
  const updateTime = () => {
    const checked = form.elements.allDay.checked;
    form.elements.startTime.disabled = checked;
    form.elements.endTime.disabled = checked;
    if (checked) {
      form.elements.startTime.value = "06:00";
      form.elements.endTime.value = "23:59";
    }
    $("#all-day-note").hidden = !checked;
    if (form.elements.endDate.value < form.elements.startDate.value)
      form.elements.endDate.value = form.elements.startDate.value;
    clearTimeout(conflictTimer);
    conflictTimer = setTimeout(check, 220);
  };
  bind(
    "[name=allDay],[name=startDate],[name=endDate],[name=startTime],[name=endTime],[name=vehicleIds]",
    "change",
    updateTime,
    form,
  );
  function showStep() {
    $$("[data-step]", form).forEach(
      (el) => (el.hidden = Number(el.dataset.step) !== step),
    );
    $$(".wizard-progress span", form).forEach((el, i) =>
      el.classList.toggle("active", i <= step),
    );
    $("#wizard-back").hidden = step === 0;
    $("#wizard-next").hidden = step === 2;
    $("#wizard-submit").hidden = step !== 2;
    $("#step-indicator").textContent = `${step + 1} / 3`;
    $(".form-error", form).hidden = true;
    modal.scrollTop = 0;
  }
  $("#wizard-next").onclick = async () => {
    for (const el of $$(
      `[data-step="${step}"] input,[data-step="${step}"] textarea`,
      form,
    ))
      if (!el.disabled && !el.reportValidity()) return;
    draft = collect();
    if (step === 0) {
      if (!draft.vehicleIds.length)
        return errorIn(form, "Bitte mindestens ein Fahrzeug auswählen.");
      try {
        conflicts = await api("/conflicts", draft);
      } catch (error) {
        return errorIn(form, error.message);
      }
    }
    if (step === 1) {
      const vehicles = state.vehicles.filter((v) =>
        draft.vehicleIds.includes(v.id),
      );
      $("#review").innerHTML =
        `<div class="summary"><dl><dt>Fahrzeuge</dt><dd>${vehicles.map((v) => esc(v.name)).join("<br>")}</dd><dt>Zeitraum</dt><dd>${esc(draft.startDate.split("-").reverse().join("."))}, ${draft.allDay ? "06:00" : esc(draft.startTime)} bis<br>${esc(draft.endDate.split("-").reverse().join("."))}, ${draft.allDay ? "23:59" : esc(draft.endTime)} Uhr</dd><dt>Zweck</dt><dd>${esc(draft.purpose)}</dd><dt>Name</dt><dd>${esc(draft.name)}</dd><dt>E-Mail</dt><dd>${esc(draft.email)}</dd></dl></div><br>`;
      $("#review-conflicts").innerHTML = conflictHtml(conflicts);
    }
    step++;
    showStep();
  };
  $("#wizard-back").onclick = () => {
    step--;
    showStep();
  };
  form.onsubmit = (event) =>
    submitForm(event, async () => {
      if (step !== 2) return;
      const payload = collect();
      const result = editing
        ? await api(
            options.admin ? `/admin/bookings/${editing.id}` : "/manage",
            { ...payload, action: "edit" },
          )
        : await api(manual ? "/admin/bookings" : "/bookings", payload);
      modal.close();
      toast(
        result.message ||
          "Änderung gespeichert. Die Freigabe wird erneut angefragt.",
      );
      if (options.token) await linkPage(options.token);
      else await navigate(state.page);
    });
  updateTime();
  showStep();
}
async function linkPage(token) {
  try {
    const result = await api("/link", { token }),
      b = result.booking;
    state.page = "link";
    $("#main").innerHTML =
      `<div class="link-page">${head(result.kind === "approve" ? "Freigabe prüfen" : result.kind === "verify" ? "E-Mail bestätigen" : "Deine Buchung", "Dein persönlicher Link · Bitte nicht weitergeben.", false)}<div class="panel"><div class="panel-body">${summary(b, true)}</div></div><div class="panel"><div class="panel-body" id="link-actions">${
        result.kind === "verify"
          ? `<div class="notice">Erst mit deiner Bestätigung wird die Anfrage an die Freigabeberechtigten weitergeleitet.</div><button class="btn primary" id="verify-booking">${icon("check")} E-Mail bestätigen und Anfrage weiterleiten</button>`
          : result.kind === "approve" && b.status === "pending"
            ? `<p class="muted">Du entscheidest nur für die dir zugeordneten Fahrzeuge.</p><form id="approval-form">${b.vehicles
                .filter((v) => result.eligible.includes(v.id))
                .map((v) => {
                  const vote = result.decisions.find(
                    (d) => d.vehicle_id === v.id,
                  );
                  return `<div class="approval-row"><label class="checkbox"><input name="vehicleIds" type="checkbox" value="${v.id}" ${vote || v.state !== "pending" ? "disabled" : "checked"}><span>${esc(v.name)}<small>${v.approvals} von ${v.required} Zustimmungen · ${esc(vote ? (vote.decision === "approve" ? "Du hast zugestimmt" : "Du hast abgelehnt") : v.state === "approved" ? "Fahrzeug bereits freigegeben" : "Offen")}</small></span></label></div>`;
                })
                .join(
                  "",
                )}<br>${textarea("Begründung (optional)", "reason", "", 1000)}<div class="inline-actions"><button class="btn dark" type="submit" name="decision" value="approve">${icon("check")} Genehmigen</button><button class="btn danger" type="submit" name="decision" value="reject">Ablehnen</button></div></form>`
            : result.kind === "manage" &&
                ["pending", "approved", "unverified"].includes(b.status)
              ? `<div class="inline-actions"><button class="btn secondary" id="edit-booking">Buchung ändern</button><button class="btn danger" id="cancel-booking">Buchung stornieren</button></div>`
              : '<div class="notice">Diese Anfrage ist bereits bearbeitet oder kann mit diesem Link nicht mehr geändert werden.</div>'
      }</div></div>${conflictHtml(result.conflicts)}<div class="panel"><div class="panel-head"><h2>Freigabestatus je Fahrzeug</h2></div><div class="panel-body">${b.vehicles.map((v) => `<div class="approval-row"><div><strong>${esc(v.name)}</strong><br><small>${v.approvals} von ${v.required} erforderlichen Zustimmungen</small></div>${badge(v.state)}</div>`).join("")}</div></div></div>`;
    if ($("#verify-booking"))
      $("#verify-booking").onclick = async (e) => {
        e.target.disabled = true;
        try {
          await api("/verify", { token });
          toast("E-Mail bestätigt. Die Freigabe wurde angefragt.");
          $("#link-actions").innerHTML =
            '<div class="notice success">Deine E-Mail wurde bestätigt. Du erhältst weitere Informationen per E-Mail.</div>';
        } catch (error) {
          errorIn($("#link-actions"), error.message);
        }
      };
    if ($("#approval-form"))
      $("#approval-form").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget,
          decision = event.submitter.value;
        const buttons = $$("[type=submit]", form);
        buttons.forEach((b) => (b.disabled = true));
        try {
          const updated = await api("/decide", {
            token,
            decision,
            reason: form.elements.reason.value,
            vehicleIds: $$(
              "[name=vehicleIds]:checked:not(:disabled)",
              form,
            ).map((el) => el.value),
          });
          toast("Deine Entscheidung wurde gespeichert.");
          if (updated.status === "pending") await linkPage(token);
          else {
            $("#link-actions").innerHTML =
              `<div class="notice success">Deine Entscheidung wurde gespeichert. ${esc(statusLabels[updated.status])}.</div>`;
            $(".link-page .summary").outerHTML = summary(updated, true);
            paint();
          }
        } catch (error) {
          errorIn(form, error.message);
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      };
    if ($("#edit-booking"))
      $("#edit-booking").onclick = () => bookingWizard({ booking: b, token });
    if ($("#cancel-booking"))
      $("#cancel-booking").onclick = () =>
        confirmAction(
          "Buchung stornieren?",
          "Die Reservierung wird aufgehoben. Die Beteiligten werden per E-Mail informiert.",
          async () => {
            await api("/manage", { token, action: "cancel" });
            await linkPage(token);
            toast("Die Buchung wurde storniert.");
          },
        );
    paint();
  } catch (error) {
    $("#main").innerHTML =
      `<div class="link-page">${head("Persönlicher Link", "Buchungsverwaltung", false)}<div class="error">${esc(error.message)}</div><p>Nach einer abschließenden Entscheidung ist ein Freigabelink nicht mehr nutzbar. Für deine eigene Buchung nutze den Verwaltungslink aus deiner E-Mail.</p></div>`;
  }
}
function confirmAction(title, message, action) {
  showModal(
    title,
    `<form id="confirm-form"><p>${esc(message)}</p><div class="modal-footer"><button class="btn secondary" type="button" id="confirm-back">Zurück</button><button class="btn danger" type="submit">Ja, bestätigen</button></div></form>`,
  );
  $("#confirm-back").onclick = () => $("#modal").close();
  $("#confirm-form").onsubmit = (event) =>
    submitForm(event, async () => {
      await action();
      $("#modal").close();
    });
}

async function adminPage() {
  if (!state.session.admin) {
    $("#main").innerHTML =
      `<div class="link-page">${head("Verwaltung", "Persönlicher Zugang für Administratoren.", false)}<section class="panel"><form class="panel-body" id="admin-login">${field("Benutzername oder E-Mail", "username", "", "text", true, 'autocomplete="username"')}${field("Passwort", "password", "", "password", true, 'autocomplete="current-password"')}<button class="btn dark" type="submit">${icon("lock")} Anmelden</button></form></section></div>`;
    $("#admin-login").onsubmit = (event) =>
      submitForm(event, async (data) => {
        await api("/admin/login", data);
        await adminPage();
      });
    return;
  }
  state.overview = await api("/admin/overview");
  const tabs = [
    ["bookings", "Buchungen"],
    ["vehicles", "Fahrzeuge"],
    ["approvers", "Freigabepersonen"],
    ["blocks", "Sperrungen"],
    ["settings", "Betrieb & Einstellungen"],
    ["audit", "Protokoll"],
  ];
  $("#main").innerHTML =
    head("Verwaltung", "Fuhrpark, Anfragen und Betrieb an einem Ort.", false) +
    `<nav class="tabs" aria-label="Verwaltungsbereiche">${tabs.map(([id, label]) => `<button class="${id === state.adminTab ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</nav><div id="admin-content"></div>`;
  bind("[data-tab]", "click", async (e) => {
    state.adminTab = e.currentTarget.dataset.tab;
    await adminPage();
  });
  if (state.adminTab === "bookings") await adminBookings();
  else if (state.adminTab === "vehicles") adminVehicles();
  else if (state.adminTab === "approvers") adminApprovers();
  else if (state.adminTab === "blocks") adminBlocks();
  else if (state.adminTab === "settings") adminSettings();
  else {
    const rows = await api("/admin/audit");
    $("#admin-content").innerHTML =
      `<div class="panel panel-body">${rows.map(historyEntry).join("") || "<p>Noch keine Einträge.</p>"}</div>`;
  }
}
const actionLabels = {
  "booking.created": "Buchung erstellt",
  "booking.verified": "E-Mail bestätigt",
  "booking.approve": "Zustimmung erfasst",
  "booking.reject": "Ablehnung erfasst",
  "booking.cancelled": "Buchung storniert",
  "booking.edited": "Buchung geändert",
  "booking.expired": "Anfrage abgelaufen",
  "admin.login": "Admin angemeldet",
  "vehicle.saved": "Fahrzeug gespeichert",
  "approver.saved": "Freigabeperson gespeichert",
  "block.created": "Sperre angelegt",
  "block.deleted": "Sperre entfernt",
  "settings.changed": "Einstellungen geändert",
  "jobs.retried": "Aufgaben erneut angestoßen",
};
function historyEntry(row) {
  return `<div class="history-entry"><strong>${esc(actionLabels[row.action] || row.action)}</strong> · ${esc(dateText(row.created, { dateStyle: "short", timeStyle: "short" }))}<br><small>${esc(row.actor)}</small><details><summary>Änderungsdetails</summary><pre>${esc(JSON.stringify(JSON.parse(row.detail), null, 2))}</pre></details></div>`;
}
async function adminBookings() {
  $("#admin-content").innerHTML =
    `<form class="admin-toolbar" id="booking-filters">${field("Name suchen", "search")}${selectField("Status", "status", [["", "Alle Status"], ...Object.entries(statusLabels).filter(([v]) => v !== "blocked")])}${selectField("Fahrzeug", "vehicleId", [["", "Alle Fahrzeuge"], ...state.overview.vehicles.map((v) => [v.id, v.name])])}${field("Ab Datum", "start", "", "date")}${field("Bis Datum", "end", "", "date")}<button class="btn secondary" type="submit">Filtern</button><button class="btn primary" type="button" id="manual-booking">${icon("plus")} Direkt buchen</button></form><div class="admin-list" id="admin-bookings"></div>`;
  async function load(data = {}) {
    const params = new URLSearchParams({
      search: data.search || "",
      status: data.status || "",
      vehicleId: data.vehicleId || "",
    });
    if (data.start) params.set('startDate', data.start);
    if (data.end) params.set('endDate', data.end);
    const rows = await api(`/admin/bookings?${params}`);
    $("#admin-bookings").innerHTML =
      rows
        .map(
          (b) =>
            `<article class="admin-item"><div class="admin-item-head"><h3>${esc(b.purpose)}</h3>${badge(b.status)}</div><p>${esc(b.name)} · ${esc(b.email)}<br>${esc(b.vehicles.map((v) => v.name).join(", "))}<br>${esc(period(b))}</p>${b.manual ? "<small>Administrativ eingetragen</small>" : ""}${b.conflicts.length ? `<div class="notice warning">${b.conflicts.length} Überschneidung(en) · ${b.conflicts.some((c) => c.blocking) ? "Verbindlicher Konflikt vorhanden" : "Offene Anfragen"}</div>` : ""}<div class="actions"><button class="btn small secondary" data-admin-detail="${b.id}">Details & Verlauf</button>${["pending", "approved", "unverified"].includes(b.status) ? `<button class="btn small secondary" data-admin-edit="${b.id}">Ändern / erneut anfragen</button><button class="btn small danger" data-admin-cancel="${b.id}">Stornieren</button>` : ""}</div></article>`,
        )
        .join("") || '<div class="panel empty">Keine Buchungen gefunden.</div>';
    bind("[data-admin-detail]", "click", (e) => {
      const b = rows.find((b) => b.id === e.currentTarget.dataset.adminDetail);
      showModal(
        "Buchung & Entscheidungsverlauf",
        `${summary(b, true)}<br>${conflictHtml(b.conflicts)}<h3>Entscheidungen</h3>${b.decisions.map((d) => `<div class="history-entry">${esc(d.approver_name)} · ${d.decision === "approve" ? "Zugestimmt" : "Abgelehnt"}<br>${esc(d.reason)}</div>`).join("") || '<p class="muted">Noch keine Entscheidungen.</p>'}<div class="divider"></div><h3>Änderungsverlauf</h3>${b.history.map(historyEntry).join("")}`,
      );
      paint();
    });
    bind("[data-admin-edit]", "click", (e) =>
      bookingWizard({
        booking: rows.find((b) => b.id === e.currentTarget.dataset.adminEdit),
        admin: true,
      }),
    );
    bind("[data-admin-cancel]", "click", (e) => {
      const id = e.currentTarget.dataset.adminCancel;
      confirmAction(
        "Buchung stornieren?",
        "Die Beteiligten werden benachrichtigt und Kalendereinträge entfernt.",
        async () => {
          await api(`/admin/bookings/${id}`, { action: "cancel" });
          await load(data);
        },
      );
    });
  }
  $("#booking-filters").onsubmit = (event) =>
    submitForm(event, (data) => load(data));
  $("#manual-booking").onclick = () => bookingWizard({ manual: true });
  await load();
}
function adminApprovers() {
  $("#admin-content").innerHTML =
    `<div class="admin-toolbar"><p class="muted">Freigaben erfolgen über persönliche E-Mail-Links, ohne Benutzerkonto.</p><button class="btn primary" id="add-approver">${icon("plus")} Person hinzufügen</button></div><div class="admin-list">${state.overview.approvers.map((a) => `<article class="admin-item"><div class="admin-item-head"><div><h3>${esc(a.name)}</h3><p>${esc(a.email)}</p></div><span class="badge ${a.active ? "approved" : ""}">${a.active ? "Aktiv" : "Deaktiviert"}</span></div><div class="actions"><button class="btn small secondary" data-edit-approver="${a.id}">Bearbeiten</button></div></article>`).join("") || '<div class="panel empty">Lege zuerst die Personen an, die Fahrzeugbuchungen freigeben dürfen.</div>'}</div>`;
  const edit = (a = {}) => {
    showModal(
      a.id ? "Freigabeperson bearbeiten" : "Freigabeperson hinzufügen",
      `<form id="approver-form">${field("Name", "name", a.name, "text", true, 'maxlength="100"')}${field("E-Mail-Adresse", "email", a.email, "email", true)}<label class="checkbox"><input name="active" type="checkbox" ${a.active !== 0 ? "checked" : ""}>Person ist aktiv</label><div class="notice">Eine Deaktivierung widerruft die bisherigen Freigabelinks. Für offene Anfragen bei Bedarf über „Ändern / erneut anfragen“ eine neue Freigabegruppe bilden.</div><button class="btn primary" type="submit">Speichern</button></form>`,
    );
    $("#approver-form").onsubmit = (event) =>
      submitForm(event, async (data) => {
        await api("/admin/approvers", { ...data, id: a.id });
        $("#modal").close();
        toast("Freigabeperson gespeichert.");
        await adminPage();
      });
  };
  $("#add-approver").onclick = () => edit();
  bind("[data-edit-approver]", "click", (e) =>
    edit(
      state.overview.approvers.find(
        (a) => a.id === e.currentTarget.dataset.editApprover,
      ),
    ),
  );
}
function adminVehicles() {
  $("#admin-content").innerHTML =
    `<div class="admin-toolbar"><p class="muted">Freigaberegeln gelten für neue Anfragen. Bestehende Anfragen behalten ihre Regeln.</p><button class="btn primary" id="add-vehicle">${icon("plus")} Fahrzeug hinzufügen</button></div><div class="admin-list">${state.overview.vehicles.map((v) => `<article class="admin-item"><div class="admin-item-head"><div><h3><span class="dot" data-color="${esc(v.color)}"></span>${esc(v.name)}</h3><p>${esc(v.callsign)} · ${esc(v.plate)}<br>${v.rule === "any" ? "Eine Person entscheidet" : v.rule === "all" ? "Alle müssen zustimmen" : `${v.quorum} Zustimmungen erforderlich`} · ${v.approverIds.length} Personen</p></div><span class="badge ${v.active ? "approved" : ""}">${v.archived ? "Archiviert" : v.active ? "Aktiv" : "Deaktiviert"}</span></div><div class="actions"><button class="btn small secondary" data-edit-vehicle="${v.id}">Bearbeiten</button></div></article>`).join("") || '<div class="panel empty">Noch keine Fahrzeuge. Freigabepersonen müssen vor dem ersten aktiven Fahrzeug angelegt sein.</div>'}</div>`;
  const edit = (v = {}) => {
    showModal(
      v.id ? "Fahrzeug bearbeiten" : "Fahrzeug hinzufügen",
      `<form id="vehicle-form"><div class="fields">${field("Fahrzeugname", "name", v.name, "text", true, 'maxlength="100"')}${field("Funkrufname", "callsign", v.callsign, "text", false, 'maxlength="100"')}${field("Kennzeichen", "plate", v.plate, "text", false, 'maxlength="30"')}${field("Sitzplätze (optional)", "seats", v.seats, "number", false, 'min="1" max="100"')}${field("Kalenderfarbe", "color", v.color || "#2563eb", "color")}${field("Reihenfolge", "sort_order", v.sort_order || 0, "number", false, 'min="-10000" max="10000"')}</div>${textarea("Beschreibung", "description", v.description, 1000)}${field("Fahrzeugbild (HTTPS-URL, optional)", "image", v.image, "url")}${field("Google-Kalender-ID (optional)", "calendar_id", v.calendar_id)}<div class="fields">${selectField(
        "Freigaberegel",
        "rule",
        [
          ["any", "Eine Person entscheidet"],
          ["all", "Alle müssen zustimmen"],
          ["quorum", "Mindestanzahl x aus n"],
        ],
        v.rule || "any",
      )}${field("Mindestanzahl (bei x aus n)", "quorum", v.quorum || 1, "number", true, 'min="1" max="100"')}</div><label>Freigabeberechtigte</label>${
        state.overview.approvers
          .filter((a) => a.active)
          .map(
            (a) =>
              `<label class="checkbox"><input type="checkbox" name="approverIds" value="${a.id}" ${(v.approverIds || []).includes(a.id) ? "checked" : ""}>${esc(a.name)} · ${esc(a.email)}</label>`,
          )
          .join("") ||
        '<div class="notice warning">Bitte zuerst aktive Freigabepersonen anlegen.</div>'
      }<div class="divider"></div><label class="checkbox"><input type="checkbox" name="active" ${v.active !== 0 ? "checked" : ""}>Fahrzeug kann angefragt werden</label><label class="checkbox"><input type="checkbox" name="archived" ${v.archived ? "checked" : ""}>Archivieren (historische Buchungen bleiben erhalten)</label><button class="btn primary" type="submit">Speichern</button></form>`,
    );
    $("#vehicle-form").onsubmit = (event) =>
      submitForm(event, async (data, form) => {
        await api("/admin/vehicles", {
          ...data,
          id: v.id,
          approverIds: $$("[name=approverIds]:checked", form).map(
            (el) => el.value,
          ),
        });
        $("#modal").close();
        state.vehicles = await api("/vehicles");
        toast("Fahrzeug gespeichert.");
        await adminPage();
      });
  };
  $("#add-vehicle").onclick = () => edit();
  bind("[data-edit-vehicle]", "click", (e) =>
    edit(
      state.overview.vehicles.find(
        (v) => v.id === e.currentTarget.dataset.editVehicle,
      ),
    ),
  );
  paint();
}
function adminBlocks() {
  $("#admin-content").innerHTML =
    `<div class="admin-toolbar"><p class="muted">Werkstatt, Defekte und andere zeitweise Sperrungen.</p><button class="btn primary" id="add-block">${icon("plus")} Sperre hinzufügen</button></div><div class="admin-list">${state.overview.blocks.map((b) => `<article class="admin-item"><h3>${esc(state.overview.vehicles.find((v) => v.id === b.vehicle_id)?.name)}</h3><p>${esc(b.reason)}<br>${esc(period(b))}</p><div class="actions"><button class="btn small danger" data-delete-block="${b.id}">Sperre aufheben</button></div></article>`).join("") || '<div class="panel empty">Keine Fahrzeugsperrungen vorhanden.</div>'}</div>`;
  $("#add-block").onclick = () => {
    showModal(
      "Fahrzeug zeitweise sperren",
      `<form id="block-form">${selectField(
        "Fahrzeug",
        "vehicleId",
        state.overview.vehicles.map((v) => [v.id, v.name]),
      )}${field("Sperrgrund", "reason", "", "text", true, 'maxlength="300"')}<div class="fields">${field("Startdatum", "startDate", today(), "date", true)}${field("Enddatum", "endDate", today(), "date", true)}${field("Startzeit", "startTime", "06:00", "time", true)}${field("Endzeit", "endTime", "23:59", "time", true)}</div><label class="checkbox"><input type="checkbox" name="confirmConflicts">Sperre auch bei bereits genehmigten Buchungen setzen. Betroffene Personen wurden von mir informiert.</label><button class="btn primary" type="submit">Fahrzeug sperren</button></form>`,
    );
    $("#block-form").onsubmit = (event) =>
      submitForm(event, async (data) => {
        const result = await api("/admin/blocks", data);
        $("#modal").close();
        toast(
          `Sperre gespeichert. ${result.affected.length} Überschneidung(en).`,
        );
        await adminPage();
      });
  };
  bind("[data-delete-block]", "click", (e) => {
    const id = e.currentTarget.dataset.deleteBlock;
    confirmAction(
      "Sperre aufheben?",
      "Das Fahrzeug ist danach für diesen Zeitraum wieder anfragbar.",
      async () => {
        await api(`/admin/blocks/${id}`, {}, "DELETE");
        await adminPage();
      },
    );
  });
}
function adminSettings() {
  const o = state.overview,
    settings = o.settings;
  $("#admin-content").innerHTML =
    `<div class="admin-columns"><section class="panel"><div class="panel-head"><h2>Zugang & Darstellung</h2></div><form class="panel-body" id="settings-form">${field("Name der Feuerwehr", "siteName", settings.siteName, "text", true, 'maxlength="100"')}${field("Neue vierstellige PIN (optional)", "pin", "", "password", false, 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password"')}${field("Neues Admin-Passwort (optional)", "password", "", "password", false, 'minlength="12" maxlength="256" autocomplete="new-password"')}<div class="notice">Eine PIN-Änderung beendet die anderen Sitzungen. Neue Passwörter benötigen mindestens 12 Zeichen.</div><button class="btn primary" type="submit">Einstellungen speichern</button></form></section><section class="panel"><div class="panel-head"><h2>Verbindungen prüfen</h2></div><div class="panel-body"><p>${settings.smtpConfigured ? badge("approved") : badge("pending")} SMTP ${settings.smtpConfigured ? "konfiguriert" : "noch nicht konfiguriert"}</p><form id="smtp-test"><br>${field("Empfänger der Test-E-Mail", "email", "", "email", true)}<button class="btn secondary" type="submit">Test-E-Mail senden</button></form><div class="divider"></div><p>${settings.googleConfigured ? badge("approved") : badge("pending")} Google Kalender ${settings.googleConfigured ? "konfiguriert" : "noch nicht konfiguriert"}</p><form id="calendar-test"><br>${field("Google-Kalender-ID", "calendarId", o.vehicles.find((v) => v.calendar_id)?.calendar_id || "", "text", true)}<button class="btn secondary" type="submit">Verbindung testen</button></form><div class="divider"></div><p class="privacy">Zugangsdaten werden über die Serverumgebung gesetzt. Verwende private Google-Kalender: Bei öffentlicher Freigabe können Namen außerhalb des PIN-Bereichs sichtbar werden. Google-Kalender-Einträge werden hier nur aus der Anwendung geschrieben.</p></div></section><section class="panel"><div class="panel-head"><h2>Hintergrundaufgaben</h2><button class="btn small secondary" id="retry-jobs">Erneut versuchen</button></div><div class="panel-body">${o.jobs.map((j) => `<div class="history-entry"><strong>${j.type === "mail" ? "E-Mail-Versand" : "Kalenderabgleich"}</strong> · ${j.attempts} Versuche<br><small>${j.status === "failed" ? "Fehlgeschlagen" : j.status === "processing" ? "Wird ausgeführt" : "In Warteschlange"} · ${esc(dateText(j.next_at, { dateStyle: "short", timeStyle: "short" }))}</small>${j.error ? '<p class="privacy">Verbindung fehlgeschlagen. Bitte Konfiguration und Erreichbarkeit prüfen.</p>' : ""}</div>`).join("") || '<p class="muted">Keine ausstehenden Aufgaben. Alles auf dem aktuellen Stand.</p>'}</div></section><section class="hint-card"><h3>Daten & Aufbewahrung</h3><p>Buchungsdaten werden ${settings.retentionDays} Tage nach Ende aufbewahrt und anschließend automatisch entfernt. Offene Kalenderaufgaben werden vorher abgeschlossen.</p><p>Die eigene Datenbank ist die verbindliche Belegungsquelle. Externe Google-Termine sperren keine Fahrzeuge automatisch.</p></section></div>`;
  $("#settings-form").onsubmit = (event) =>
    submitForm(event, async (data) => {
      await api("/admin/settings", data);
      state.session = await api("/session");
      toast("Einstellungen gespeichert.");
      await navigate("admin");
    });
  $("#smtp-test").onsubmit = (event) =>
    submitForm(event, async (data) => {
      const r = await api("/admin/test-smtp", data);
      toast(r.message);
    });
  $("#calendar-test").onsubmit = (event) =>
    submitForm(event, async (data, form) => {
      const r = await api("/admin/test-calendar", data);
      const notice = document.createElement("div");
      notice.className = "notice success";
      notice.textContent = `${r.name}: ${r.message}`;
      form.append(notice);
    });
  $("#retry-jobs").onclick = async () => {
    try {
      await api("/admin/retry", {});
      toast("Aufgaben werden erneut ausgeführt.");
      await adminPage();
    } catch (error) {
      toast(error.message);
    }
  };
}
window.addEventListener("hashchange", () => {
  const match = location.hash.match(
    /^#\/(verify|manage|approve)\/([A-Za-z0-9_-]+)$/,
  );
  if (match && state.session?.pin) linkPage(match[2]);
});
start().catch((error) => {
  $("#app").innerHTML =
    `<main class="loading"><h1>Verbindung nicht verfügbar</h1><p>${esc(error.message)}</p><p>Bitte lade die Seite erneut.</p></main>`;
});
