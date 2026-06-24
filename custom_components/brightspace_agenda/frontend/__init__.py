"""Enregistrement de la ressource Lovelace brightspace-agenda-card.js."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

URL_BASE  = "/brightspace-agenda"
CARD_FILE = "brightspace-agenda-card.js"
CARD_PATH = Path(__file__).parent / CARD_FILE

# Lit la version depuis manifest.json pour le cache-busting automatique
def _get_version() -> str:
    try:
        manifest = Path(__file__).parent.parent / "manifest.json"
        return json.loads(manifest.read_text())["version"]
    except Exception:
        return "0"

def _versioned_url() -> str:
    return f"{URL_BASE}/{CARD_FILE}?v={_get_version()}"


async def async_register(hass: HomeAssistant) -> None:
    """Expose le fichier JS en statique et met à jour la ressource Lovelace si nécessaire."""

    versioned_url = _versioned_url()

    # 1 — Chemin statique (cache_headers=False : HA ne met pas en cache côté serveur)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(CARD_PATH.parent), cache_headers=False)]
    )

    # 2 — Ressource Lovelace (mode storage uniquement)
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        _LOGGER.debug("Lovelace non disponible — ressource non inscrite automatiquement")
        return

    mode = getattr(lovelace, "mode", getattr(lovelace, "resource_mode", "yaml"))
    if mode not in ("storage", "auto-gen"):
        _LOGGER.debug("Lovelace en mode YAML — ajouter manuellement : %s", versioned_url)
        return

    resources: ResourceStorageCollection = lovelace.resources
    await resources.async_load()
    existing = [r for r in resources.async_items() if r["url"].startswith(URL_BASE)]

    if not existing:
        # Première installation : enregistrer
        await resources.async_create_item({"res_type": "module", "url": versioned_url})
        _LOGGER.info("Ressource Lovelace enregistrée : %s", versioned_url)
        return

    current_url = existing[0]["url"]
    if current_url == versioned_url:
        _LOGGER.debug("Ressource Lovelace à jour (%s)", versioned_url)
        return

    # Version différente → mettre à jour l'URL pour invalider le cache navigateur
    resource_id = existing[0]["id"]
    await resources.async_update_item(resource_id, {"res_type": "module", "url": versioned_url})
    _LOGGER.info("Ressource Lovelace mise à jour : %s → %s", current_url, versioned_url)
