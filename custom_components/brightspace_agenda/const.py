"""Constantes de l'intégration Brightspace Agenda."""

DOMAIN = "brightspace_agenda"
PLATFORMS = ["sensor"]

CONF_API_URL = "api_url"       # ex: https://nas.home/api.php
CONF_TOKEN   = "token"         # share_token de l'app

DEFAULT_SCAN_INTERVAL = 600    # 10 minutes
DEFAULT_LIMIT         = 5
DEFAULT_DAYS          = 14

EVENT_TYPE_LABELS = {
    "deadline": "Deadline",
    "session":  "Session",
    "workshop": "Atelier",
    "event":    "Événement",
}
