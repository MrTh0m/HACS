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

ADDON_SLUG       = "brightspace_agenda"
SUPERVISOR_URL   = "http://supervisor"

STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(
            "share_url",
            description={"suggested_value": "https://votre-serveur/index.html?share=VOTRE_TOKEN"},
        ): str,
        vol.Optional("title", default="Brightspace Agenda"): str,
    }
)

STEP_ADDON_SCHEMA = vol.Schema(
    {
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


async def _discover_addon(hass) -> dict | None:
    """
    Interroge l'API Supervisor Discovery pour trouver le service brightspace_agenda.
    Retourne {"token": ..., "api_url": ..., "ingress_url": ...} si trouvé, None sinon.
    On ne tente la découverte que si le Supervisor est disponible (installation HAOS/Supervised).
    """
    supervisor_token = hass.data.get("hassio_supervisor_token") or \
                       __import__("os").environ.get("SUPERVISOR_TOKEN")
    if not supervisor_token:
        return None

    session = async_get_clientsession(hass, verify_ssl=False)
    headers = {
        "Authorization": f"Bearer {supervisor_token}",
        "Content-Type": "application/json",
    }

    try:
        # 1 — Chercher le service dans Discovery
        async with session.get(
            f"{SUPERVISOR_URL}/discovery",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=5),
        ) as resp:
            if resp.status != 200:
                return None
            data = await resp.json(content_type=None)

        discoveries = data.get("data", {}).get("discovery", [])
        bsa = next(
            (d for d in discoveries if d.get("service") == ADDON_SLUG),
            None,
        )
        if not bsa:
            return None

        config = bsa.get("config", {})
        token  = config.get("token")
        port   = config.get("port", 8099)
        if not token:
            return None

        # 2 — Obtenir l'IP de l'addon pour construire l'URL directe
        async with session.get(
            f"{SUPERVISOR_URL}/addons/{ADDON_SLUG}/info",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=5),
        ) as resp:
            if resp.status != 200:
                return None
            addon_data = (await resp.json(content_type=None)).get("data", {})

        ip_address  = addon_data.get("ip_address", "")
        ingress_url = addon_data.get("ingress_url")
        state       = addon_data.get("state", "")

        if not ip_address or state != "started":
            return None

        api_url = f"http://{ip_address}:{port}/api.php"

        return {
            "token":       token,
            "api_url":     api_url,
            "port":        port,
            "ip_address":  ip_address,
            "ingress_url": ingress_url,
            "state":       state,
        }

    except (aiohttp.ClientError, Exception) as err:
        _LOGGER.debug("Découverte addon impossible : %s", err)
        return None


class BrightspaceConfigFlow(ConfigFlow, domain=DOMAIN):
    """Gère le flux de configuration initial."""

    VERSION = 1

    def __init__(self) -> None:
        self._addon_info: dict | None = None

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """
        Point d'entrée du config flow.
        Tente d'abord la découverte auto de l'addon ; si trouvé → step 'addon_detected',
        sinon → step 'manual'.
        """
        if user_input is None:
            # Tentative de découverte silencieuse
            self._addon_info = await _discover_addon(self.hass)
            if self._addon_info:
                return await self.async_step_addon_detected()

        return await self.async_step_manual(user_input)

    async def async_step_addon_detected(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """L'addon a été détecté via Discovery — proposer l'enrôlement automatique."""
        errors: dict[str, str] = {}

        if user_input is not None:
            if user_input.get("use_addon"):
                # Enrôlement automatique
                info    = self._addon_info
                api_url = info["api_url"]
                token   = info["token"]
                error   = await _test_connection(self.hass, api_url, token)
                if error:
                    errors["base"] = error
                else:
                    await self.async_set_unique_id(f"brightspace_{token[:8]}")
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=user_input.get("title", "Brightspace Agenda"),
                        data={CONF_API_URL: api_url, CONF_TOKEN: token},
                    )
            else:
                # L'utilisateur préfère configurer manuellement
                return await self.async_step_manual()

        info = self._addon_info
        schema = vol.Schema({
            vol.Required("use_addon", default=True): bool,
            vol.Optional("title", default="Brightspace Agenda"): str,
        })

        return self.async_show_form(
            step_id="addon_detected",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "port":    str(info["port"]),
                "ip":      info["ip_address"],
                "api_url": info["api_url"],
            },
        )

    async def async_step_manual(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Configuration manuelle via URL de partage."""
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
            step_id="manual",
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
