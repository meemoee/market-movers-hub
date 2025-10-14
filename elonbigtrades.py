#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
elonbigtrades.py

Find markets by event slug via **Gamma**, then watch **Data-API /trades**
for those conditionIds. Print alerts for large, extreme-price trades and
(optionally) "paper-copy" the trade. Default behavior is to **NOT copy SELLs**.

Usage:
  python elonbigtrades.py <event-slug>
  python elonbigtrades.py elon-musk-of-tweets-october-10-october-17 --bootstrap-skip
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

import requests

# --------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------
GAMMA_BASE = "https://gamma-api.polymarket.com"
DATA_API_BASE = "https://data-api.polymarket.com"

PAGE_LIMIT = 500
DEFAULT_POLL_INTERVAL = 5.0

DEFAULT_NOTIONAL_THRESHOLD = 100.0
DEFAULT_PRICE_LOW = 0.10
DEFAULT_PRICE_HIGH = 0.90

DEFAULT_BATCH_SIZE = 40       # conditionIds per trades request
DEFAULT_DATAAPI_LIMIT = 1000  # rows per request
DEFAULT_SEEN_TX_WINDOW = 2000

log = logging.getLogger("polybig_copytrade_single_event")
SESSION = requests.Session()


# --------------------------------------------------------------------
# Utilities
# --------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_float(x: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        return float(x)
    except Exception:
        return default


def parse_epoch_seconds_maybe_ms(x: Any) -> Optional[int]:
    if x is None:
        return None
    try:
        if isinstance(x, (int, float)):
            v = float(x)
            if v > 1e12:
                v /= 1e9
            elif v > 1e10:
                v /= 1e3
            return int(v)
    except Exception:
        pass
    if isinstance(x, str):
        s = x.strip()
        if not s:
            return None
        try:
            v = float(s)
            if v > 1e12:
                v /= 1e9
            elif v > 1e10:
                v /= 1e3
            return int(v)
        except Exception:
            pass
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return int(dt.timestamp())
        except Exception:
            return None
    return None


def chunked(iterable: Iterable[Any], size: int) -> Iterable[List[Any]]:
    batch: List[Any] = []
    for item in iterable:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


# --------------------------------------------------------------------
# HTTP helpers
# --------------------------------------------------------------------
def _sleep_backoff(attempt: int, base_ms: int = 250) -> None:
    delay_s = min(6.0, (base_ms * (2 ** attempt)) / 1000.0)
    time.sleep(delay_s)


def http_get_json(url: str, params: Optional[Dict[str, Any]] = None, retries: int = 5, timeout: int = 20) -> Any:
    last = None
    for i in range(retries):
        try:
            r = SESSION.get(url, params=params, timeout=timeout)
            if r.status_code == 429:
                ra = safe_float(r.headers.get("Retry-After"), 0.6) or 0.6
                time.sleep(ra)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last = e
            if i < retries - 1:
                _sleep_backoff(i)
            else:
                raise
    raise last


# --------------------------------------------------------------------
# Gamma discovery (event -> markets)
# --------------------------------------------------------------------
def _normalize_outcomes(m: Dict[str, Any]) -> Optional[List[str]]:
    for k in ("outcomes", "outcomeNames", "labels", "choices"):
        if isinstance(m.get(k), list):
            return [str(x) for x in m[k]]
    return None


def _normalize_market(m: Dict[str, Any], event_slug: str) -> Dict[str, Any]:
    cond = m.get("conditionId") or m.get("condition_id") or m.get("id")
    slug = m.get("slug") or m.get("marketSlug")
    q = m.get("question") or m.get("title") or ""
    url = f"https://polymarket.com/event/{event_slug}/{slug}" if slug else None
    return {
        "conditionId": cond,
        "slug": slug,
        "question": q,
        "url": url,
        "_outcomes": _normalize_outcomes(m),
        "_event_slug": event_slug,
    }


