# Brightspace Agenda — intégration Home Assistant

Affiche les prochains événements de [Brightspace Agenda](https://github.com/MrTh0m/Brightspace_agenda) dans un tableau de bord Home Assistant.

## Prérequis

- Home Assistant 2024.1+
- [HACS](https://hacs.xyz/) installé
- Brightspace Agenda déployé avec le **partage activé** (icône Partager dans l'app > Copier le lien)

## Installation

### 1 — Ajouter le dépôt dans HACS

HACS → Menu (⋮) → **Dépôts personnalisés** → coller `https://github.com/MrTh0m/HACS` → catégorie **Intégration** → Ajouter.

Puis : HACS → Intégrations → **Brightspace Agenda** → Télécharger → Redémarrer HA.

La card Lovelace est copiée automatiquement dans `www/` lors de l'installation.

### 2 — Configurer l'intégration

Paramètres → Appareils & Services → **+ Ajouter une intégration** → rechercher *Brightspace Agenda*.

| Champ | Exemple |
|---|---|
| URL de partage | `https://votre-serveur/index.html?share=abc123...` |
| Nom affiché | `Brightspace Agenda` |

L'URL est celle générée par l'application (icône Partager > Copier le lien). L'intégration en extrait automatiquement l'adresse du serveur et le token.

### 3 — Ajouter la card au tableau de bord

Éditer un dashboard → **+ Ajouter une carte** → chercher *Brightspace* dans les cartes personnalisées.

Ou en YAML manuel :

```yaml
type: custom:brightspace-agenda-card
entity: sensor.brightspace_agenda_evenements_a_venir
app_url: https://votre-serveur/    # optionnel — lien "Ouvrir l'agenda"
```

## Options

Paramètres → Appareils & Services → Brightspace Agenda → **Configurer** :

| Option | Défaut | Description |
|---|---|---|
| `limit` | 5 | Nombre d'événements affichés (1–20) |
| `days` | 14 | Horizon en jours (1–60) |
| `scan_interval` | 600 | Intervalle de polling en secondes |

## Sensor exposé

`sensor.brightspace_agenda_evenements_a_venir`

| Attribut | Type | Description |
|---|---|---|
| `state` | int | Nombre d'événements à venir |
| `events` | list | Liste des événements |
| `generated_at` | ISO 8601 | Horodatage du dernier refresh |

Structure d'un événement :

```json
{
  "uid":        "abc123",
  "summary":    "Rendu stratégie digitale",
  "type":       "deadline",
  "start_iso":  "2026-06-25T23:59:00+02:00",
  "end_iso":    "2026-06-25T23:59:00+02:00",
  "days_until": 2,
  "subject":    "Marketing"
}
```

Types : `deadline`, `session`, `workshop`, `event`.

## Automatisation exemple

Notification si une deadline tombe dans moins de 2 jours :

```yaml
alias: Alerte deadline Brightspace
trigger:
  - platform: template
    value_template: >
      {% set events = state_attr('sensor.brightspace_agenda_evenements_a_venir', 'events') %}
      {% if events %}
        {{ events | selectattr('type', 'eq', 'deadline')
                  | selectattr('days_until', 'le', 1)
                  | list | count > 0 }}
      {% endif %}
action:
  - service: notify.mobile_app
    data:
      title: "Deadline imminente — Brightspace"
      message: >
        {% set ev = state_attr('sensor.brightspace_agenda_evenements_a_venir', 'events')
                    | selectattr('type', 'eq', 'deadline')
                    | selectattr('days_until', 'le', 1)
                    | first %}
        {{ ev.summary }} — {{ ev.start_iso[:10] }}
```
