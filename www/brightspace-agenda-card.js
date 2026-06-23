/**
 * Brightspace Agenda Card — custom card Lovelace
 * Config :
 *   entity       : sensor.brightspace_agenda_evenements_a_venir
 *   show_events  : true   # afficher la liste des événements (défaut: true)
 *   show_stats   : true   # afficher les chiffres clés (défaut: true)
 *   stats        : [a_venir, individuels, collectifs, urgents]  # métriques à montrer
 *   app_url      : https://...  # lien "Ouvrir l'agenda" (optionnel)
 */

const TYPE_META = {
  deadline: { label: "Deadline", color: "#E24B4A", bg: "rgba(226,75,74,.12)" },
  session:  { label: "Session",  color: "#378ADD", bg: "rgba(55,138,221,.12)" },
  workshop: { label: "Atelier",  color: "#639922", bg: "rgba(99,153,34,.12)" },
  event:    { label: "Événement",color: "#888780", bg: "rgba(136,135,128,.12)" },
};

const STAT_META = {
  a_venir:     { label: "À venir",     icon: "mdi:calendar-clock",  color: "#6366f1" },
  individuels: { label: "Individuels", icon: "mdi:account",         color: "#378ADD" },
  collectifs:  { label: "Collectifs",  icon: "mdi:account-group",   color: "#639922" },
  urgents:     { label: "Urgents ≤7j", icon: "mdi:alarm",           color: "#E24B4A" },
};

const DEFAULT_STATS = ["a_venir", "individuels", "collectifs", "urgents"];

function fmtDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target - today) / 86400000);
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Aujourd'hui · ${time}`;
  if (diff === 1) return `Demain · ${time}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${time}`;
}

function badge(daysUntil, type) {
  if (type === "deadline") {
    if (daysUntil === 0) return "Aujourd'hui";
    if (daysUntil === 1) return "J-1";
    return `J-${daysUntil}`;
  }
  return TYPE_META[type]?.label ?? type;
}

const STYLES = `
  :host { display: block; }
  ha-card { padding: 0; overflow: hidden; }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--divider-color);
  }
  .header-left { display: flex; align-items: center; gap: 8px; }
  .header-title { font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
  .header-date  { font-size: 12px; color: var(--secondary-text-color); }

  /* ── Stats grid ── */
  .stats-grid {
    display: grid;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--divider-color);
  }
  .stats-grid.cols-1 { grid-template-columns: 1fr; }
  .stats-grid.cols-2 { grid-template-columns: 1fr 1fr; }
  .stats-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .stats-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }

  .stat-tile {
    background: var(--secondary-background-color);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .stat-label { font-size: 10px; font-weight: 500; text-transform: uppercase;
                letter-spacing: .04em; color: var(--secondary-text-color); }
  .stat-value { font-size: 24px; font-weight: 600; line-height: 1.1; }
  .stat-icon  { font-size: 13px; margin-bottom: 4px; opacity: .7; }

  /* ── Events ── */
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
  .event-badge {
    font-size: 11px; padding: 2px 7px; border-radius: 12px;
    flex-shrink: 0; font-weight: 500;
  }
  .empty { padding: 20px 16px; font-size: 13px;
           color: var(--secondary-text-color); text-align: center; }

  /* ── Footer ── */
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-top: 1px solid var(--divider-color); font-size: 11px;
  }
  .footer-link { color: var(--primary-color); cursor: pointer; }
  .footer-ts   { color: var(--secondary-text-color); }
  .error { padding: 12px 16px; font-size: 12px; color: var(--error-color); }
`;

class BrightspaceAgendaCard extends HTMLElement {
  set hass(hass) { this._hass = hass; this._render(); }

  setConfig(config) {
    if (!config.entity) throw new Error("Champ 'entity' requis");
    this._config = {
      show_events: true,
      show_stats:  true,
      stats:       DEFAULT_STATS,
      ...config,
    };
  }