def fetch_event_markets(event_slug: str) -> List[Dict[str, Any]]:
    """
    1) Try Gamma /events to find the event (embedded markets).
    2) Fallback: page Gamma /markets and filter by event slug.
    """
    # Step 1: /events
    offset = 0
    found = None
    while True:
        evs = http_get_json(f"{GAMMA_BASE}/events", {"limit": PAGE_LIMIT, "offset": offset, "active": "true", "closed": "false"})
        if not isinstance(evs, list) or not evs:
            break
        for ev in evs:
            if ev.get("slug") == event_slug:
                found = ev
                break
        if found or len(evs) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT

    markets: List[Dict[str, Any]] = []
    if isinstance(found, dict) and isinstance(found.get("markets"), list):
        for m in found["markets"]:
            nm = _normalize_market(m, event_slug)
            if nm.get("conditionId"):
                markets.append(nm)

    # Step 2: /markets fallback or supplement
    if not markets:
        offset = 0
        scanned = 0
        while True:
            mkts = http_get_json(f"{GAMMA_BASE}/markets", {"limit": PAGE_LIMIT, "offset": offset,
                                                           "active": "true", "closed": "false", "archived": "false"})
            if not isinstance(mkts, list) or not mkts:
                break
            for m in mkts:
                scanned += 1
                ev = m.get("events")
                ev_slug = ev.get("slug") if isinstance(ev, dict) else (m.get("event_slug") or m.get("eventSlug"))
                if ev_slug == event_slug:
                    nm = _normalize_market(m, event_slug)
                    if nm.get("conditionId"):
                        markets.append(nm)
            if len(mkts) < PAGE_LIMIT:
                break
            offset += PAGE_LIMIT
        log.info("[discovery] gamma /markets scanned=%d matched=%d event=%s", scanned, len(markets), event_slug)

    if not markets:
        log.error("No markets found for event=%r (Gamma discovery)", event_slug)

    # Preview (like your logs)
    shown = 0
    for m in markets:
        log.info("[watch] %s | slug=%s | cond=%s | outcomes=%s | url=%s",
                 (m.get("question") or "")[:100],
                 m.get("slug"), m.get("conditionId"), m.get("_outcomes"), m.get("url"))
        shown += 1
        if shown >= 26 and len(markets) > shown:
            log.info("[watch] ... and %d more", len(markets) - shown)
            break
    return markets


# --------------------------------------------------------------------
# Data-API /trades polling
# --------------------------------------------------------------------
def normalize_trade_row(tr: Dict[str, Any]) -> Dict[str, Any]:
    ts = parse_epoch_seconds_maybe_ms(tr.get("timestamp"))
    iso = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts is not None else None
    price = safe_float(tr.get("price"))
    size = safe_float(tr.get("size"))
    notional = price * size if price is not None and size is not None else None
    side = (tr.get("side") or "").upper()
    out_idx = tr.get("outcomeIndex")
    try:
        out_idx = int(out_idx) if out_idx is not None else None
    except Exception:
        out_idx = None
    return {
        "ts": float(ts) if ts is not None else None,
        "iso": iso,
        "price": price,
        "qty": size,
        "notional": notional,
        "side": side,
        "taker": tr.get("proxyWallet"),
        "tx": tr.get("transactionHash"),
        "slug": tr.get("slug"),
        "eventSlug": tr.get("eventSlug"),
        "conditionId": tr.get("conditionId"),
        "outcome": tr.get("outcome"),
        "outcomeIndex": out_idx,
        "raw": tr,
    }


def dataapi_trades_for_conditions(
    condition_ids: List[str],
    limit: int,
    offset: int,
    min_cash_filter: Optional[float],
    taker_only: bool,
    no_server_filter: bool,
) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {
        "market": ",".join(condition_ids),
        "limit": limit,
        "offset": offset,
    }
    if not no_server_filter and min_cash_filter is not None and min_cash_filter >= 0:
        params["filterType"] = "CASH"
        params["filterAmount"] = min_cash_filter
        if taker_only:
            params["takerOnly"] = "true"

    rows = http_get_json(f"{DATA_API_BASE}/trades", params=params)
    out: List[Dict[str, Any]] = []
    if isinstance(rows, list):
        for tr in rows:
            if isinstance(tr, dict):
                out.append(normalize_trade_row(tr))
    return out


