"""Coordinator : récupère les événements depuis api.php toutes les 10 min."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_API_URL,
    CONF_TOKEN,
    DEFAULT_DAYS,
    DEFAULT_LIMIT,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


class BrightspaceCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Gère le polling de l'endpoint /api.php?action=upcoming."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.api_url = entry.data[CONF_API_URL].rstrip("/")
        self.token   = entry.data[CONF_TOKEN]
        self.limit   = entry.options.get("limit", DEFAULT_LIMIT)
        self.days    = entry.options.get("days",  DEFAULT_DAYS)
        scan = entry.options.get("scan_interval", DEFAULT_SCAN_INTERVAL)

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        """Appelle api.php et retourne les données brutes."""
        params = {
            "action": "upcoming",
            "token":  self.token,
            "limit":  self.limit,
            "days":   self.days,
        }
        session = async_get_clientsession(self.hass, verify_ssl=False)
        try:
            async with session.get(
                self.api_url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 401:
                    raise UpdateFailed("Token invalide ou share désactivé (401)")
                if resp.status != 200:
                    raise UpdateFailed(f"api.php a retourné HTTP {resp.status}")
                data = await resp.json(content_type=None)
        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Erreur réseau : {err}") from err

        if not data.get("ok"):
            raise UpdateFailed(f"Réponse inattendue : {data}")

        return data
