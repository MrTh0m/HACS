"""Sensor Brightspace Agenda — expose les prochains événements."""
from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
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
    """Crée le sensor depuis l'entrée de config."""
    coordinator: BrightspaceCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([BrightspaceUpcomingSensor(coordinator, entry)])


class BrightspaceUpcomingSensor(CoordinatorEntity[BrightspaceCoordinator], SensorEntity):
    """Sensor principal : état = nombre d'événements à venir."""

    _attr_icon = "mdi:school"
    _attr_native_unit_of_measurement = "événements"

    def __init__(
        self,
        coordinator: BrightspaceCoordinator,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_upcoming"
        self._attr_name = entry.title or "Brightspace Agenda"

    @property
    def native_value(self) -> int:
        """Nombre d'événements retournés."""
        return self.coordinator.data.get("count", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Attributs exposés : events + generated_at."""
        data = self.coordinator.data
        return {
            "events":       data.get("events", []),
            "generated_at": data.get("generated_at"),
        }