# --------------------------------------------------------------------
# Copy-trade (paper) + alert printing
# --------------------------------------------------------------------
def print_alert(market: Dict[str, Any], tr: Dict[str, Any], outcome_label: Optional[str]) -> Dict[str, Any]:
    side = tr.get("side") or "?"
    pr = tr.get("price")
    nn = tr.get("notional")
    # PRECOMPUTE display strings (fixes the f-string format-spec error)
    pr_s = f"{pr:.4f}" if isinstance(pr, (int, float)) else "?.????"
    nn_s = f"{nn:.2f}"  if isinstance(nn, (int, float)) else "?.??"
    ol = outcome_label if outcome_label is not None else (f"outcome[{tr.get('outcomeIndex')}]" if tr.get("outcomeIndex") is not None else "?")
    print("=" * 88)
    print(f"[ALERT] {side} {ol} @ ${pr_s} (n=${nn_s})")
    payload = {
        "time": now_iso(),
        "event_slug": market.get("_event_slug"),
        "market_question": market.get("question"),
        "market_slug": market.get("slug"),
        "market_url": market.get("url"),
        "conditionId": market.get("conditionId"),
        "trade": {
            "iso": tr.get("iso"),
            "price": tr.get("price"),
            "qty": tr.get("qty"),
            "notional": tr.get("notional"),
            "side": tr.get("side"),
            "outcome": outcome_label,
            "outcomeIndex": tr.get("outcomeIndex"),
            "taker": tr.get("taker"),
            "tx": tr.get("tx"),
        },
    }
    print(json.dumps(payload, indent=2))
    print("=" * 88)
    return payload


def paper_copy_trade(copy_sells: bool, tr: Dict[str, Any]) -> None:
    """
    Simulate copying the trade. Default skips SELLs unless --copy-sells is set.
    """
    side = (tr.get("side") or "").upper()
    if side == "SELL" and not copy_sells:
        return
    price = tr.get("price") or 0.0
    qty = tr.get("qty") or 0.0
    notional = price * qty
    print(f"[PAPER] copy-trade side={side} price={price} qty={qty} notional=${notional:.2f}")


# --------------------------------------------------------------------
# Main monitor loop
# --------------------------------------------------------------------
def monitor_event(
    event_slug: str,
    poll_interval: float,
    notional_threshold: float,
    price_low: float,
    price_high: float,
    batch_size: int,
    dataapi_limit: int,
    bootstrap_skip: bool,
    bootstrap_warm: Optional[int],
    seen_tx_window: int,
    no_server_filter: bool,
    taker_only: bool,
    paper_copy: bool,
    copy_sells: bool,
) -> None:
    markets = fetch_event_markets(event_slug)
    if not markets:
        log.error("No markets selected; nothing to monitor.")
        return

    condid_to_market: Dict[str, Dict[str, Any]] = {}
    for m in markets:
        cid = m.get("conditionId")
        if isinstance(cid, str) and cid.startswith("0x"):
            condid_to_market[cid] = m

    if not condid_to_market:
        log.error("No conditionIds present; nothing to monitor.")
        return

    # Bootstrap timestamps
    now_ts = datetime.now(timezone.utc).timestamp()
    initial_ts: Optional[float] = None
    if bootstrap_skip:
        initial_ts = now_ts
        log.info("[bootstrap] skip enabled: last_seen_ts initialized to now (%.0f)", initial_ts)
    elif bootstrap_warm and bootstrap_warm > 0:
        initial_ts = now_ts - float(bootstrap_warm)
        log.info("[bootstrap] warm window: last_seen_ts = now-%ds (%.0f)", bootstrap_warm, initial_ts)

    last_seen_ts: Dict[str, Optional[float]] = {cid: initial_ts for cid in condid_to_market.keys()}
    seen_tx_deques: Dict[str, deque] = {cid: deque(maxlen=seen_tx_window) for cid in condid_to_market.keys()}
    seen_tx_sets: Dict[str, set] = {cid: set() for cid in condid_to_market.keys()}

    log.info("[monitor] starting for event=%s markets=%d poll=%.2fs notional>=%.2f extremes: <=%.2f or >=%.2f",
             event_slug, len(condid_to_market), poll_interval, notional_threshold, price_low, price_high)

    try:
        while True:
            cycle_rows = 0
            cycle_alerts = 0
            t0 = time.time()

            for batch in chunked(list(condid_to_market.keys()), batch_size):
                rows = dataapi_trades_for_conditions(
                    batch,
                    limit=dataapi_limit,
                    offset=0,
                    min_cash_filter=notional_threshold,
                    taker_only=taker_only,
                    no_server_filter=no_server_filter,
                )
                cycle_rows += len(rows)

                # Data-API returns newest-first — process oldest-first
                for tr in reversed(rows):
                    cid = tr.get("conditionId")
                    if cid not in last_seen_ts:
                        last_seen_ts[cid] = initial_ts

                    ts = tr.get("ts") or 0.0

                    # new-only gate
                    if last_seen_ts.get(cid) is not None and ts <= (last_seen_ts[cid] or 0.0):
                        continue

                    # de-dup per condition by tx
                    txh = tr.get("tx")
                    if isinstance(txh, str) and txh:
                        if txh in seen_tx_sets[cid]:
                            if ts > (last_seen_ts.get(cid) or 0.0):
                                last_seen_ts[cid] = ts
                            continue
                        seen_tx_deques[cid].append(txh)
                        seen_tx_sets[cid].add(txh)
                        if len(seen_tx_deques[cid]) == seen_tx_deques[cid].maxlen:
                            seen_tx_sets[cid] = set(seen_tx_deques[cid])

                    price = tr.get("price")
                    notional = tr.get("notional")

                    qualifies = (
                        (notional is not None and notional >= notional_threshold) and
                        (price is not None and (price <= price_low or price >= price_high))
                    )

                    # Outcome label via market outcomes if needed
                    market = condid_to_market.get(cid, {})
                    outcome_label = tr.get("outcome")
                    out_idx = tr.get("outcomeIndex")
                    outs = market.get("_outcomes")
                    if outcome_label is None and isinstance(out_idx, int) and isinstance(outs, list) and 0 <= out_idx < len(outs):
                        outcome_label = outs[out_idx]

                    if qualifies:
                        print_alert(market, tr, outcome_label)
                        cycle_alerts += 1
                        if paper_copy:
                            paper_copy_trade(copy_sells=copy_sells, tr=tr)

                    # advance last seen
                    if ts > (last_seen_ts.get(cid) or 0.0):
                        last_seen_ts[cid] = ts

            dur = time.time() - t0
            log.info("[cycle] rows=%d alerts=%d duration=%.2fs", cycle_rows, cycle_alerts, dur)
            time.sleep(max(0.0, poll_interval - dur))
    except KeyboardInterrupt:
        log.info("[monitor] stopped by user.")


