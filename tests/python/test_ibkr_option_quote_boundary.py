import importlib.util
import io
import json
import sys
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))


def load_script(filename: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeOption:
    def __init__(self, symbol, expiry, strike, right, exchange, currency="USD"):
        self.symbol = symbol
        self.lastTradeDateOrContractMonth = expiry
        self.strike = strike
        self.right = right
        self.exchange = exchange
        self.currency = currency
        self.conId = 0


class GatewayUnavailableIB:
    def __init__(self):
        self.connect_calls = []

    def connect(self, host, port, clientId, timeout=20):
        self.connect_calls.append((host, port, clientId, timeout))
        raise OSError("gateway unavailable")


class NoMarketDataTicker:
    bid = None
    ask = None
    last = None
    modelGreeks = None
    marketDataType = 1


class NoMarketDataIB:
    def __init__(self):
        self.connect_calls = []
        self.disconnected = False

    def connect(self, host, port, clientId, timeout=20):
        self.connect_calls.append((host, port, clientId, timeout))

    def managedAccounts(self):
        return ["test-account"]

    def reqMarketDataType(self, _data_type):
        return None

    def qualifyContracts(self, option):
        option.conId = 123
        return [option]

    def reqMktData(self, option, _ticks, _snapshot, _regulatory_snapshot):
        ticker = NoMarketDataTicker()
        ticker.contract = option
        return ticker

    def sleep(self, _seconds):
        return None

    def cancelMktData(self, _option):
        return None

    def disconnect(self):
        self.disconnected = True


class MarketDataRequestUnavailableIB(NoMarketDataIB):
    def reqMktData(self, _option, _ticks, _snapshot, _regulatory_snapshot):
        raise RuntimeError("market data request unavailable")


class MarketDataTypeUnavailableIB(NoMarketDataIB):
    def reqMarketDataType(self, _data_type):
        raise RuntimeError("market data type unavailable")


class MarketDataWaitUnavailableIB(NoMarketDataIB):
    def sleep(self, _seconds):
        raise RuntimeError("market data wait unavailable")


class ManagedAccountsUnavailableIB(NoMarketDataIB):
    def managedAccounts(self):
        raise RuntimeError("session unavailable")


class QuoteReadUnavailableTicker(NoMarketDataTicker):
    @property
    def bid(self):
        raise RuntimeError("quote read unavailable")


class QuoteReadUnavailableIB(NoMarketDataIB):
    def reqMktData(self, option, _ticks, _snapshot, _regulatory_snapshot):
        ticker = QuoteReadUnavailableTicker()
        ticker.contract = option
        return ticker


REQUESTS = [
    {"ticker": "IBIT", "expiry": "20260821", "strike": 49, "right": "C"}
]


class IbkrOptionQuoteBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch = load_script("ibkr-quote-contracts.py", "ibkr_quote_contracts")
        cls.human = load_script("ibkr-option-quote.py", "ibkr_option_quote")

    def test_machine_quote_reports_missing_gateway_as_structured_unavailable(self):
        fake = GatewayUnavailableIB()
        rows, exit_code = self.batch.quote_contracts(
            REQUESTS,
            ib_factory=lambda: fake,
            option_factory=FakeOption,
        )

        self.assertEqual(exit_code, 2)
        self.assertEqual(
            rows,
            [
                {
                    **REQUESTS[0],
                    "status": "unavailable",
                    "reason": "gateway-unavailable",
                    "bid": None,
                    "ask": None,
                    "last": None,
                    "mid": None,
                    "iv": None,
                    "delta": None,
                    "marketDataType": None,
                }
            ],
        )
        self.assertEqual(fake.connect_calls[0][2], 32)

    def test_machine_quote_reports_missing_market_data_as_unavailable(self):
        fake = NoMarketDataIB()
        rows, exit_code = self.batch.quote_contracts(
            REQUESTS,
            ib_factory=lambda: fake,
            option_factory=FakeOption,
        )

        self.assertEqual(exit_code, 2)
        self.assertEqual(rows[0]["status"], "unavailable")
        self.assertEqual(rows[0]["reason"], "market-data-unavailable")
        self.assertIsNone(rows[0]["bid"])
        self.assertIsNone(rows[0]["ask"])
        self.assertTrue(fake.disconnected)

    def test_machine_quote_translates_market_data_request_failure_to_unavailable(self):
        fake = MarketDataRequestUnavailableIB()
        rows, exit_code = self.batch.quote_contracts(
            REQUESTS,
            ib_factory=lambda: fake,
            option_factory=FakeOption,
        )

        self.assertEqual(exit_code, 2)
        self.assertEqual(rows[0]["status"], "unavailable")
        self.assertEqual(rows[0]["reason"], "market-data-unavailable")
        self.assertTrue(fake.disconnected)

    def test_machine_quote_translates_market_data_type_failure_to_unavailable(self):
        fake = MarketDataTypeUnavailableIB()
        rows, exit_code = self.batch.quote_contracts(
            REQUESTS,
            ib_factory=lambda: fake,
            option_factory=FakeOption,
        )

        self.assertEqual(exit_code, 2)
        self.assertEqual(rows[0]["status"], "unavailable")
        self.assertEqual(rows[0]["reason"], "market-data-unavailable")
        self.assertTrue(fake.disconnected)

    def test_interactive_quote_uses_assigned_client_range_and_declares_gateway_unavailable(self):
        fake = GatewayUnavailableIB()
        connected, reason = self.human.connect_quote_gateway(fake)

        self.assertFalse(connected)
        self.assertEqual(reason, "gateway-unavailable")
        self.assertEqual([call[2] for call in fake.connect_calls], [33, 33])

    def run_interactive_main(self, fake):
        ib_insync = types.SimpleNamespace(IB=lambda: fake, Option=FakeOption)
        output = io.StringIO()
        with (
            patch.dict(sys.modules, {"ib_insync": ib_insync}),
            patch.object(sys, "argv", ["ibkr-option-quote.py", "IBIT", "BUY 49C 20260821"]),
            redirect_stdout(output),
        ):
            exit_code = self.human.main()
        return exit_code, output.getvalue()

    def test_interactive_quote_translates_market_data_type_failure_to_unavailable(self):
        fake = MarketDataTypeUnavailableIB()
        exit_code, output = self.run_interactive_main(fake)

        self.assertEqual(exit_code, 2)
        self.assertIn("UNAVAILABLE: market-data-unavailable-or-contract-unqualified", output)
        self.assertTrue(fake.disconnected)

    def test_interactive_quote_translates_market_data_wait_failure_to_unavailable(self):
        fake = MarketDataWaitUnavailableIB()
        exit_code, output = self.run_interactive_main(fake)

        self.assertEqual(exit_code, 2)
        self.assertIn("UNAVAILABLE: market-data-unavailable-or-contract-unqualified", output)
        self.assertTrue(fake.disconnected)

    def test_interactive_quote_translates_session_read_failure_to_unavailable(self):
        fake = ManagedAccountsUnavailableIB()
        exit_code, output = self.run_interactive_main(fake)

        self.assertEqual(exit_code, 2)
        self.assertIn("UNAVAILABLE: market-data-unavailable-or-contract-unqualified", output)
        self.assertTrue(fake.disconnected)

    def test_interactive_quote_always_cleans_up_after_quote_read_failure(self):
        fake = QuoteReadUnavailableIB()
        exit_code, output = self.run_interactive_main(fake)

        self.assertEqual(exit_code, 2)
        self.assertIn("UNAVAILABLE: market-data-unavailable-or-contract-unqualified", output)
        self.assertTrue(fake.disconnected)

    def test_machine_process_output_remains_json_serializable(self):
        fake = GatewayUnavailableIB()
        rows, _ = self.batch.quote_contracts(
            REQUESTS,
            ib_factory=lambda: fake,
            option_factory=FakeOption,
        )
        self.assertEqual(json.loads(json.dumps(rows)), rows)


if __name__ == "__main__":
    unittest.main()
