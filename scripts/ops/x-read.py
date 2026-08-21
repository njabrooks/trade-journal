#!/usr/bin/env python3
"""Run the allowlisted read-only Bird surface with Workspace-delivered cookies."""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from pathlib import Path
from typing import Callable, Mapping, Sequence


WORKSPACE_CLI = "/Users/home-hub/projects/workspace"
PYTHON = "/opt/homebrew/bin/python3"
BIRD = "/opt/homebrew/bin/bird"
SERVICE = "trade-journal.x-read"
READ_COMMANDS = frozenset(
    {
        "about",
        "bookmarks",
        "followers",
        "following",
        "home",
        "likes",
        "list-timeline",
        "lists",
        "mentions",
        "news",
        "read",
        "replies",
        "search",
        "thread",
        "trending",
        "user-tweets",
        "whoami",
    }
)
DENIED_CREDENTIAL_OPTIONS = (
    "--auth-token",
    "--chrome-profile",
    "--chrome-profile-dir",
    "--cookie-source",
    "--ct0",
    "--firefox-profile",
)
Run = Callable[..., subprocess.CompletedProcess[str]]


class XReadError(RuntimeError):
    """A redacted read-boundary failure."""


def ensure_workspace_delivery(
    argv: Sequence[str],
    environment: Mapping[str, str],
    *,
    execv: Callable[[str, list[str]], object] = os.execv,
) -> str:
    missing = [name for name in ("X_AUTH_TOKEN", "X_CT0") if not environment.get(name)]
    marker = environment.get("WORKSPACE_CREDENTIAL_SERVICE")
    if marker and marker != SERVICE:
        raise XReadError("Workspace credential service is not authorized for this consumer")
    if not missing:
        return "workspace-keychain" if marker == SERVICE else "legacy-environment"
    if marker:
        raise XReadError(f"workspace X credential delivery is incomplete: {', '.join(missing)}")
    command = [
        WORKSPACE_CLI,
        "credential",
        "run",
        SERVICE,
        "--",
        PYTHON,
        "-B",
        str(Path(argv[0]).resolve(strict=False)),
        *argv[1:],
    ]
    try:
        execv(PYTHON, [PYTHON, "-B", *command])
    except OSError as error:
        raise XReadError("Workspace credential boundary is unavailable") from error
    raise XReadError("Workspace credential boundary did not replace the process")


def _credential(environment: Mapping[str, str], name: str) -> str:
    value = environment.get(name, "")
    if not value:
        raise XReadError(f"X credential unavailable: {name}")
    if any(character in value for character in ("\x00", "\n", "\r")):
        raise XReadError(f"X credential malformed: {name}")
    return value


def _redact(text: str, values: Sequence[str]) -> str:
    tokens = set(values)
    for value in values:
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
        tokens.update((digest, digest.upper()))
    for token in sorted(tokens, key=len, reverse=True):
        text = text.replace(token, "[REDACTED]")
    return text


