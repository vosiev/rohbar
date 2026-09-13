"""Offline checks: no Telegram requests and no production env access."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("setup_telegram", Path(__file__).with_name("setup-telegram.py"))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def configuration(self, text):
        with tempfile.TemporaryDirectory() as directory, patch.dict(setup.os.environ, {}, clear=True):
            path = Path(directory) / "test.env"
            path.write_text(text)
            return setup.configuration(path)

    def test_validates_without_executing_env(self):
        values = self.configuration(
            '# ignored\nTELEGRAM_BOT_TOKEN="123:test_value"\n'
            "TELEGRAM_WEBHOOK_SECRET='test-secret' # comment\n"
            f'FRONTEND_ORIGIN={setup.ORIGIN}\nUNRELATED=$(exit 99)\n'
        )
        self.assertEqual(values["TELEGRAM_WEBHOOK_SECRET"], "test-secret")
        for invalid in ("", "TELEGRAM_BOT_TOKEN=$(exit 99)", "TELEGRAM_BOT_TOKEN=x\nTELEGRAM_BOT_TOKEN=y"):
            with self.assertRaises(setup.SetupError):
                self.configuration(invalid)

    def test_rejects_invalid_secret_and_origin(self):
        for secret, origin in (("bad secret", setup.ORIGIN), ("x" * 257, setup.ORIGIN), ("ok", "http://rohbar.vosiev.com")):
            with self.assertRaises(setup.SetupError):
                self.configuration(f'TELEGRAM_BOT_TOKEN=123:test\nTELEGRAM_WEBHOOK_SECRET="{secret}"\nFRONTEND_ORIGIN={origin}')

    def test_repeatable_configuration_and_readback(self):
        class FakeAPI:
            def __init__(self):
                self.calls = []
                self.state = {}

            def call(self, method, payload=None):
                self.calls.append(method)
                if method == "getMe":
                    return {"is_bot": True}
                if method.startswith("set"):
                    self.state[method] = payload
                    return True
                if method == "getChatMenuButton":
                    menu = dict(self.state["setChatMenuButton"]["menu_button"])
                    menu["web_app"] = {"url": menu["web_app"]["url"] + "/"}
                    return menu
                return {
                    "getWebhookInfo": {"url": setup.WEBHOOK_URL, "allowed_updates": ["message"]},
                    "getMyCommands": self.state["setMyCommands"]["commands"],
                }[method]

        api = FakeAPI()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            setup.configure({"TELEGRAM_WEBHOOK_SECRET": "private-test-value"}, api)
            first = dict(api.state)
            setup.configure({"TELEGRAM_WEBHOOK_SECRET": "private-test-value"}, api)
        self.assertEqual(first, api.state)
        self.assertFalse(first["setWebhook"]["drop_pending_updates"])
        self.assertEqual(api.calls[0], "getMe")
        self.assertNotIn("private-test-value", output.getvalue())

    def test_redacts_transport_and_api_errors(self):
        api = setup.BotAPI("123:private-test-value")
        errors = [urllib.error.URLError(api.base), urllib.error.HTTPError(api.base, 401, api.base, {}, None)]
        for error in errors:
            with patch.object(api.opener, "open", side_effect=error):
                with self.assertRaises(setup.SetupError) as raised:
                    api.call("getMe")
                self.assertNotIn("private-test-value", str(raised.exception))
        with patch.object(api.opener, "open", return_value=io.BytesIO(json.dumps({"ok": False, "description": api.base}).encode())):
            with self.assertRaises(setup.SetupError) as raised:
                api.call("getMe")
            self.assertNotIn("private-test-value", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