# --------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------
def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Gamma-discovered, Data-API-tracked Polymarket trade watcher (single event).")
    ap.add_argument("event_slug", type=str, help="Polymarket event slug (e.g., elon-musk-of-tweets-october-10-october-17)")

    ap.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL, help="Polling interval seconds.")
    ap.add_argument("--notional-threshold", type=float, default=DEFAULT_NOTIONAL_THRESHOLD, help="Min notional (USD) to alert.")
    ap.add_argument("--price-low", type=float, default=DEFAULT_PRICE_LOW, help="Extreme low price inclusive.")
    ap.add_argument("--price-high", type=float, default=DEFAULT_PRICE_HIGH, help="Extreme high price inclusive.")

    ap.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="ConditionIds per Data-API request.")
    ap.add_argument("--dataapi-limit", type=int, default=DEFAULT_DATAAPI_LIMIT, help="Rows per Data-API request (1..10000).")

    ap.add_argument("--bootstrap-skip", action="store_true", help="Start from NOW (ignore history on first loop).")
    ap.add_argument("--bootstrap-warm", type=int, default=None, help="Start from now-N seconds (only backfill recent N).")

    ap.add_argument("--seen-tx-window", type=int, default=DEFAULT_SEEN_TX_WINDOW, help="Per-condition tx de-dup window.")
    ap.add_argument("--no-server-filter", action="store_true", help="Fetch all trades; filter client-side.")
    ap.add_argument("--no-taker-only", action="store_true", help="Do NOT set takerOnly=true on server.")

    ap.add_argument("--paper-copy", action="store_true", help="Paper-copy qualifying prints.")
    ap.add_argument("--copy-sells", action="store_true", help="Also copy SELLs (default is BUYs only).")

    ap.add_argument("--debug", action="store_true", help="Verbose logs.")

    args = ap.parse_args(argv)

    level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    monitor_event(
        event_slug=args.event_slug,
        poll_interval=args.poll_interval,
        notional_threshold=args.notional_threshold,
        price_low=args.price_low,
        price_high=args.price_high,
        batch_size=max(1, args.batch_size),
        dataapi_limit=max(1, min(args.dataapi_limit, 10000)),
        bootstrap_skip=bool(args.bootstrap_skip),
        bootstrap_warm=args.bootstrap_warm,
        seen_tx_window=max(10, args.seen_tx_window),
        no_server_filter=bool(args.no_server_filter),
        taker_only=not bool(args.no_taker_only),
        paper_copy=bool(args.paper_copy),
        copy_sells=bool(args.copy_sells),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
