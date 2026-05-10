"""Vercel Python entrypoint.

This file must expose a top-level `app` variable so the Vercel Python runtime
can detect the Flask handler during build.
"""

import os
import sys

# Ensure repository root is importable when running in Vercel.
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app import app  # noqa: E402

# Compatibility aliases accepted by different WSGI loaders.
application = app
handler = app

