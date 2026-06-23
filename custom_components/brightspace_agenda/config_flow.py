"""Config flow — UI d'installation dans Paramètres > Appareils & Services."""
from __future__ import annotations

import logging
from urllib.parse import urlparse, parse_qs, urlunparse
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow, ConfigEntry
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    CONF_API_URL,
    CONF_TOKEN,
    DEFAULT_DAYS,
    DEFAULT_LIMIT,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(
            "share_url",
            description={"suggested_value": "https://votre-serveur/index.html?share=VOTRE_TOKEN"},
        ): str,
        vol.Optional("title", default="Brightspace Agenda"): str,
    }
)


def parse_share_url(share_url: str) -> tuple[str, str] | None:
    """
    Extrait api_url et token depuis l'URL de partage de l'app.
    Entrée :  https://mon-serveur/index.html?share=abc123
    Sortie :  ("https://mon-serveur/api.php", "abc123")
    """
    try:
        parsed = urlparse(share_url.strip())
        token = parse_qs(parsed.query).get("share", [None])[0]
        if not token:
            return None
        # Remplace le chemin (quel qu'il soit) par /api.php
        api_path = parsed.path.rsplit("/", 1)[0] + "/api.php"
        api_url = urlunparse((parsed.scheme, parsed.netloc, api_path, "", "", ""))
        return api_url, token
    except Exception:
        return None


async def _test_connection(hass, api_url: str, token: str) -> str | None:
    """Tente un appel ?action=upcoming&limit=1. Retourne None si OK, sinon code d'erreur."""
    session = async_get_clientsession(hass, verify_ssl=False)
    try:
        async with session.get(
            api_url,
            params={"action": "upcoming", "token": token, "limit": 1, "days": 7},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status == 401:
                return "invalid_token"
            if resp.status != 200:
                return "cannot_connect"
            data = await resp.json(content_type=None)
            if not data.get("ok"):
                return "unexpected_response"
    except aiohttp.ClientError:
        return "cannot_connect"
    return None


class BrightspaceConfigFlow(ConfigFlow, domain=DOMAIN):
    """Gère le flux de configuration initial."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            parsed = parse_share_url(user_input["share_url"])
            if not parsed:
                errors["share_url"] = "invalid_share_url"
            else:
                api_url, token = parsed
                error = await _test_connection(self.hass, api_url, token)
                if error:
                    errors["base"] = error
                else:
                    await self.async_set_unique_id(f"brightspace_{token[:8]}")
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=user_input.get("title", "Brightspace Agenda"),
                        data={CONF_API_URL: api_url, CONF_TOKEN: token},
                    )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_SCHEMA,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(entry: ConfigEntry) -> OptionsFlow:
        return BrightspaceOptionsFlow(entry)


class BrightspaceOptionsFlow(OptionsFlow):
    """Options : intervalle de polling, limit, days."""

    def __init__(self, entry: ConfigEntry) -> None:
        self._entry = entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        schema = vol.Schema(
            {
                vol.Optional(
                    "limit",
                    default=self._entry.options.get("limit", DEFAULT_LIMIT),
                ): vol.All(int, vol.Range(min=1, max=20)),
                vol.Optional(
                    "days",
                    default=self._entry.options.get("days", DEFAULT_DAYS),
                ): vol.All(int, vol.Range(min=1, max=60)),
                vol.Optional(
                    "scan_interval",
                    default=self._entry.options.get("scan_interval", DEFAULT_SCAN_INTERVAL),
                ): vol.All(int, vol.Range(min=60, max=3600)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
