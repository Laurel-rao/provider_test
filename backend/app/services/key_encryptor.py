from cryptography.fernet import Fernet

from app.config import settings


class KeyEncryptor:
    """Handles encryption, decryption, and masking of API keys using Fernet symmetric encryption."""

    def __init__(self) -> None:
        self._fernet = Fernet(settings.FERNET_KEY.encode())

    def encrypt(self, plain_key: str) -> str:
        """Encrypt a plain-text API key and return a base64-encoded string."""
        return self._fernet.encrypt(plain_key.encode()).decode()

    def decrypt(self, encrypted_key: str) -> str:
        """Decrypt an encrypted API key and return the plain text."""
        return self._fernet.decrypt(encrypted_key.encode()).decode()

    @staticmethod
    def mask(plain_key: str) -> str:
        """Return a masked version of the key, showing only partial characters.

        Keys longer than 8 chars: show first 4 and last 4 with **** in between.
        Keys of 8 chars or less: show first 2 and last 2 with **** in between.
        """
        if len(plain_key) <= 8:
            return plain_key[:2] + "****" + plain_key[-2:]
        return plain_key[:4] + "****" + plain_key[-4:]


key_encryptor = KeyEncryptor()
