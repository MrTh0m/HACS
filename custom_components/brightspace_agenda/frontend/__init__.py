"""Enregistrement de la ressource Lovelace brightspace-agenda-card.js."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

URL_BASE   = "/brightspace-agenda"
CARD_FILE  = "brightspace-agenda-card.js"
CARD_URL   = f"{URL_BASE}/{CARD_FILE}"
CARD_PATH  = Path(__file__).parent / CARD_FILE


async def async_register(hass: HomeAssistant) -> None:
    """Expose le fichier JS en statique et l'inscrit dans les ressources Lovelace."""

    # 1 — Chemin statique : rend le JS accessible à HA même en mode YAML
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
        _LOGGER.debug("Lovelace en mode YAML — ajouter manuellement : %s", CARD_URL)
        return

    resources: ResourceStorageCollection = lovelace.resources
    await resources.async_load()

    # Vérifie si la ressource est déjà inscrite
    already = any(
        res["url"].startswith(URL_BASE)
        for res in resources.async_items()
    )
    if already:
        _LOGGER.debug("Ressource Lovelace déjà présente")
        return

    await resources.async_create_item({"res_type": "module", "url": CARD_URL})
    _LOGGER.info("Ressource Lovelace enregistrée : %s", CARD_URL)
