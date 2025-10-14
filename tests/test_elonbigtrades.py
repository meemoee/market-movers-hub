import logging
import sys
import types
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "requests" not in sys.modules:
    requests_stub = types.ModuleType("requests")

    class _DummySession:
        def get(self, *args, **kwargs):
            raise RuntimeError("network access is disabled during tests")

    requests_stub.Session = _DummySession
    sys.modules["requests"] = requests_stub

import elonbigtrades as mod


def test_monitor_event_generates_alerts_for_two_minutes(monkeypatch, capsys, caplog):
    """Ensure the monitor emits alerts and cycle logs for at least two minutes."""

    markets = [{
        "conditionId": "0xabc123",
        "slug": "test-market",
        "question": "Will the test emit alerts?",
        "url": "https://example.com",
        "_outcomes": ["Yes", "No"],
        "_event_slug": "test-event",
    }]

    monkeypatch.setattr(mod, "fetch_event_markets", lambda event_slug: markets)

    start = time.time()
    trade_counter = {"count": 0}

    def fake_dataapi(condition_ids, limit, offset, min_cash_filter, taker_only, no_server_filter):
        now = time.time()
        if now - start >= 122:
            raise KeyboardInterrupt()

        trade_counter["count"] += 1
        ts = now + 1.0
        iso = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        tx_hash = f"0x{trade_counter['count']:064x}"
        return [{
            "ts": ts,
            "iso": iso,
            "price": 0.95,
            "qty": 200.0,
            "notional": 190.0,
            "side": "BUY",
            "taker": "0xtest",
            "tx": tx_hash,
            "slug": "test-market",
            "eventSlug": "test-event",
            "conditionId": "0xabc123",
            "outcome": "Yes",
            "outcomeIndex": 0,
            "raw": {},
        }]

    monkeypatch.setattr(mod, "dataapi_trades_for_conditions", fake_dataapi)

    with caplog.at_level(logging.INFO, logger=mod.log.name):
        mod.monitor_event(
            event_slug="test-event",
            poll_interval=1.0,
            notional_threshold=100.0,
            price_low=0.05,
            price_high=0.90,
            batch_size=1,
            dataapi_limit=10,
            bootstrap_skip=False,
            bootstrap_warm=None,
            seen_tx_window=20,
            no_server_filter=False,
            taker_only=True,
            paper_copy=False,
            copy_sells=False,
        )

    duration = time.time() - start
    assert duration >= 120, "monitor_event must run for at least two minutes"

    cycle_logs = [rec for rec in caplog.records if "[cycle]" in rec.message]
    assert cycle_logs, "expected cycle logs to be produced"
    assert cycle_logs[-1].created - cycle_logs[0].created >= 120

    captured = capsys.readouterr().out
    assert captured.count("[ALERT]") >= 2, "expected multiple alert prints during monitoring"