def run_bird(
    bird_arguments: Sequence[str],
    environment: Mapping[str, str],
    *,
    run: Run = subprocess.run,
) -> subprocess.CompletedProcess[str]:
    if not bird_arguments or bird_arguments[0] not in READ_COMMANDS:
        raise XReadError("Bird operation is not in the read-only allowlist")
    if any(
        argument == option or argument.startswith(f"{option}=")
        for argument in bird_arguments
        for option in DENIED_CREDENTIAL_OPTIONS
    ):
        raise XReadError("Bird credential-source option is not permitted")
    auth = _credential(environment, "X_AUTH_TOKEN")
    ct0 = _credential(environment, "X_CT0")
    child_environment = {
        key: value
        for key, value in environment.items()
        if key not in {"X_AUTH_TOKEN", "X_CT0", "AUTH_TOKEN", "CT0"}
    }
    child_environment.update({"AUTH_TOKEN": auth, "CT0": ct0})
    try:
        completed = run(
            (BIRD, *bird_arguments),
            env=child_environment,
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise XReadError("Bird read provider is unavailable") from error
    stdout = _redact(completed.stdout, (auth, ct0))
    stderr = _redact(completed.stderr, (auth, ct0))
    return subprocess.CompletedProcess(completed.args, completed.returncode, stdout, stderr)


def self_test() -> None:
    environment = {
        "PATH": "/usr/bin",
        "X_AUTH_TOKEN": "fixture-auth-secret",
        "X_CT0": "fixture-ct0-secret",
    }
    calls: list[tuple[tuple[str, ...], dict[str, object]]] = []

    def fixture_run(command: tuple[str, ...], **options: object) -> subprocess.CompletedProcess[str]:
        calls.append((command, options))
        return subprocess.CompletedProcess(
            command,
            0,
            f"result fixture-auth-secret\n",
            "diagnostic fixture-ct0-secret\n",
        )

    completed = run_bird(("thread", "https://x.com/example/status/1"), environment, run=fixture_run)
    assert completed.stdout == "result [REDACTED]\n"
    assert completed.stderr == "diagnostic [REDACTED]\n"
    command, options = calls[0]
    assert command == (BIRD, "thread", "https://x.com/example/status/1")
    assert "fixture-auth-secret" not in command and "fixture-ct0-secret" not in command
    child_environment = options["env"]
    assert isinstance(child_environment, dict)
    assert child_environment.get("AUTH_TOKEN") == environment["X_AUTH_TOKEN"]
    assert child_environment.get("CT0") == environment["X_CT0"]
    assert "X_AUTH_TOKEN" not in child_environment and "X_CT0" not in child_environment

    auth_digest = hashlib.sha256(environment["X_AUTH_TOKEN"].encode("utf-8")).hexdigest()

    def stale_run(command: tuple[str, ...], **options: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            command,
            1,
            f"provider HTTP 401 {auth_digest}\n",
            f"stale {environment['X_CT0']}\n",
        )

    stale = run_bird(("whoami",), environment, run=stale_run)
    assert stale.returncode == 1
    assert stale.stdout == "provider HTTP 401 [REDACTED]\n"
    assert stale.stderr == "stale [REDACTED]\n"

    try:
        run_bird(("fixture-write",), environment, run=fixture_run)
    except XReadError:
        pass
    else:
        raise AssertionError("non-read operation was accepted")

    try:
        run_bird(("whoami", "--chrome-profile", "Default"), environment, run=fixture_run)
    except XReadError as error:
        assert str(error) == "Bird credential-source option is not permitted"
    else:
        raise AssertionError("alternate Bird credential source was accepted")

    try:
        ensure_workspace_delivery(
            ("x-read.py", "whoami"),
            {**environment, "WORKSPACE_CREDENTIAL_SERVICE": "another.x-service"},
        )
    except XReadError as error:
        assert str(error) == "Workspace credential service is not authorized for this consumer"
    else:
        raise AssertionError("wrong Workspace service marker was accepted")

    try:
        ensure_workspace_delivery(
            ("x-read.py", "whoami"),
            {
                "WORKSPACE_CREDENTIAL_SERVICE": SERVICE,
                "X_AUTH_TOKEN": environment["X_AUTH_TOKEN"],
            },
        )
    except XReadError as error:
        assert str(error) == "workspace X credential delivery is incomplete: X_CT0"
    else:
        raise AssertionError("incomplete Workspace delivery was accepted")

    try:
        _credential({"X_CT0": "malformed\nfixture"}, "X_CT0")
    except XReadError as error:
        assert str(error) == "X credential malformed: X_CT0"
    else:
        raise AssertionError("malformed credential material was accepted")

    def unavailable_execv(executable: str, command: list[str]) -> object:
        assert executable == PYTHON
        assert command[:4] == [PYTHON, "-B", WORKSPACE_CLI, "credential"]
        raise OSError("fixture boundary unavailable")

    try:
        ensure_workspace_delivery(
            ("x-read.py", "whoami"),
            {"PATH": "/usr/bin"},
            execv=unavailable_execv,
        )
    except XReadError as error:
        assert str(error) == "Workspace credential boundary is unavailable"
    else:
        raise AssertionError("unavailable Workspace boundary was accepted")

    def timeout_run(command: tuple[str, ...], **options: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(command, 120, output=environment["X_AUTH_TOKEN"])

    try:
        run_bird(("whoami",), environment, run=timeout_run)
    except XReadError as error:
        assert str(error) == "Bird read provider is unavailable"
    else:
        raise AssertionError("unavailable Bird provider was accepted")
    print("x-read credential boundary self-test: PASS (successful, missing, denied, stale, unavailable)")


def main() -> int:
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        return 0
    try:
        ensure_workspace_delivery(sys.argv, os.environ)
        completed = run_bird(sys.argv[1:], os.environ)
    except XReadError as error:
        print(f"x-read unavailable: {error}", file=sys.stderr)
        return 2
    sys.stdout.write(completed.stdout)
    sys.stderr.write(completed.stderr)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
