"""Entry point for hosting services such as PythonAnywhere (see DEPLOY.md).

Hosts import `application` from this file instead of running `python app.py`,
so this file switches on real-pot mode and creates the database tables.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

os.environ.setdefault("REAL_POT", "1")   # online there is no simulator; the real pot sends readings

from app import app as application, init_db  # noqa: E402

init_db()
