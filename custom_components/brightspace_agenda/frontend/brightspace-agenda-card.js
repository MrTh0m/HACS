/**
 * Brightspace Agenda Card v1.3
 * Options YAML :
 *   entity       : sensor.brightspace_agenda_evenements_a_venir  (requis)
 *   title        : "Brightspace Agenda"
 *   show_next    : true   — bandeau prochain événement (session ou atelier)
 *   show_stats   : true   — chiffres clés
 *   show_events  : true   — liste des événements
 *   stats        : [a_venir, individuels, collectifs, urgents]
 *   app_url      : "https://..."   — lien pied de page + bouton Rejoindre
 */

// ─── Métadonnées ─────────────────────────────────────────────────────────────

const TYPE_META = {
  deadline: { label: "Deadline", color: "#E24B4A", bg: "rgba(226,75,74,.12)" },
  session:  { label: "Session",  color: "#378ADD", bg: "rgba(55,138,221,.12)" },
  workshop: { label: "Atelier",  color: "#639922", bg: "rgba(99,153,34,.12)" },
  event:    { label: "Événement",color: "#888780", bg: "rgba(136,135,128,.12)" },
};

const STAT_META = {
  a_venir:     { label: "À venir",     color: "#6366f1" },
  individuels: { label: "Individuels", color: "#378ADD" },
  collectifs:  { label: "Collectifs",  color: "#639922" },
  urgents:     { label: "Urgents ≤7j", color: "#E24B4A" },
};

const ALL_STATS     = ["a_venir", "individuels", "collectifs", "urgents"];
const DEFAULT_STATS = ALL_STATS;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now    = new Date();
  const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff   = Math.round((target - today) / 86400000);
  const time   = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Aujourd'hui · ${time}`;
  if (diff === 1) return `Demain · ${time}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${time}`;
}

function fmtTime(d) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Reproduit cleanSessionTitle de l'app : retire le préfixe "2026_PGMC03_2026-03 "
const SESSION_TITLE_RE = /^\d{4}_[A-Z0-9]+_\d{4}-\d{2}\s+(.+)$/i;
function cleanTitle(summary, type) {
  if (!summary) return "—";
  if (type === "session") {
    const m = summary.match(SESSION_TITLE_RE);
    if (m) return m[1].trim();
    return summary.replace(/live session\s*[:\-]?\s*/i, "")
                  .replace(/cours distanciel\s*[:\-]?\s*/i, "").trim() || summary;
  }
  if (type === "deadline") {
    return summary.replace(/^(assessment|co-construction)\s*[:\–\-]+\s*/i, "")
                  .replace(/\s*à échéance\s*$/i, "")
                  .replace(/\s*[–\-:]+\s*$/, "").trim() || summary;
  }
  return summary;
}

function badge(daysUntil, type) {
  if (type === "deadline") {
    if (daysUntil === 0) return "Aujourd'hui";
    if (daysUntil === 1) return "J-1";
    return `J-${daysUntil}`;
  }
  return TYPE_META[type]?.label ?? type;
}

function tsLabel(isoStr) {
  if (!isoStr) return "";
  const diff = Math.round((Date.now() - new Date(isoStr)) / 60000);
  return diff < 2 ? "À l'instant" : `Il y a ${diff} min`;
}

