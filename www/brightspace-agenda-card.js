/**
 * Brightspace Agenda Card — custom card Lovelace
 * Lit sensor.brightspace_agenda et affiche les prochains événements.
 *
 * Installation : copier dans www/ du repo, puis dans HA :
 *   Paramètres > Tableaux de bord > Ressources > Ajouter
 *   URL : /hacsfiles/brightspace_agenda/brightspace-agenda-card.js
 *   Type : Module JavaScript
 */

const TYPE_META = {
  deadline: { label: "Deadline", color: "#E24B4A", bg: "rgba(226,75,74,.12)" },
  session:  { label: "Session",  color: "#378ADD", bg: "rgba(55,138,221,.12)" },
  workshop: { label: "Atelier",  color: "#639922", bg: "rgba(99,153,34,.12)" },
  event:    { label: "Événement",color: "#888780", bg: "rgba(136,135,128,.12)" },
};

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
  const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${time}`;
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
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 10px; border-bottom: 1px solid var(--divider-color);
  }
  .header-left { display: flex; align-items: center; gap: 8px; }
  .header-title { font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
  .header-date  { font-size: 12px; color: var(--secondary-text-color); }
  ha-icon { --mdi-icon-size: 18px; color: var(--secondary-text-color); }
  .event-list { padding: 6px 0; }
  .event-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px; cursor: default; transition: background .15s;
  }
  .event-row:hover { background: var(--secondary-background-color); }
  .dot {
    width: 3px; border-radius: 2px; align-self: stretch;
    min-height: 32px; flex-shrink: 0;
  }
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
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-top: 1px solid var(--divider-color);
    font-size: 11px;
  }
  .footer-link { color: var(--primary-color); cursor: pointer; }
  .footer-ts   { color: var(--secondary-text-color); }
  .empty { padding: 20px 16px; font-size: 13px; color: var(--secondary-text-color); text-align: center; }
  .error { padding: 12px 16px; font-size: 12px; color: var(--error-color); }
`;

class BrightspaceAgendaCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Champ 'entity' requis (ex: sensor.brightspace_agenda)");
    this._config = config;
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

    const events = stateObj.attributes.events ?? [];
    const generatedAt = stateObj.attributes.generated_at;
    const title = this._config.title ?? stateObj.attributes.friendly_name ?? "Brightspace Agenda";
    const todayStr = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

    // Calcul de l'ancienneté du dernier refresh
    let tsLabel = "";
    if (generatedAt) {
      const diff = Math.round((Date.now() - new Date(generatedAt)) / 60000);
      tsLabel = diff < 2 ? "À l'instant" : `Il y a ${diff} min`;
    }

    const eventsHtml = events.length === 0
      ? `<div class="empty">Aucun événement à venir</div>`
      : events.map(ev => {
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
        }).join("");

    const appUrl = this._config.app_url ?? "";

    card.innerHTML = `
      <div class="header">
        <div class="header-left">
          <ha-icon icon="mdi:school"></ha-icon>
          <span class="header-title">${title}</span>
        </div>
        <span class="header-date">${todayStr}</span>
      </div>
      <div class="event-list">${eventsHtml}</div>
      <div class="footer">
        ${appUrl
          ? `<span class="footer-link" onclick="window.open('${appUrl}','_blank')">Ouvrir l'agenda ↗</span>`
          : `<span></span>`}
        <span class="footer-ts">${tsLabel}</span>
      </div>`;
  }

  static getConfigElement() {
    return document.createElement("brightspace-agenda-card-editor");
  }

  static getStubConfig() {
    return { entity: "sensor.brightspace_agenda", title: "Brightspace Agenda", app_url: "" };
  }

  getCardSize() { return 4; }
}

customElements.define("brightspace-agenda-card", BrightspaceAgendaCard);

window.customCards = window.customCards ?? [];
window.customCards.push({
  type:        "brightspace-agenda-card",
  name:        "Brightspace Agenda",
  description: "Affiche les prochains événements Brightspace (deadlines, sessions, ateliers).",
  preview:     true,
});
