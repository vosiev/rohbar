#!/usr/bin/env python3
"""Configure RohBar's production bot without exposing credentials or sourcing shell code."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import sys
import urllib.error
import urllib.request

ORIGIN = "https://rohbar.vosiev.com"
WEBHOOK_URL = "https://rohbar-api.vosiev.com/api/v1/telegram/webhook"
KEYS = ("TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "FRONTEND_ORIGIN")


class SetupError(Exception):
    pass


def configuration(path):
    values = {}
    try:
        lines = path.read_text().splitlines()
    except OSError:
        raise SetupError("Cannot read env file") from None
    for line in lines:
        key, separator, raw = line.removeprefix("export ").partition("=")
        key = key.strip()
        if not separator or key not in KEYS:
            continue
        if key in values:
            raise SetupError(f"Duplicate {key} in env file")
        try:
            parts = shlex.split(raw, comments=True)
        except ValueError:
            raise SetupError(f"Invalid quoting for {key}") from None
        if len(parts) > 1:
            raise SetupError(f"Invalid value for {key}")
        values[key] = parts[0] if parts else ""
    for key in KEYS:
        if key in os.environ:
            values[key] = os.environ[key]
        if not values.get(key):
            raise SetupError(f"Required value is empty: {key}")
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]+", values["TELEGRAM_BOT_TOKEN"]):
        raise SetupError("Invalid TELEGRAM_BOT_TOKEN format")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", values["TELEGRAM_WEBHOOK_SECRET"]):
        raise SetupError("Invalid TELEGRAM_WEBHOOK_SECRET format (1–256: A-Z a-z 0-9 _ -)")
    if values["FRONTEND_ORIGIN"] != ORIGIN:
        raise SetupError(f"FRONTEND_ORIGIN must be {ORIGIN}")
    return values


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class BotAPI:
    def __init__(self, token):
        self.base = f"https://api.telegram.org/bot{token}/"
        # Do not use ambient HTTP proxies or follow redirects with credentials.
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def call(self, method, payload=None):
        request = urllib.request.Request(
            self.base + method,
            data=json.dumps(payload or {}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self.opener.open(request, timeout=20) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise SetupError(f"{method}: HTTP {error.code}") from None
        except (OSError, ValueError, urllib.error.URLError):
            raise SetupError(f"{method}: transport or invalid response error") from None
        if not isinstance(result, dict) or result.get("ok") is not True or "result" not in result:
            # Never echo descriptions, bodies, exceptions or request URLs.
            raise SetupError(f"{method}: Bot API rejected the request")
        return result["result"]


def configure(values, api):
    bot = api.call("getMe")
    if not isinstance(bot, dict) or bot.get("is_bot") is not True:
        raise SetupError("getMe: bot identity was not confirmed")
    webhook = WEBHOOK_URL
    menu = {"type": "web_app", "text": "RohBar", "web_app": {"url": ORIGIN}}
    commands = [
        {"command": "start", "description": "Открыть RohBar / Кушодани RohBar"},
        {"command": "link", "description": "Привязать аккаунт / Пайваст кардани ҳисоб"},
        {"command": "help", "description": "Помощь / Кӯмак"},
    ]
    for method, payload in (
        ("setWebhook", {"url": webhook, "secret_token": values["TELEGRAM_WEBHOOK_SECRET"],
                        "allowed_updates": ["message"], "drop_pending_updates": False}),
        ("setChatMenuButton", {"menu_button": menu}),
        ("setMyCommands", {"commands": commands}),
    ):
        if api.call(method, payload) is not True:
            raise SetupError(f"{method}: success was not confirmed")
    info = api.call("getWebhookInfo")
    if not isinstance(info, dict) or info.get("url") != webhook or info.get("allowed_updates") != ["message"]:
        raise SetupError("getWebhookInfo: webhook configuration mismatch")
    actual_menu = api.call("getChatMenuButton")
    expected_url = menu["web_app"]["url"].rstrip("/")
    actual_url = actual_menu.get("web_app", {}).get("url", "").rstrip("/") if isinstance(actual_menu, dict) else ""
    if (
        not isinstance(actual_menu, dict)
        or actual_menu.get("type") != "web_app"
        or actual_menu.get("text") != menu["text"]
        or actual_url != expected_url
    ):
        raise SetupError("getChatMenuButton: menu configuration mismatch")
    if api.call("getMyCommands") != commands:
        raise SetupError("getMyCommands: command configuration mismatch")
    print("Telegram webhook, default menu and commands verified; pending updates preserved.")
    if info.get("last_error_date") or info.get("last_synchronization_error_date"):
        print("Telegram reports a previous webhook delivery error; verify /start delivery and backend logs.")
    print("The webhook secret is not returned by getWebhookInfo; verify authenticated delivery with /start.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(__file__).resolve().parents[1] / "infra/.env")
    parser.add_argument("--check-only", action="store_true", help="Validate local configuration without network calls")
    args = parser.parse_args()
    try:
        values = configuration(args.env_file)
        if args.check_only:
            print("Required Telegram configuration is valid; no network calls made.")
        else:
            configure(values, BotAPI(values["TELEGRAM_BOT_TOKEN"]))
    except SetupError as error:
        print(f"Telegram setup failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        # Suppress unexpected tracebacks that may contain token-bearing URLs.
        print("Telegram setup failed unexpectedly; no credentials were logged.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
