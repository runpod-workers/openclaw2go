"""
Abstract base class for a2go media plugins.

Each plugin handles one media capability (image gen, TTS, STT, etc.)
and registers its FastAPI routes via a router.
"""

from abc import ABC, abstractmethod
from fastapi import APIRouter


class MediaPlugin(ABC):
    """Base class for media server plugins."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine ID, e.g. 'image-gen'."""
        ...

    @property
    @abstractmethod
    def role(self) -> str:
        """Service role, e.g. 'image'."""
        ...

    @abstractmethod
    def load_model(self, config: dict) -> None:
        """Load the model into memory. Called once at startup."""
        ...

    @abstractmethod
    def router(self) -> APIRouter:
        """Return a FastAPI router with this plugin's endpoints."""
        ...

    @abstractmethod
    def health(self) -> dict:
        """Return health status dict, e.g. {'status': 'ok', 'model_loaded': True}."""
        ...
