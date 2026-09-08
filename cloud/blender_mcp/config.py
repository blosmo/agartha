"""Shared, credential-free limits for cloud Blender sessions."""
from pathlib import PurePosixPath
import re
import uuid

APP_NAME = 'agartha-blender-mcp'
VOLUME_NAME = 'agartha-blender-projects'
BLENDER_VERSION = '4.5.0'
UPSTREAM_COMMIT = 'c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9'
HTTP_PORT = 8080
ADDON_PORT = 9876
WORKSPACE = PurePosixPath('/workspace')
PROJECT_FILE = WORKSPACE / 'project.blend'
ARTIFACT_DIRECTORY = WORKSPACE / 'artifacts'
DEFAULT_IDLE_SECONDS = 180
DEFAULT_TIMEOUT_SECONDS = 1800
CPU_REQUEST = 0.125
DEFAULT_CPU_LIMIT = 2
MEMORY_REQUEST_MIB = 1024
MEMORY_LIMIT_MIB = 4096
MAX_SCRIPT_BYTES = 65_536
MAX_GLB_BYTES = 16_000_000
MAX_BLEND_BYTES = 128_000_000
MAX_PNG_BYTES = 8_000_000
MAX_ARTIFACTS = 32
MAX_RENDER_SIZE = 1024
MAX_RENDER_SAMPLES = 32
CORE_TOOLS = frozenset({
    'get_addon_status', 'get_scene_info', 'get_object_info',
    'get_viewport_screenshot', 'execute_blender_code',
})


def project_id(value: str | None = None) -> str:
    """Use an opaque canonical identifier, never a supplied filesystem path."""
    if value is None:
        return uuid.uuid4().hex
    if not isinstance(value, str):
        raise ValueError('Project ID must be a UUID.')
    try:
        return uuid.UUID(value).hex
    except (ValueError, AttributeError) as error:
        raise ValueError('Project ID must be a UUID.') from error


def artifact_name(value: str, suffix: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value):
        raise ValueError('Artifact name must contain 1–64 letters, numbers, underscores or hyphens.')
    if suffix not in {'.blend', '.glb', '.png'}:
        raise ValueError('Unsupported artifact format.')
    return value + suffix
