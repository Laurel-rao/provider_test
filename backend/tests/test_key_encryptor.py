import os

import pytest

# Set a valid Fernet key before importing the module
os.environ["FERNET_KEY"] = "ZmFrZS1mZXJuZXQta2V5LWZvci10ZXN0aW5nMTIzNDU="

# Generate a proper Fernet key for tests
from cryptography.fernet import Fernet

_test_fernet_key = Fernet.generate_key().decode()
os.environ["FERNET_KEY"] = _test_fernet_key

from app.services.key_encryptor import KeyEncryptor


@pytest.fixture
def encryptor():
    return KeyEncryptor()


class TestEncryptDecrypt:
    def test_encrypt_returns_string(self, encryptor):
        result = encryptor.encrypt("my-secret-api-key")
        assert isinstance(result, str)

    def test_decrypt_reverses_encrypt(self, encryptor):
        plain = "sk-abc123xyz789"
        encrypted = encryptor.encrypt(plain)
        assert encryptor.decrypt(encrypted) == plain

    def test_encrypt_produces_different_ciphertext(self, encryptor):
        plain = "same-key"
        enc1 = encryptor.encrypt(plain)
        enc2 = encryptor.encrypt(plain)
        # Fernet uses a timestamp + random IV, so ciphertexts differ
        assert enc1 != enc2

    def test_decrypt_both_ciphertexts(self, encryptor):
        plain = "same-key"
        enc1 = encryptor.encrypt(plain)
        enc2 = encryptor.encrypt(plain)
        assert encryptor.decrypt(enc1) == plain
        assert encryptor.decrypt(enc2) == plain


class TestMask:
    def test_long_key_shows_first4_last4(self):
        assert KeyEncryptor.mask("abcdefghijklmnop") == "abcd****mnop"

    def test_exactly_9_chars(self):
        assert KeyEncryptor.mask("123456789") == "1234****6789"

    def test_8_chars_shows_first2_last2(self):
        assert KeyEncryptor.mask("12345678") == "12****78"

    def test_short_key_4_chars(self):
        assert KeyEncryptor.mask("abcd") == "ab****cd"

    def test_short_key_3_chars(self):
        # first 2 = "ab", last 2 = "bc" -> overlap is fine for masking
        assert KeyEncryptor.mask("abc") == "ab****bc"
