# Brightspace Agenda — intégration Home Assistant

Affiche les prochains événements de [Brightspace Agenda](https://github.com/MrTh0m/Brightspace_agenda) dans un tableau de bord Home Assistant.

## Prérequis

- Home Assistant 2024.1+
- [HACS](https://hacs.xyz/) installé
- Brightspace Agenda déployé et le **share token** activé (Paramètres > Partage dans l'app)

## Installation

### 1 — Ajouter le dépôt dans HACS

HACS → Menu (⋮) → **Dépôts personnalisés** → coller l'URL du repo → catégorie **Intégration** → Ajouter.

Puis : HACS → Intégrations → **Brightspace Agenda** → Télécharger → Redémarrer HA.

### 2 — Configurer l'intégration

Paramètres → Appareils & Services → **+ Ajouter une intégration** → rechercher *Brightspace Agenda*.

| Champ | Exemple |
|---|---|
| URL de l'API | `https://ton-nas.home/api.php` |
| Token de partage | `abc123def456...` (copié depuis l'app) |
| Nom affiché | `Brightspace Agenda` |

L'intégration teste la connexion avant de valider.

### 3 — Ajouter la card Lovelace

Tableaux de bord → **Ressources** → Ajouter :

```
URL  : /hacsfiles/brightspace_agenda/brightspace-agenda-card.js
Type : Module JavaScript
```

Puis dans ton dashboard, ajouter une carte **Manuelle** :

```yaml
type: custom:brightspace-agenda-card
entity: sensor.brightspace_agenda
title: Brightspace Agenda   # optionnel
app_url: https://ton-nas.home/   # optionnel — lien "Ouvrir l'agenda"
```

## Options

Paramètres → Appareils & Services → Brightspace Agenda → **Configurer** :

| Option | Défaut | Description |
|---|---|---|
| `limit` | 5 | Nombre d'événements affichés (1–20) |
| `days` | 14 | Horizon en jours (1–60) |
| `scan_interval` | 600 | Intervalle de polling en secondes |

## Sensor exposé

| Attribut | Type | Description |
|---|---|---|
| `state` | int | Nombre d'événements à venir |
| `events` | list | Liste des événements (voir ci-dessous) |
| `generated_at` | ISO 8601 | Horodatage du dernier refresh |

Structure d'un événement :

```json
{
  "uid":        "abc123",
  "summary":    "Rendu stratégie digitale",
  "type":       "deadline",
  "start_iso":  "2026-06-24T23:59:00+02:00",
  "end_iso":    "2026-06-24T23:59:00+02:00",
  "days_until": 1,
  "subject":    "Marketing"
}
```

Types possibles : `deadline`, `session`, `workshop`, `event`.

## Automatisations

Exemple — notification HA si une deadline est dans moins de 2 jours :

```yaml
alias: Alerte deadline Brightspace
trigger:
  - platform: template
    value_template: >
      {% set events = state_attr('sensor.brightspace_agenda', 'events') %}
      {% if events %}
        {{ events | selectattr('type', 'eq', 'deadline')
                  | selectattr('days_until', 'le', 1)
                  | list | count > 0 }}
      {% endif %}
action:
  - service: notify.mobile_app_mon_telephone
    data:
      title: "Deadline imminente"
      message: >
        {% set ev = state_attr('sensor.brightspace_agenda', 'events')
                    | selectattr('type', 'eq', 'deadline')
                    | selectattr('days_until', 'le', 1)
                    | first %}
        {{ ev.summary }} — {{ ev.start_iso[:10] }}
```
