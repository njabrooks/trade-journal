"""Shared adapter mechanics for requested IBKR option-contract quotes.

Radon remains the Capability Authority. This module only keeps Trade Journal's
retained consumer boundary explicit: contract qualification is separate from
gateway lifecycle control and quote presentation, and unavailable inputs have
a deterministic representation.
"""

from math import isfinite


BATCH_QUOTE_CLIENT_ID = 32
INTERACTIVE_QUOTE_CLIENT_ID = 33


def positive_number(value):
    """Return a finite positive number, otherwise ``None``."""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    return value if isfinite(value) and value > 0 else None


def unavailable_quote_row(request, reason):
    """Return the machine-readable unavailable result for one requested contract."""
    return {
        **request,
        "status": "unavailable",
        "reason": reason,
        "bid": None,
        "ask": None,
        "last": None,
        "mid": None,
        "iv": None,
        "delta": None,
        "marketDataType": None,
    }


def qualify_requested_option(ib, request, option_factory):
    """Resolve exactly one requested option contract through the Radon-owned IB session."""
    option = option_factory(
        request["ticker"],
        request["expiry"],
        float(request["strike"]),
        request["right"],
        "SMART",
        currency="USD",
    )
    try:
        qualified = ib.qualifyContracts(option)
    except Exception:
        return None, "contract-qualification-unavailable"
    if not qualified or not getattr(qualified[0], "conId", 0):
        return None, "contract-qualification-unavailable"
    return qualified[0], None