// Calcule badge + whenLabel pour le chip prochain événement
function nextEventTiming(startIso, endIso) {
  const start = new Date(startIso);
  const end   = endIso ? new Date(endIso) : null;
  const now   = new Date();
  const minutesUntil = Math.round((start - now) / 60000);
  const daysUntil    = Math.round((start - now) / 86400000);
  const timeStr = fmtTime(start);
  const endStr  = end ? ` – ${fmtTime(end)}` : "";

  let chipBadge, whenLabel;
  if (minutesUntil <= 0 && end && now < end) {
    chipBadge = "En cours"; whenLabel = "En cours maintenant";
  } else if (minutesUntil > 0 && minutesUntil < 60) {
    chipBadge = `Dans ${minutesUntil} min`;
    whenLabel = `Dans ${minutesUntil} min · ${timeStr}${endStr}`;
  } else if (daysUntil === 0) {
    chipBadge = "Aujourd'hui !";
    whenLabel = `Aujourd'hui à ${timeStr}${endStr}`;
  } else if (daysUntil === 1) {
    chipBadge = "Demain !";
    whenLabel = `Demain à ${timeStr}${endStr}`;
  } else {
    chipBadge = `J-${daysUntil}`;
    whenLabel = start.toLocaleDateString("fr-FR",
      { weekday: "short", day: "numeric", month: "short" }) + ` à ${timeStr}${endStr}`;
  }
  return { chipBadge, whenLabel };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_STYLES = `
  :host { display: block; }
  ha-card { padding: 0; overflow: hidden; }

  /* Header */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 10px; border-bottom: 1px solid var(--divider-color);
  }
  .header-left  { display: flex; align-items: center; gap: 8px; }
  .header-title { font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
  .header-date  { font-size: 12px; color: var(--secondary-text-color); }

  /* ── Prochain événement chip ── */
  .next-chip {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px; margin: 10px 12px 2px;
    border-radius: 10px; border: 1px solid;
    transition: filter .15s;
  }
  .next-chip:hover { filter: brightness(.95); }
  .next-chip-icon { font-size: 20px; flex-shrink: 0; }
  .next-chip-body { flex: 1; min-width: 0; }
  .next-chip-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; opacity: .75; display: block;
  }
  .next-chip-title {
    font-size: 13px; font-weight: 600; display: block;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .next-chip-meta { font-size: 11px; opacity: .75; margin-top: 1px; }
  .next-chip-right {
    display: flex; flex-direction: column; align-items: flex-end;
    gap: 4px; flex-shrink: 0;
  }
  .next-chip-when  { font-size: 12px; font-weight: 600; white-space: nowrap; }
  .next-chip-badge {
    font-size: 10px; font-weight: 700; padding: 2px 7px;
    border-radius: 10px; color: #fff; white-space: nowrap;
  }
  .next-chip-join {
    height: 28px; padding: 0 12px; border-radius: 7px; border: none;
    color: #fff; font-size: 11px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; gap: 5px; text-decoration: none;
    flex-shrink: 0; white-space: nowrap;
  }
  .next-chip-join:hover { opacity: .85; }

  /* Stats */
  .stats-grid { display: grid; gap: 8px; padding: 12px 16px;
                border-bottom: 1px solid var(--divider-color); }
  .stats-grid.cols-1 { grid-template-columns: 1fr; }
  .stats-grid.cols-2 { grid-template-columns: 1fr 1fr; }
  .stats-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .stats-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .stat-tile {
    background: var(--secondary-background-color);
    border-radius: 10px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .stat-label { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; }
  .stat-value { font-size: 24px; font-weight: 600; line-height: 1.1; }
  .stat-warn  {
    margin: 8px 16px; padding: 8px 12px; border-radius: 8px;
    background: rgba(226,75,74,.1); color: #E24B4A; font-size: 11px;
  }

  /* Events */
  .event-list { padding: 6px 0; }
  .event-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px; transition: background .15s;
  }
  .event-row:hover { background: var(--secondary-background-color); }
  .dot { width: 3px; border-radius: 2px; align-self: stretch; min-height: 32px; flex-shrink: 0; }
  .event-body { flex: 1; min-width: 0; }
  .event-name {
    font-size: 13px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .event-sub  { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }
  .event-badge { font-size: 11px; padding: 2px 7px; border-radius: 12px; flex-shrink: 0; font-weight: 500; }
  .empty { padding: 20px 16px; font-size: 13px; color: var(--secondary-text-color); text-align: center; }

  /* Footer */
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-top: 1px solid var(--divider-color); font-size: 11px;
  }
  .footer-link { color: var(--primary-color); cursor: pointer; }
  .footer-ts   { color: var(--secondary-text-color); }
  .error { padding: 12px 16px; font-size: 12px; color: var(--error-color); }
`;

// ─── Card principale ──────────────────────────────────────────────────────────

class BrightspaceAgendaCard extends HTMLElement {

  set hass(hass) { this._hass = hass; this._render(); }

  setConfig(config) {
    if (!config.entity) throw new Error("Champ 'entity' requis");
    this._config = {
      show_next:   true,
      show_stats:  true,
      show_events: true,
      stats:       DEFAULT_STATS,
      ...config,
    };
  }

  // ── Bloc prochain événement ──────────────────────────────────────────────
  _nextBlock(events, appUrl) {
    const next = events.find(ev => ev.type === "session" || ev.type === "workshop");
    if (!next) return "";

    const isSession  = next.type === "session";
    const color      = isSession ? "#0F8FA0" : "#639922";
    const bgColor    = isSession ? "rgba(15,143,160,.1)" : "rgba(99,153,34,.1)";
    const borderCol  = isSession ? "rgba(15,143,160,.3)" : "rgba(99,153,34,.3)";
    const icon       = isSession ? "mdi:video" : "mdi:account-group";
    const chipLabel  = isSession ? "Prochaine live session" : "Prochain atelier";

    const { chipBadge, whenLabel } = nextEventTiming(next.start_iso, next.end_iso);
    const title   = cleanTitle(next.summary, next.type);
    const subject = next.subject ?? "";

    const joinBtn = appUrl
      ? `<a class="next-chip-join" href="${appUrl}" target="_blank" rel="noopener"
            style="background:${color}" onclick="event.stopPropagation()">
           ▶ Rejoindre
         </a>`
      : "";

    return `
      <div class="next-chip" style="background:${bgColor};border-color:${borderCol};color:${color}">
        <ha-icon icon="${icon}" class="next-chip-icon"></ha-icon>
        <div class="next-chip-body">
          <span class="next-chip-label">${chipLabel}</span>
          <span class="next-chip-title">${title}</span>
          ${subject ? `<span class="next-chip-meta">${subject}</span>` : ""}
        </div>
        <div class="next-chip-right">
          <span class="next-chip-when">${whenLabel}</span>
          <span class="next-chip-badge" style="background:${color}">${chipBadge}</span>
        </div>
        ${joinBtn}
      </div>`;
  }

  // ── Bloc stats ───────────────────────────────────────────────────────────
  _statsBlock(attrs) {
    const keys = (this._config.stats ?? DEFAULT_STATS).filter(k => STAT_META[k]);
    if (!keys.length) return "";
    const hasStat = keys.some(k => k in attrs && attrs[k] !== undefined);
    if (!hasStat) {
      return `<div class="stat-warn">⚠️ Métriques indisponibles — mets à jour api.php et redémarre HA.</div>`;
    }
    const cols  = Math.min(keys.length, 4);
    const tiles = keys.map(k => {
      const meta   = STAT_META[k];
      const val    = attrs[k] ?? 0;
      const urgent = k === "urgents" && val > 0;
      return `<div class="stat-tile">
        <span class="stat-label" style="color:${meta.color}">${meta.label}</span>
        <span class="stat-value" style="color:${urgent ? meta.color : "var(--primary-text-color)"}">
          ${val}
        </span>
      </div>`;
    }).join("");
    return `<div class="stats-grid cols-${cols}">${tiles}</div>`;
  }

  // ── Bloc events ──────────────────────────────────────────────────────────
  _eventsBlock(events) {
    if (!events.length) return `<div class="empty">Aucun événement à venir</div>`;
    return `<div class="event-list">${events.map(ev => {
      const meta = TYPE_META[ev.type] ?? TYPE_META.event;
      return `<div class="event-row">
        <div class="dot" style="background:${meta.color}"></div>
        <div class="event-body">
          <div class="event-name">${ev.summary ?? ""}</div>
          <div class="event-sub">${fmtDate(ev.start_iso)}</div>
        </div>
        <span class="event-badge" style="background:${meta.bg};color:${meta.color}">
          ${badge(ev.days_until ?? 0, ev.type)}
        </span>
      </div>`;
    }).join("")}</div>`;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  _render() {
    if (!this._hass || !this._config) return;
    const stateObj = this._hass.states[this._config.entity];

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    if (!root.querySelector("ha-card")) {
      root.innerHTML = `<style>${CARD_STYLES}</style><ha-card></ha-card>`;
    }
    const card = root.querySelector("ha-card");

    if (!stateObj) {
      card.innerHTML = `<div class="error">Entité introuvable : ${this._config.entity}</div>`;
      return;
    }

    const attrs      = stateObj.attributes ?? {};
    const events     = attrs.events ?? [];
    const title      = this._config.title ?? "Brightspace Agenda";
    const appUrl     = this._config.app_url ?? "";
    const showNext   = this._config.show_next   !== false;
    const showStats  = this._config.show_stats  !== false;
    const showEvents = this._config.show_events !== false;
    const todayStr   = new Date().toLocaleDateString("fr-FR",
                         { weekday: "short", day: "numeric", month: "short" });
    const ts = tsLabel(attrs.generated_at);

    // Le chip prochain événement n'a de sens que si show_events ou show_next activés
    const nextHtml = showNext ? this._nextBlock(events, appUrl) : "";
    // Séparer le chip des stats par une divider seulement si les deux sont affichés
    const needsDividerAfterNext = nextHtml && showStats;

    card.innerHTML = `
      <div class="header">
        <div class="header-left">
          <ha-icon icon="mdi:school"></ha-icon>
          <span class="header-title">${title}</span>
        </div>
        <span class="header-date">${todayStr}</span>
      </div>
      ${nextHtml}
      ${needsDividerAfterNext ? `<div style="height:1px;background:var(--divider-color);margin-top:10px"></div>` : ""}
      ${showStats  ? this._statsBlock(attrs)   : ""}
      ${showEvents ? this._eventsBlock(events) : ""}
      ${appUrl || ts ? `
      <div class="footer">
        ${appUrl
          ? `<span class="footer-link" onclick="window.open('${appUrl}','_blank')">Ouvrir l'agenda ↗</span>`
          : `<span></span>`}
        <span class="footer-ts">${ts}</span>
      </div>` : ""}`;
  }

  static getConfigElement() {
    return document.createElement("brightspace-agenda-card-editor");
  }

  static getStubConfig() {
    return {
      entity:      "sensor.brightspace_agenda_evenements_a_venir",
      title:       "Brightspace Agenda",
      show_next:   true,
      show_stats:  true,
      show_events: true,
      stats:       ["a_venir", "individuels", "collectifs", "urgents"],
      app_url:     "",
    };
  }

  getCardSize() {
    const n = this._config?.show_next   !== false ? 1 : 0;
    const s = this._config?.show_stats  !== false ? 2 : 0;
    const e = this._config?.show_events !== false ? 3 : 0;
    return n + s + e + 1;
  }
}

customElements.define("brightspace-agenda-card", BrightspaceAgendaCard);

// ─── Éditeur visuel ───────────────────────────────────────────────────────────

const EDITOR_STYLES = `
  .editor { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .field  { display: flex; flex-direction: column; gap: 4px; }
  label   { font-size: 12px; font-weight: 500; color: var(--secondary-text-color);
            text-transform: uppercase; letter-spacing: .04em; }
  input[type=text] {
    background: var(--secondary-background-color); border: 1px solid var(--divider-color);
    border-radius: 8px; padding: 8px 10px; color: var(--primary-text-color);
    font-size: 13px; width: 100%; box-sizing: border-box;
  }
  input[type=text]:focus { outline: 2px solid var(--primary-color); border-color: transparent; }
  .hint { font-size: 11px; color: var(--secondary-text-color); }
  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
  .toggle-label { font-size: 13px; color: var(--primary-text-color); }
  .toggle { position: relative; width: 42px; height: 24px; flex-shrink: 0; cursor: pointer; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; border-radius: 24px; background: var(--disabled-color, #888); transition: background .2s; }
  .slider::before { content: ""; position: absolute; width: 18px; height: 18px;
    left: 3px; top: 3px; border-radius: 50%; background: #fff; transition: transform .2s; }
  .toggle input:checked + .slider { background: var(--primary-color); }
  .toggle input:checked + .slider::before { transform: translateX(18px); }
  .stats-section { display: flex; flex-direction: column; gap: 6px; }
  .stats-title { font-size: 12px; font-weight: 500; color: var(--secondary-text-color);
                 text-transform: uppercase; letter-spacing: .04em; }
  .stat-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .stat-check {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px;
    cursor: pointer; background: var(--secondary-background-color);
    border: 1.5px solid transparent; transition: border-color .15s; user-select: none;
  }
  .stat-check.active { border-color: var(--primary-color); }
  .stat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .stat-check-label { font-size: 12px; color: var(--primary-text-color); }
  .divider { height: 1px; background: var(--divider-color); }
`;

class BrightspaceAgendaCardEditor extends HTMLElement {

  set hass(hass) { this._hass = hass; }

  setConfig(config) {
    this._config = {
      show_next:   true,
      show_stats:  true,
      show_events: true,
      stats:       DEFAULT_STATS,
      ...config,
    };
    this._render();
  }

  _fire(cfg) {
    this.dispatchEvent(new CustomEvent("config-changed",
      { detail: { config: cfg }, bubbles: true, composed: true }));
  }

  _set(key, val) { this._config = { ...this._config, [key]: val }; this._fire(this._config); }

  _toggleStat(key) {
    const cur  = this._config.stats ?? DEFAULT_STATS;
    const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
    this._set("stats", ALL_STATS.filter(k => next.includes(k)));
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    const cfg  = this._config;

    root.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="editor">

        <div class="field">
          <label>Entité</label>
          <input type="text" id="entity" value="${cfg.entity ?? ""}"
                 placeholder="sensor.brightspace_agenda_evenements_a_venir" />
          <span class="hint">sensor exposé par l'intégration Brightspace Agenda</span>
        </div>

        <div class="field">
          <label>Titre</label>
          <input type="text" id="title" value="${cfg.title ?? ""}" placeholder="Brightspace Agenda" />
        </div>

        <div class="divider"></div>

        <div class="toggle-row">
          <span class="toggle-label">Afficher le prochain événement</span>
          <label class="toggle">
            <input type="checkbox" id="show_next" ${cfg.show_next !== false ? "checked" : ""} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="divider"></div>

        <div class="toggle-row">
          <span class="toggle-label">Afficher les chiffres clés</span>
          <label class="toggle">
            <input type="checkbox" id="show_stats" ${cfg.show_stats !== false ? "checked" : ""} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="stats-section" id="stats-section"
             style="display:${cfg.show_stats !== false ? "flex" : "none"}">
          <span class="stats-title">Métriques à afficher</span>
          <div class="stat-checks">
            ${ALL_STATS.map(k => {
              const meta   = STAT_META[k];
              const active = (cfg.stats ?? DEFAULT_STATS).includes(k);
              return `<div class="stat-check ${active ? "active" : ""}" data-stat="${k}">
                <span class="stat-dot" style="background:${meta.color}"></span>
                <span class="stat-check-label">${meta.label}</span>
              </div>`;
            }).join("")}
          </div>
        </div>

        <div class="divider"></div>

        <div class="toggle-row">
          <span class="toggle-label">Afficher la liste des événements</span>
          <label class="toggle">
            <input type="checkbox" id="show_events" ${cfg.show_events !== false ? "checked" : ""} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="divider"></div>

        <div class="field">
          <label>Lien "Ouvrir l'agenda" <span style="font-weight:400">(optionnel)</span></label>
          <input type="text" id="app_url" value="${cfg.app_url ?? ""}"
                 placeholder="https://votre-serveur/index.html" />
          <span class="hint">Active aussi le bouton "Rejoindre" sur le prochain événement</span>
        </div>

      </div>`;

    root.getElementById("entity").addEventListener("change",    e => this._set("entity",  e.target.value.trim()));
    root.getElementById("title").addEventListener("change",     e => this._set("title",   e.target.value));
    root.getElementById("app_url").addEventListener("change",   e => this._set("app_url", e.target.value.trim()));
    root.getElementById("show_next").addEventListener("change", e => this._set("show_next",   e.target.checked));
    root.getElementById("show_stats").addEventListener("change", e => {
      this._set("show_stats", e.target.checked);
      root.getElementById("stats-section").style.display = e.target.checked ? "flex" : "none";
    });
    root.getElementById("show_events").addEventListener("change", e => this._set("show_events", e.target.checked));
    root.querySelectorAll(".stat-check").forEach(el =>
      el.addEventListener("click", () => {
        this._toggleStat(el.dataset.stat);
        el.classList.toggle("active");
      })
    );
  }
}

customElements.define("brightspace-agenda-card-editor", BrightspaceAgendaCardEditor);

// ─── Enregistrement ───────────────────────────────────────────────────────────

window.customCards = window.customCards ?? [];
window.customCards.push({
  type:             "brightspace-agenda-card",
  name:             "Brightspace Agenda",
  description:      "Affiche le prochain événement, les métriques et l'agenda Brightspace.",
  preview:          true,
  documentationURL: "https://github.com/MrTh0m/HACS",
});

console.info(
  "%c BRIGHTSPACE-AGENDA-CARD %c v1.3 chargée ",
  "background:#6366f1;color:#fff;padding:2px 4px;border-radius:3px 0 0 3px;font-weight:bold",
  "background:#1c1c1e;color:#a5b4fc;padding:2px 4px;border-radius:0 3px 3px 0"
);