  _statsHtml(attrs) {
    const keys = this._config.stats.filter(k => STAT_META[k]);
    if (!keys.length) return "";
    const cols = Math.min(keys.length, 4);
    const tiles = keys.map(k => {
      const meta = STAT_META[k];
      const val  = attrs[k] ?? 0;
      const urgent = k === "urgents" && val > 0;
      return `
        <div class="stat-tile">
          <span class="stat-label" style="color:${meta.color}">${meta.label}</span>
          <span class="stat-value" style="color:${urgent ? meta.color : "var(--primary-text-color)"}">${val}</span>
        </div>`;
    }).join("");
    return `<div class="stats-grid cols-${cols}">${tiles}</div>`;
  }

  _eventsHtml(events) {
    if (!events.length) return `<div class="empty">Aucun événement à venir</div>`;
    return `<div class="event-list">${events.map(ev => {
      const meta = TYPE_META[ev.type] ?? TYPE_META.event;
      return `
        <div class="event-row">
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

  _render() {
    if (!this._hass || !this._config) return;
    const stateObj = this._hass.states[this._config.entity];

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    if (!root.querySelector("ha-card")) {
      root.innerHTML = `<style>${STYLES}</style><ha-card></ha-card>`;
    }
    const card = root.querySelector("ha-card");

    if (!stateObj) {
      card.innerHTML = `<div class="error">Entité introuvable : ${this._config.entity}</div>`;
      return;
    }

    const attrs     = stateObj.attributes ?? {};
    const events    = attrs.events ?? [];
    const title     = this._config.title ?? "Brightspace Agenda";
    const appUrl    = this._config.app_url ?? "";
    const todayStr  = new Date().toLocaleDateString("fr-FR",
                        { weekday: "short", day: "numeric", month: "short" });

    let tsLabel = "";
    if (attrs.generated_at) {
      const diff = Math.round((Date.now() - new Date(attrs.generated_at)) / 60000);
      tsLabel = diff < 2 ? "À l'instant" : `Il y a ${diff} min`;
    }

    const showStats  = this._config.show_stats  !== false;
    const showEvents = this._config.show_events !== false;

    // Masquer le footer si rien à y afficher
    const hasFooter = appUrl || tsLabel;

    card.innerHTML = `
      <div class="header">
        <div class="header-left">
          <ha-icon icon="mdi:school"></ha-icon>
          <span class="header-title">${title}</span>
        </div>
        <span class="header-date">${todayStr}</span>
      </div>
      ${showStats  ? this._statsHtml(attrs) : ""}
      ${showEvents ? this._eventsHtml(events) : ""}
      ${hasFooter ? `
      <div class="footer">
        ${appUrl
          ? `<span class="footer-link" onclick="window.open('${appUrl}','_blank')">Ouvrir l'agenda ↗</span>`
          : `<span></span>`}
        <span class="footer-ts">${tsLabel}</span>
      </div>` : ""}`;
  }

  static getStubConfig() {
    return {
      entity:       "sensor.brightspace_agenda_evenements_a_venir",
      title:        "Brightspace Agenda",
      show_stats:   true,
      show_events:  true,
      stats:        ["a_venir", "individuels", "collectifs", "urgents"],
      app_url:      "",
    };
  }

  getCardSize() {
    const s = this._config?.show_stats  !== false ? 2 : 0;
    const e = this._config?.show_events !== false ? 3 : 0;
    return s + e + 1;
  }
}

customElements.define("brightspace-agenda-card", BrightspaceAgendaCard);

window.customCards = window.customCards ?? [];
window.customCards.push({
  type:             "brightspace-agenda-card",
  name:             "Brightspace Agenda",
  description:      "Affiche les métriques et les prochains événements Brightspace.",
  preview:          true,
  documentationURL: "https://github.com/MrTh0m/HACS",
});

console.info(
  "%c BRIGHTSPACE-AGENDA-CARD %c chargée ",
  "background:#6366f1;color:#fff;padding:2px 4px;border-radius:3px 0 0 3px;font-weight:bold",
  "background:#1c1c1e;color:#a5b4fc;padding:2px 4px;border-radius:0 3px 3px 0"
);
