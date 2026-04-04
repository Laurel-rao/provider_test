"""Shared test configuration – runs before any test module is collected."""

import os

from cryptography.fernet import Fernet

# Ensure a valid Fernet key is available for all tests that import app modules
os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode())
