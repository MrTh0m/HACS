"""Sensor Brightspace Agenda — expose les prochains événements et métriques."""
from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import BrightspaceCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: BrightspaceCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([BrightspaceUpcomingSensor(coordinator, entry)])


class BrightspaceUpcomingSensor(CoordinatorEntity[BrightspaceCoordinator], SensorEntity):
    """Sensor principal : état = nombre d'événements à venir."""

    _attr_icon                       = "mdi:school"
    _attr_native_unit_of_measurement = "événements"
    _attr_state_class                = SensorStateClass.MEASUREMENT
    _attr_has_entity_name            = True

    def __init__(self, coordinator: BrightspaceCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_upcoming"
        self._attr_name = f"{entry.title} — Événements à venir"

    @property
    def native_value(self) -> int:
        if not self.coordinator.data:
            return 0
        return self.coordinator.data.get("stats", {}).get("a_venir",
               self.coordinator.data.get("count", 0))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if not self.coordinator.data:
            return {}
        data = self.coordinator.data
        stats = data.get("stats", {})
        return {
            # Métriques agrégées — utilisées par la card pour les chiffres clés
            "a_venir":      stats.get("a_venir", 0),
            "individuels":  stats.get("individuels", 0),
            "collectifs":   stats.get("collectifs", 0),
            "urgents":      stats.get("urgents", 0),
            # Liste des événements — utilisée par la card pour l'agenda
            "events":       data.get("events", []),
            "generated_at": data.get("generated_at"),
        }
