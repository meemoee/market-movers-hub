#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
newwallettrades_all_markets.py  —  FULL FILE

Global Polymarket trade monitor focused on young wallets and 24–48h accumulation.

THIS VERSION FIXES "wallet first seen = None" STICKINESS

What changed (while retaining all prior functionality & styling):
- We now **merge the live wallet-age cache into the UI snapshot** so rows/facets no longer
  stay None if we learned a wallet's first-seen later.
- Added a **cache snapshot** method and a **store backfill sweeper** that updates historical
  rows in-place when an age becomes known.
- Kept the **priority lookup** and **larger lookup budget** (slider) so we learn ages faster.
- Added structured logs for the sweeper: `age_backfill_sweep` with counts and timings.

You’ll still see some ⚪ during the first seconds/minutes of a surge,
but they should **resolve quickly** as the cache fills and the sweeper patches rows.

Logs you’ll see (unchanged + new):
- trades_ok: rows, first_ts, last_ts
- cycle_heartbeat: fetched_rows, new_after_dedupe, appended, dropped_not_young,
  unknown_age_allowed, activity_lookups, lookups_budget_left, dedupe_size,
  first_ts, last_ts, max_ts_delta, no_progress_cycles, accum_window_sec,
  accum_unique_wallets, accum_unique_keys
- accum_heartbeat: window_sec, unique_wallets, unique_wallet_outcome_pairs,
  above_threshold, threshold
- age_backfill_sweep (NEW): scanned, patched_rows, took_ms
"""

from __future__ import annotations

import threading
import time
import json
import traceback
import inspect
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from collections import deque, defaultdict

import requests
import pandas as pd
import plotly.express as px
import streamlit as st

# ──────────────────────────────────────────────────────────────────────
# Constants / Endpoints
# ──────────────────────────────────────────────────────────────────────

GAMMA_BASE = "https://gamma-api.polymarket.com"
DATA_API_BASE = "https://data-api.polymarket.com"

DEFAULT_UI_REFRESH_MS = 2500
DEFAULT_FETCH_INTERVAL_S = 2.5
DEFAULT_DATAAPI_LIMIT = 800
DEFAULT_TAKER_ONLY = True

DEFAULT_MAX_AGE_DAYS = 7
DEFAULT_WALLET_TTL_SEC = 6 * 3600
DEFAULT_HISTORY_MAX_ROWS = 20000

DEFAULT_SEEN_TX_MAX = 50000
DEFAULT_MAX_LOOKUPS_PER_CYCLE = 60
NO_PROGRESS_WARN_CYCLES = 6

DEFAULT_ACCUM_WINDOW_SEC = 24 * 3600
DEFAULT_ACCUM_THRESHOLD = 1000.0  # USD notional per (wallet×outcome×slug) over window

LOG_PREFIX = "[polyyoung-ui]"

# ──────────────────────────────────────────────────────────────────────
# Small utils / logging
# ──────────────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def ts_to_iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return None

def parse_epoch_seconds_maybe_ms(x: Any) -> Optional[int]:
    if x is None:
        return None
    try:
        if isinstance(x, (int, float)):
            val = float(x)
            if val > 1e12: val /= 1e9
            elif val > 1e10: val /= 1e3
            return int(val)
    except Exception:
        pass
    if isinstance(x, str):
        s = x.strip()
        if not s:
            return None
        try:
            val = float(s)
            if val > 1e12: val /= 1e9
            elif val > 1e10: val /= 1e3
            return int(val)
        except Exception:
            pass
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return int(dt.timestamp())
        except Exception:
            return None
    return None

def safe_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None

def log_json(level: str, msg: str, **fields: Any) -> None:
    rec = {"t": now_utc().isoformat(), "lvl": level, "msg": msg}
    rec.update(fields)
    print(f"{LOG_PREFIX} {json.dumps(rec, ensure_ascii=False)}", flush=True)


def short_wallet(addr: Optional[str]) -> str:
    if not isinstance(addr, str) or not addr:
        return "—"
    addr = addr.strip()
    if len(addr) <= 12:
        return addr
    return f"{addr[:6]}…{addr[-4:]}"


def handle_feed_selection() -> None:
    selection = st.session_state.get("live_feed_table")
    if not selection:
        return
    rows = selection.get("selection", {}).get("rows") if isinstance(selection, dict) else None
    if not rows:
        return
    row_idx = rows[0]
    lookup = st.session_state.get("feed_slug_lookup")
    if not isinstance(lookup, list) or row_idx is None:
        return
    if 0 <= row_idx < len(lookup):
        slug = lookup[row_idx]
        if isinstance(slug, float) and math.isnan(slug):
            slug = None
        placeholder = st.session_state.get("chart_slug_placeholder")
        if placeholder is None:
            placeholder = "— Select a market for the chart —"
        st.session_state["chart_slug_select"] = slug or placeholder

# ──────────────────────────────────────────────────────────────────────
# HTTP helpers (timed)
# ──────────────────────────────────────────────────────────────────────

def http_get_json(url: str, params: Optional[Dict[str, Any]] = None,
                  timeout: int = 30, retries: int = 4,
                  tag: str = "generic") -> Any:
    last_err = None
    for i in range(retries):
        t0 = time.time()
        try:
            r = requests.get(url, params=params, timeout=timeout)
            ms = int((time.time() - t0) * 1000)
            if r.status_code == 429:
                log_json("WARN", f"{tag} 429", url=url, params=params, ms=ms)
                time.sleep(min(10.0, 1.0 + i * 1.5))
                continue
            r.raise_for_status()
            data = r.json()
            if tag == "trades":
                rows = len(data) if isinstance(data, list) else 0
                first_ts = parse_epoch_seconds_maybe_ms(data[0].get("timestamp")) if rows else None
                last_ts  = parse_epoch_seconds_maybe_ms(data[-1].get("timestamp")) if rows else None
                log_json("INFO", "trades_ok", url=r.url, ms=ms, rows=rows, first_ts=first_ts, last_ts=last_ts)
            else:
                log_json("DEBUG", f"{tag}_ok", url=r.url, ms=ms)
            return data
        except Exception as e:
            ms = int((time.time() - t0) * 1000)
            last_err = repr(e)
            log_json("WARN", f"{tag}_retry", attempt=i+1, retries=retries, url=url, params=params, ms=ms, err=last_err)
            if i < retries - 1:
                time.sleep(min(6.0, 0.5 * (2 ** i)))
                continue
            break
    raise RuntimeError(f"GET {url} failed after {retries} attempts: {last_err}")

# ──────────────────────────────────────────────────────────────────────
# API wrappers
# ──────────────────────────────────────────────────────────────────────

def fetch_global_trades(limit: int, taker_only: bool = True, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Fetch recent trades across ALL markets from data-api.
    """
    params: Dict[str, Any] = {"limit": limit, "offset": offset}
    if taker_only:
        params["takerOnly"] = "true"
    data = http_get_json(f"{DATA_API_BASE}/trades", params=params, timeout=20, retries=2, tag="trades")
    out: List[Dict[str, Any]] = []
    if isinstance(data, list):
        for tr in data:
            if isinstance(tr, dict):
                out.append(tr)
    return out

def fetch_earliest_activity_ts_quick(proxy_wallet: str, timeout: float = 3.8, verbose: bool = False) -> Optional[int]:
    """
    Fast path to get earliest activity timestamp for a wallet.
    Adds micro-retries to handle transient slowness/429s.
    Returns epoch seconds or None.
    """
    tries = 3  # 1 + 2 retries
    last_err = None
    for attempt in range(1, tries + 1):
        t0 = time.time()
        try:
            params = {"user": proxy_wallet, "limit": 1, "sortBy": "TIMESTAMP", "sortDirection": "ASC"}
            r = requests.get(f"{DATA_API_BASE}/activity", params=params, timeout=timeout)
            ms = int((time.time() - t0) * 1000)

            if r.status_code == 429:
                if verbose: log_json("DEBUG", "activity_429", wallet=proxy_wallet, ms=ms, attempt=attempt)
                time.sleep(0.15 * attempt)
                continue

            if r.status_code != 200:
                if verbose: log_json("DEBUG", "activity_nok", wallet=proxy_wallet, status=r.status_code, ms=ms, attempt=attempt)
                if attempt < tries: time.sleep(0.1 * attempt)
                continue

            data = r.json()
            ts = parse_epoch_seconds_maybe_ms(data[0].get("timestamp")) if (isinstance(data, list) and data) else None
            if verbose: log_json("DEBUG", "activity_ok", wallet=proxy_wallet, ms=ms, ts=ts, attempt=attempt)
            return ts

        except Exception as e:
            last_err = repr(e)
            if verbose: log_json("DEBUG", "activity_err", wallet=proxy_wallet, err=last_err, attempt=attempt)
            if attempt < tries:
                time.sleep(0.1 * attempt)
                continue

    if verbose and last_err:
        log_json("DEBUG", "activity_fail", wallet=proxy_wallet, err=last_err)
    return None

# ──────────────────────────────────────────────────────────────────────
# Normalization
# ──────────────────────────────────────────────────────────────────────

@dataclass
class Trade:
    ts: Optional[float]
    iso: Optional[str]
    side: Optional[str]
    price: Optional[float]
    size: Optional[float]
    notional: Optional[float]
    outcome: Optional[str]
    outcome_index: Optional[int]
    tx: Optional[str]
    taker: Optional[str]
    slug: Optional[str]
    event_slug: Optional[str]
    condition_id: Optional[str]
    raw: Dict[str, Any]

def normalize_trade(tr: Dict[str, Any]) -> Trade:
    ts = parse_epoch_seconds_maybe_ms(tr.get("timestamp"))
    iso = ts_to_iso(ts)
    price = safe_float(tr.get("price"))
    size = safe_float(tr.get("size"))
    notional = (price * size) if (price is not None and size is not None) else None
    side = (tr.get("side") or "").upper() if isinstance(tr.get("side"), str) else None
    out_idx = tr.get("outcomeIndex")
    try:
        out_idx = int(out_idx) if out_idx is not None else None
    except Exception:
        out_idx = None
    return Trade(
        ts=float(ts) if ts is not None else None,
        iso=iso,
        side=side,
        price=price,
        size=size,
        notional=notional,
        outcome=tr.get("outcome"),
        outcome_index=out_idx,
        tx=tr.get("transactionHash"),
        taker=tr.get("proxyWallet"),
        slug=tr.get("slug"),
        event_slug=tr.get("eventSlug"),
        condition_id=tr.get("conditionId"),
        raw=tr,
    )

# ──────────────────────────────────────────────────────────────────────
# Wallet age cache
# ──────────────────────────────────────────────────────────────────────

@dataclass
class WalletAgeRecord:
    earliest_ts: Optional[int]
    fetched_at: float

class WalletAgeCache:
    def __init__(self, ttl_seconds: int):
        self.ttl = int(ttl_seconds)
        self._map: Dict[str, WalletAgeRecord] = {}
        self._lock = threading.Lock()

    def get(self, addr: str) -> Optional[WalletAgeRecord]:
        key = addr.lower()
        with self._lock:
            rec = self._map.get(key)
            if not rec:
                return None
            if time.time() - rec.fetched_at > self.ttl:
                return None
            return rec

    def set(self, addr: str, earliest_ts: Optional[int]) -> WalletAgeRecord:
        key = addr.lower()
        rec = WalletAgeRecord(earliest_ts=earliest_ts, fetched_at=time.time())
        with self._lock:
            self._map[key] = rec
        return rec

    def snapshot(self) -> Dict[str, Optional[int]]:
        """
        NEW: returns a shallow copy of wallet->earliest_ts (ignores stale TTL here; snapshot of what's in cache).
        Useful to merge into UI snapshots and backfill store rows.
        """
        with self._lock:
            return {k: v.earliest_ts for k, v in self._map.items()}

# ──────────────────────────────────────────────────────────────────────
# Seen Ring (O(1) de-dup)
# ──────────────────────────────────────────────────────────────────────

class SeenRing:
    def __init__(self, maxlen: int):
        self.maxlen = int(maxlen)
        self._dq: deque[str] = deque(maxlen=self.maxlen)
        self._set: set[str] = set()
        self._lock = threading.Lock()

    def has(self, tx: str) -> bool:
        with self._lock:
            return tx in self._set

    def add(self, tx: str) -> None:
        with self._lock:
            if tx in self._set:
                return
            if len(self._dq) == self.maxlen:
                old = self._dq.popleft()
                self._set.discard(old)
            self._dq.append(tx)
            self._set.add(tx)

    def size(self) -> int:
        with self._lock:
            return len(self._set)

# ──────────────────────────────────────────────────────────────────────
# Live store + rolling accumulator
# ──────────────────────────────────────────────────────────────────────

class LiveStore:
    def __init__(self, history_max_rows: int = DEFAULT_HISTORY_MAX_ROWS, seen_max: int = DEFAULT_SEEN_TX_MAX):
        self._lock = threading.Lock()
        self.trades: List[Dict[str, Any]] = []
        self.history_max_rows = int(history_max_rows)
        self.seen = SeenRing(seen_max)

    def append_trade(self, rec: Dict[str, Any]) -> None:
        with self._lock:
            self.trades.append(rec)

    def get_snapshot_df(self) -> pd.DataFrame:
        with self._lock:
            if not self.trades:
                return pd.DataFrame(columns=[
                    "time","timestamp","side","outcome","price","size","notional",
                    "tx","taker","wallet_first_ts","wallet_first_iso","wallet_age_days",
                    "is_young","slug"
                ])
            return pd.DataFrame(self.trades)

    def trim_history(self) -> None:
        with self._lock:
            extra = len(self.trades) - self.history_max_rows
            if extra > 0:
                self.trades = self.trades[extra:]

    def backfill_wallet_ages(self, wallet_to_first_ts: Dict[str, Optional[int]], max_scan_rows: int = 8000) -> int:
        """
        NEW: Sweep the most recent N rows and fill missing wallet_first_ts/iso/age if cache has it.
        Returns number of rows patched.
        """
        t0 = time.time()
        patched = 0
        with self._lock:
            n = len(self.trades)
            if n == 0:
                return 0
            start = max(0, n - int(max_scan_rows))
            for i in range(start, n):
                row = self.trades[i]
                if not row:
                    continue
                w = (row.get("taker") or "").lower()
                if not w:
                    continue
                if row.get("wallet_first_ts") is None:
                    ts_val = wallet_to_first_ts.get(w)
                    if ts_val is not None:
                        row["wallet_first_ts"] = ts_val
                        row["wallet_first_iso"] = ts_to_iso(ts_val)
                        # recompute age days
                        try:
                            row["wallet_age_days"] = (now_utc() - datetime.fromtimestamp(ts_val, tz=timezone.utc)).total_seconds() / 86400.0
                        except Exception:
                            row["wallet_age_days"] = None
                        # recompute young flag against DEFAULT_MAX_AGE_DAYS? No — keep row's existing 'is_young'
                        # to avoid retroactively flipping unless you want to; the UI filters handle display.
                        patched += 1
        took_ms = int((time.time() - t0) * 1000)
        log_json("INFO", "age_backfill_sweep", scanned=min(max_scan_rows, len(self.trades)), patched_rows=patched, took_ms=took_ms)
        return patched

class RollingAccumulator:
    """
    Maintains a rolling window of trades and aggregates per (wallet, outcome, slug).
    """
    def __init__(self, window_sec: int = DEFAULT_ACCUM_WINDOW_SEC):
        self.window_sec = int(window_sec)
        self._dq: deque[Dict[str, Any]] = deque()
        self._sums: Dict[Tuple[str, str, str], Dict[str, float]] = defaultdict(lambda: {"notional": 0.0, "qty": 0.0, "trades": 0})
        self._lock = threading.Lock()

    def add_trade(self, rec: Dict[str, Any]) -> None:
        ts = rec.get("timestamp")
        if ts is None:
            return
        with self._lock:
            self._dq.append(rec)
            key = (rec.get("taker") or "", str(rec.get("outcome") or ""), str(rec.get("slug") or ""))
            s = self._sums[key]
            s["notional"] += float(rec.get("notional") or 0.0)
            s["qty"]      += float(rec.get("size") or 0.0)
            s["trades"]   += 1

    def _pop_left_apply(self, rec: Dict[str, Any]) -> None:
        key = (rec.get("taker") or "", str(rec.get("outcome") or ""), str(rec.get("slug") or ""))
        s = self._sums.get(key)
        if not s:
            return
        s["notional"] -= float(rec.get("notional") or 0.0)
        s["qty"]      -= float(rec.get("size") or 0.0)
        s["trades"]   -= 1
        if s["notional"] <= 0.00001 and s["qty"] <= 0.00001 and s["trades"] <= 0:
            self._sums.pop(key, None)

    def purge_old(self, now_ts: Optional[int] = None) -> None:
        if now_ts is None:
            now_ts = int(time.time())
        cutoff = now_ts - self.window_sec
        with self._lock:
            while self._dq and (self._dq[0].get("timestamp") or 0) < cutoff:
                old = self._dq.popleft()
                self._pop_left_apply(old)

    def get_above_threshold_df(self, threshold: float, wallet_age_map: Dict[str, Optional[int]],
                               max_age_days: int, show_all_gray_old: bool) -> pd.DataFrame:
        rows = []
        nowdt = now_utc()
        with self._lock:
            for (wallet, outcome, slug), s in self._sums.items():
                notional = float(s["notional"])
                if notional >= float(threshold):
                    earliest = wallet_age_map.get(wallet.lower())
                    if earliest is None:
                        is_young = True  # optimistic include
                        age_days = None
                    else:
                        is_young = earliest >= int((nowdt - timedelta(days=max_age_days)).timestamp())
                        age_days = (nowdt - datetime.fromtimestamp(earliest, tz=timezone.utc)).total_seconds() / 86400.0
                    if show_all_gray_old or is_young:
                        rows.append({
                            "wallet": wallet,
                            "outcome": outcome,
                            "slug": slug,
                            "notional_24h": notional,
                            "qty_24h": float(s["qty"]),
                            "trades_24h": int(s["trades"]),
                            "is_young": is_young,
                            "wallet_first_ts": earliest,
                            "wallet_first_iso": ts_to_iso(earliest),
                            "wallet_age_days": age_days,
                        })
        df = pd.DataFrame(rows, columns=[
            "wallet","outcome","slug","notional_24h","qty_24h","trades_24h",
            "is_young","wallet_first_ts","wallet_first_iso","wallet_age_days"
        ])
        if not df.empty:
            df = df.sort_values(["notional_24h","trades_24h"], ascending=[False, False])
        return df

    def debug_counts(self) -> Tuple[int, int]:
        with self._lock:
            wallets = set([k[0] for k in self._sums.keys()])
            return len(wallets), len(self._sums)

# ──────────────────────────────────────────────────────────────────────
# Background fetcher (GLOBAL)
# ──────────────────────────────────────────────────────────────────────

class GlobalTradeFetcher(threading.Thread):
    def __init__(self,
                 fetch_interval: float,
                 limit: int,
                 taker_only: bool,
                 max_age_days: int,
                 wallet_ttl_sec: int,
                 accum_window_sec: int,
                 max_lookups_per_cycle: int,
                 shared_store: "LiveStore",
                 accum: "RollingAccumulator",
                 verbose: bool):
        super().__init__(daemon=True)
        self.fetch_interval = max(0.5, float(fetch_interval))
        self.limit = max(1, min(int(limit), 10000))
        self.taker_only = bool(taker_only)
        self.max_age_days = max(1, int(max_age_days))
        self.wallet_cache = WalletAgeCache(ttl_seconds=wallet_ttl_sec)
        self.store = shared_store
        self.accum = accum
        self.max_lookups_per_cycle = max(1, int(max_lookups_per_cycle))
        self._stop_event = threading.Event()
        self.verbose = verbose

        self.last_max_ts: Optional[int] = None
        self.no_progress_cycles = 0

    def stop(self):
        self._stop_event.set()

    def run(self):
        log_json("INFO", "global_fetcher_start",
                 interval_s=self.fetch_interval,
                 limit=self.limit, takerOnly=self.taker_only,
                 accum_window_sec=self.accum.window_sec,
                 max_lookups_per_cycle=self.max_lookups_per_cycle)

        while not self._stop_event.is_set():
            cycle_t0 = time.time()
            lookups_left = self.max_lookups_per_cycle

            # Priority set for wallets contributing most notional
            priority_wallets: set[str] = set()
            try:
                with self.accum._lock:
                    items = sorted(self.accum._sums.items(), key=lambda kv: kv[1]["notional"], reverse=True)
                    for (w, _, _), _s in items[: min(200, len(items))]:
                        if w and isinstance(w, str):
                            priority_wallets.add(w.lower())
            except Exception:
                pass

            fetched_rows = 0
            new_after_dedupe = 0
            appended = 0
            dropped_not_young = 0
            unknown_age_allowed = 0
            activity_lookups = 0
            last_ts_seen = None
            first_ts_seen = None

            try:
                rows = fetch_global_trades(limit=self.limit, taker_only=self.taker_only, offset=0)
                fetched_rows = len(rows)

                for tr_raw in reversed(rows):  # oldest → newest
                    tr = normalize_trade(tr_raw)
                    if tr.ts is not None:
                        last_ts_seen = tr.ts if last_ts_seen is None or tr.ts > last_ts_seen else last_ts_seen
                        first_ts_seen = tr.ts if first_ts_seen is None or tr.ts < first_ts_seen else first_ts_seen

                    if not tr.tx:
                        continue
                    if self.store.seen.has(tr.tx):
                        continue

                    new_after_dedupe += 1
                    self.store.seen.add(tr.tx)

                    taker = (tr.taker or "").lower()
                    if not taker.startswith("0x"):
                        if self.verbose: log_json("DEBUG", "skip_non_wallet", tx=tr.tx, taker=tr.taker)
                        continue

                    rec = self.wallet_cache.get(taker)
                    earliest_ts_val: Optional[int] = rec.earliest_ts if (rec is not None) else None

                    # Need lookup?
                    need_lookup = (rec is None) or (rec.earliest_ts is None)
                    if need_lookup and lookups_left > 0:
                        if (taker in priority_wallets) or (lookups_left > self.max_lookups_per_cycle // 3):
                            lookups_left -= 1
                            activity_lookups += 1
                            earliest_ts_val = fetch_earliest_activity_ts_quick(taker, timeout=3.8, verbose=self.verbose)
                            self.wallet_cache.set(taker, earliest_ts_val)

                    if earliest_ts_val is None:
                        is_young = True
                        unknown_age_allowed += 1
                    else:
                        cutoff_ts = int((now_utc() - timedelta(days=self.max_age_days)).timestamp())
                        is_young = (earliest_ts_val >= cutoff_ts)

                    age_days = ((now_utc() - datetime.fromtimestamp(earliest_ts_val, tz=timezone.utc)).total_seconds() / 86400.0) if earliest_ts_val else None

                    record = {
                        "time": tr.iso,
                        "timestamp": tr.ts,
                        "side": tr.side,
                        "outcome": tr.outcome or (f"outcome[{tr.outcome_index}]" if tr.outcome_index is not None else None),
                        "price": tr.price,
                        "size": tr.size,
                        "notional": tr.notional,
                        "tx": tr.tx,
                        "taker": taker,
                        "wallet_first_ts": earliest_ts_val,
                        "wallet_first_iso": ts_to_iso(earliest_ts_val),
                        "wallet_age_days": age_days,
                        "is_young": bool(is_young),
                        "slug": tr.slug or "",
                    }
                    self.store.append_trade(record)
                    self.accum.add_trade(record)
                    appended += 1

                self.accum.purge_old()
                self.store.trim_history()

            except Exception as e:
                log_json("ERROR", "fetch_loop_error", err=repr(e), tb=traceback.format_exc())

            curr_max_ts = int(last_ts_seen) if last_ts_seen is not None else None
            if curr_max_ts is not None and self.last_max_ts is not None and curr_max_ts <= self.last_max_ts:
                self.no_progress_cycles += 1
            else:
                self.no_progress_cycles = 0
            max_ts_delta = (curr_max_ts - self.last_max_ts) if (curr_max_ts is not None and self.last_max_ts is not None) else None
            if curr_max_ts is not None:
                self.last_max_ts = curr_max_ts

            uniq_wallets, uniq_keys = self.accum.debug_counts()

            log_json(
                "INFO",
                "cycle_heartbeat",
                fetched_rows=fetched_rows,
                new_after_dedupe=new_after_dedupe,
                appended=appended,
                dropped_not_young=dropped_not_young,
                unknown_age_allowed=unknown_age_allowed,
                activity_lookups=activity_lookups,
                lookups_budget_left=max(0, self.max_lookups_per_cycle - activity_lookups),
                dedupe_size=self.store.seen.size(),
                first_ts=first_ts_seen,
                last_ts=last_ts_seen,
                max_ts_delta=max_ts_delta,
                no_progress_cycles=self.no_progress_cycles,
                accum_window_sec=self.accum.window_sec,
                accum_unique_wallets=uniq_wallets,
                accum_unique_keys=uniq_keys
            )

            time.sleep(max(0.0, self.fetch_interval - (time.time() - cycle_t0)))

# ──────────────────────────────────────────────────────────────────────
# Streamlit helpers
# ──────────────────────────────────────────────────────────────────────

def set_query_params_safe(**kwargs) -> None:
    try:
        st.query_params.update(kwargs)  # type: ignore[attr-defined]
    except Exception:
        try:
            st.experimental_set_query_params(**kwargs)  # type: ignore[attr-defined]
        except Exception:
            pass

def color_badge_for_age(days: Optional[float], is_young: bool) -> str:
    if days is None:
        return "⚪"
    if days < 1.0:   return "🟢"
    if days < 3.0:   return "🟡"
    if days < 7.0:   return "🟠"
    return "🔴" if not is_young else "🟠"

def size_badge_for_notional(n: Optional[float]) -> str:
    if n is None: return "▫️"
    if n < 100:   return "S"
    if n <= 500:  return "M"
    return "L"

def ensure_fetcher_running(params_key: str,
                           fetch_interval: float,
                           limit: int,
                           taker_only: bool,
                           max_age_days: int,
                           wallet_ttl: int,
                           accum_window_sec: int,
                           max_lookups_per_cycle: int,
                           verbose_logs: bool) -> Tuple[LiveStore, GlobalTradeFetcher, RollingAccumulator]:
    if "store" not in st.session_state:
        st.session_state.store = LiveStore()
    if "accum" not in st.session_state:
        st.session_state.accum = RollingAccumulator(window_sec=accum_window_sec)
    if "fetcher" not in st.session_state:
        st.session_state.fetcher = None
        st.session_state.fetcher_key = None

    if st.session_state.fetcher and st.session_state.fetcher_key == params_key:
        return st.session_state.store, st.session_state.fetcher, st.session_state.accum

    if st.session_state.fetcher:
        try:
            st.session_state.fetcher.stop()
        except Exception:
            pass
        st.session_state.fetcher = None
        st.session_state.fetcher_key = None
        time.sleep(0.1)

    fetcher = GlobalTradeFetcher(
        fetch_interval=fetch_interval,
        limit=limit,
        taker_only=taker_only,
        max_age_days=max_age_days,
        wallet_ttl_sec=wallet_ttl,
        accum_window_sec=accum_window_sec,
        max_lookups_per_cycle=max_lookups_per_cycle,
        shared_store=st.session_state.store,
        accum=st.session_state.accum,
        verbose=verbose_logs
    )
    fetcher.start()
    st.session_state.fetcher = fetcher
    st.session_state.fetcher_key = params_key
    return st.session_state.store, fetcher, st.session_state.accum

def merge_cache_into_df(df: pd.DataFrame, cache_map: Dict[str, Optional[int]]) -> pd.DataFrame:
    """
    NEW: For any row with wallet_first_ts == None, if cache has a value, backfill the display dataframe.
    """
    if df.empty:
        return df
    df = df.copy()
    takers = df["taker"].astype(str).str.lower()
    # Vectorized map
    mapped = takers.map(cache_map).astype("float").where(pd.notna(takers.map(cache_map)), None)
    # Fill only where missing
    need_fill = df["wallet_first_ts"].isna() & mapped.notna()
    df.loc[need_fill, "wallet_first_ts"] = mapped[need_fill]
    # Recompute iso + age for filled rows
    if need_fill.any():
        filled_ts = df.loc[need_fill, "wallet_first_ts"]
        df.loc[need_fill, "wallet_first_iso"] = filled_ts.apply(ts_to_iso)
        nowdt = now_utc()
        df.loc[need_fill, "wallet_age_days"] = filled_ts.apply(
            lambda ts: (nowdt - datetime.fromtimestamp(float(ts), tz=timezone.utc)).total_seconds()/86400.0 if pd.notna(ts) else None
        )
    return df

# ──────────────────────────────────────────────────────────────────────
# Streamlit App
# ──────────────────────────────────────────────────────────────────────

def main():
    st.set_page_config(page_title="Polymarket – Young Wallet Accumulators (ALL markets)", layout="wide")

    st.title("🌐🔴🟠🟡🟢 Polymarket • Young Wallet Accumulators (All Markets)")
    st.caption("Global live feed. Chart is scoped to the selected market. Age & size filters apply to both Live Feed and Top Accumulators. Now with cache-based age backfill so 'first seen' resolves faster.")

    with st.sidebar:
        st.header("Polling & Fetch")
        max_age_days = st.number_input("Max wallet age for 'young' (days)", min_value=1, max_value=30, value=DEFAULT_MAX_AGE_DAYS, step=1)
        taker_only = st.checkbox("takerOnly", value=DEFAULT_TAKER_ONLY,
                                 help="If enabled, only trades where the address was the taker.")
        data_limit = st.slider("Data-API rows per fetch", min_value=50, max_value=2000, value=DEFAULT_DATAAPI_LIMIT, step=50)
        fetch_interval = st.slider("Fetch interval (seconds)", min_value=1.0, max_value=15.0, value=DEFAULT_FETCH_INTERVAL_S, step=0.5)
        wallet_ttl = st.slider("Wallet-age cache TTL (seconds)", min_value=600, max_value=24*3600, value=DEFAULT_WALLET_TTL_SEC, step=600)
        ui_refresh_ms = st.slider("UI refresh (ms)", min_value=500, max_value=5000, value=DEFAULT_UI_REFRESH_MS, step=250)

        st.header("Accumulation Window")
        accum_window_sec = st.select_slider(
            "Window",
            options=[3600, 3*3600, 6*3600, 12*3600, 24*3600, 48*3600],
            value=DEFAULT_ACCUM_WINDOW_SEC,
            format_func=lambda s: {3600:"1h", 3*3600:"3h", 6*3600:"6h", 12*3600:"12h", 24*3600:"24h", 48*3600:"48h"}[s]
        )
        accum_threshold = st.number_input("Min 24h notional per (wallet×outcome×slug) to include (Top Accumulators)", min_value=0.0, value=DEFAULT_ACCUM_THRESHOLD, step=100.0)

        st.header("View")
        show_all_gray_old = st.toggle("Show all (gray old)", value=True,
                                      help="ON: include old wallets (dim badge). OFF: young/unknown only in many views.")
        require_known_age_accum = st.toggle("Require known age in Top Accumulators", value=False,
                                            help="If ON, hide entries until wallet first-seen time is known.")
        st.header("Diagnostics")
        verbose_logs = st.toggle("Verbose logging", value=False, help="Adds per-wallet activity logs and drop reasons.")
        max_lookups_ui = st.slider(
            "Max wallet-age lookups per cycle",
            min_value=6, max_value=200, value=DEFAULT_MAX_LOOKUPS_PER_CYCLE, step=2,
            help="Higher = fewer 'unknown' ages; costs more API calls."
        )
        backfill_rows = st.slider(
            "Age backfill sweep size (recent rows)",
            min_value=1000, max_value=20000, value=8000, step=1000,
            help="How many recent rows to scan each refresh to patch in wallet first-seen from cache."
        )

        st.markdown("---")
        st.subheader("Filters (apply to FEED + ACCUMULATORS)")
        include_unknown_age = st.checkbox("Include unknown wallet ages (⚪)", value=True)
        max_age_days_filter = st.number_input("Filter: Max wallet age to display (days)", min_value=0, max_value=30, value=DEFAULT_MAX_AGE_DAYS, help="Rows older than this are filtered out (unless unknown is included).")
        min_trade_notional = st.number_input("Filter: Min trade notional $ (Live Feed)", min_value=0.0, value=0.0, step=50.0)
        min_accum_notional = st.number_input("Filter: Min notional $ (Top Accumulators extra filter)", min_value=0.0, value=0.0, step=100.0)

        st.markdown("---")
        st.subheader(" Legends")
        st.markdown("**Age**: 🟢 <1d · 🟡 1–3d · 🟠 3–7d · 🔴 old (>7d) · ⚪ unknown (optimistic include)")
        st.markdown("**Size**: S < $100 · M $100–$500 · L > $500")

        start = st.button("Start / Restart", use_container_width=False)

    # Start/ensure global fetcher
    key_signature = f"GLOBAL|{fetch_interval}|{data_limit}|{taker_only}|{max_age_days}|{wallet_ttl}|{int(verbose_logs)}|{accum_window_sec}|{max_lookups_ui}|{int(require_known_age_accum)}|{backfill_rows}"
    if start or "fetcher" not in st.session_state or st.session_state.fetcher_key != key_signature:
        store, fetcher, accum = ensure_fetcher_running(
            params_key=key_signature,
            fetch_interval=fetch_interval,
            limit=data_limit,
            taker_only=taker_only,
            max_age_days=max_age_days,
            wallet_ttl=wallet_ttl,
            accum_window_sec=accum_window_sec,
            max_lookups_per_cycle=max_lookups_ui,
            verbose_logs=verbose_logs
        )
    else:
        store = st.session_state.store
        fetcher = st.session_state.fetcher
        accum = st.session_state.accum

    set_query_params_safe(scope="global")

    # Take a snapshot and immediately merge cache ages for display
    df = store.get_snapshot_df()
    cache_map = fetcher.wallet_cache.snapshot() if fetcher else {}
    if not df.empty and cache_map:
        # Backfill the underlying store (so future snapshots already include filled ages)
        try:
            store.backfill_wallet_ages(cache_map, max_scan_rows=backfill_rows)
        except Exception as e:
            log_json("WARN", "age_backfill_error", err=repr(e))

        # Merge cache into THIS dataframe snapshot (so UI reflects knowledge right now)
        df = merge_cache_into_df(df, cache_map)

    if not df.empty:
        # Normalize numeric types
        df["wallet_age_days"] = pd.to_numeric(df["wallet_age_days"], errors="coerce")
        df["wallet_first_ts"] = pd.to_numeric(df["wallet_first_ts"], errors="coerce")
        df["notional"] = pd.to_numeric(df["notional"], errors="coerce")
        df["price"] = pd.to_numeric(df["price"], errors="coerce")
        df["size"] = pd.to_numeric(df["size"], errors="coerce")
        df["qty"] = df["size"]
        df["side"] = df["side"].astype(str)
        df["outcome"] = df["outcome"].astype(str)
        df["is_young"] = df["is_young"].astype(bool)
        df["slug"] = df["slug"].astype(str)

        # If wallet_first_iso missing but ts is present (from cache), compute it
        need_iso = df["wallet_first_iso"].isna() & df["wallet_first_ts"].notna()
        if need_iso.any():
            df.loc[need_iso, "wallet_first_iso"] = df.loc[need_iso, "wallet_first_ts"].apply(ts_to_iso)

        # Age/size badges
        df["age_badge"] = [color_badge_for_age(a, y) for a, y in zip(df["wallet_age_days"], df["is_young"])]
        df["size_badge"] = df["notional"].apply(size_badge_for_notional)

        # Base visibility (young-only) if show_all_gray_old is False
        if not show_all_gray_old:
            df = df[df["is_young"] | df["wallet_age_days"].isna()].copy()

        # Apply FILTERS (age + trade size) to the FEED view
        feed_df = df.copy()
        if min_trade_notional > 0:
            feed_df = feed_df[feed_df["notional"] >= float(min_trade_notional)]
        # Age filter for display (<= max_age_days_filter), with optional unknown include
        age_mask = (feed_df["wallet_age_days"] <= float(max_age_days_filter))
        if include_unknown_age:
            age_mask = age_mask | (feed_df["wallet_age_days"].isna())
        feed_df = feed_df[age_mask].copy()

        # Market activity table to choose the chart market
        st.markdown("### 🗂️ Market Activity (recent feed)")
        placeholder_label = "— Select a market for the chart —"
        st.session_state.setdefault("chart_slug_placeholder", placeholder_label)

        activity = (feed_df.groupby("slug", dropna=False)
                    .agg(trades=("tx", "nunique"),
                         notional_usd=("notional", "sum"))
                    .sort_values(["trades", "notional_usd"], ascending=[False, False]))

        if not activity.empty:
            wallet_notional = (feed_df.groupby(["slug", "taker"], dropna=False)["notional"].sum())
            top_wallet_idx = wallet_notional.groupby(level=0).idxmax()
            top_wallet_notional = wallet_notional.groupby(level=0).max()
            top_wallet_lookup: Dict[Any, Optional[str]] = {}
            for slug_key, idx in top_wallet_idx.items():
                if isinstance(idx, tuple) and len(idx) == 2:
                    top_wallet_lookup[slug_key] = idx[1]
                else:
                    top_wallet_lookup[slug_key] = None

            avg_wallet_age = feed_df.groupby("slug")["wallet_age_days"].mean()
            outcome_mix = (feed_df.groupby(["slug", "outcome"], dropna=False)["notional"].sum().unstack(fill_value=0.0))

            top_wallet_series = activity.index.to_series().map(lambda slug: top_wallet_lookup.get(slug))
            activity["Top Wallet"] = top_wallet_series.apply(short_wallet)
            top_notional = activity.index.to_series().map(lambda slug: float(top_wallet_notional.get(slug, 0.0)))
            with pd.option_context('mode.use_inf_as_na', True):
                concentration = (top_notional / activity["notional_usd"].replace(0, pd.NA)).fillna(0.0)
            activity["Top Wallet Concentration (%)"] = concentration * 100.0
            activity["Avg Wallet Age (days)"] = activity.index.to_series().map(
                lambda slug: float(avg_wallet_age.get(slug, float("nan")))
            )

            yes_series = outcome_mix.get("Yes") if isinstance(outcome_mix, pd.DataFrame) else None
            no_series = outcome_mix.get("No") if isinstance(outcome_mix, pd.DataFrame) else None
            activity["Yes ($)"] = activity.index.to_series().map(
                lambda slug: float(yes_series.get(slug, 0.0)) if yes_series is not None else 0.0
            )
            activity["No ($)"] = activity.index.to_series().map(
                lambda slug: float(no_series.get(slug, 0.0)) if no_series is not None else 0.0
            )
        else:
            activity["Top Wallet"] = pd.Series(dtype=object)
            activity["Top Wallet Concentration (%)"] = pd.Series(dtype=float)
            activity["Avg Wallet Age (days)"] = pd.Series(dtype=float)
            activity["Yes ($)"] = pd.Series(dtype=float)
            activity["No ($)"] = pd.Series(dtype=float)

        activity_display = activity.reset_index().rename(columns={"slug": "Market (slug)"})
        if not activity_display.empty:
            if "Top Wallet Concentration (%)" in activity_display:
                activity_display["Top Wallet Concentration (%)"] = activity_display["Top Wallet Concentration (%)"].round(1)
            if "Avg Wallet Age (days)" in activity_display:
                activity_display["Avg Wallet Age (days)"] = activity_display["Avg Wallet Age (days)"].round(2)
            if "Yes ($)" in activity_display:
                activity_display["Yes ($)"] = activity_display["Yes ($)"].round(0)
            if "No ($)" in activity_display:
                activity_display["No ($)"] = activity_display["No ($)"].round(0)
        st.dataframe(activity_display, width="stretch", height=240)

        # Market selector (chart scopes to this slug ONLY)
        slug_options = [placeholder_label] + activity.index.tolist()
        if "chart_slug_select" not in st.session_state:
            st.session_state["chart_slug_select"] = placeholder_label
        if st.session_state["chart_slug_select"] not in slug_options:
            st.session_state["chart_slug_select"] = placeholder_label

        selected_slug = st.selectbox("Chart Market (from table above):",
                                     options=slug_options,
                                     key="chart_slug_select")
        chart_slug = None if selected_slug == placeholder_label else selected_slug

        # Sort for live feed
        feed_sorted = feed_df.sort_values("timestamp", ascending=False)

        colA, colB = st.columns([1.6, 1.0], gap="large")

        with colA:
            st.markdown("### 🌊 Live Trade Feed (Filtered)")
            feed_cols = ["time", "age_badge", "size_badge", "is_young", "side", "outcome",
                         "price", "qty", "notional", "slug", "taker", "tx", "wallet_first_iso"]
            feed_show = feed_sorted.head(250)[feed_cols].rename(columns={
                "time": "When (UTC)", "age_badge": "Age", "size_badge": "Size", "is_young": "Young?",
                "side": "Side", "outcome": "Outcome", "price": "Price", "qty": "Qty", "notional": "Notional ($)",
                "slug": "Market (slug)", "taker": "Wallet", "tx": "Tx", "wallet_first_iso": "Wallet First Seen"
            }).reset_index(drop=True)
            st.session_state["feed_slug_lookup"] = feed_show["Market (slug)"].tolist()
            dataframe_kwargs = {
                "width": "stretch",
                "height": 520,
                "key": "live_feed_table",
            }
            dataframe_sig = inspect.signature(st.dataframe)
            if "selection_mode" in dataframe_sig.parameters and "on_select" in dataframe_sig.parameters:
                dataframe_kwargs.update({
                    "selection_mode": "single-row",
                    "on_select": handle_feed_selection,
                })
            st.dataframe(feed_show, **dataframe_kwargs)
            handle_feed_selection()

            st.markdown("### 📈 Trades Over Time — Chart scoped to selected market")
            # CHART: Only show trades for the selected market
            df_plot = feed_df.dropna(subset=["timestamp"]).copy()
            if chart_slug:
                df_plot = df_plot[df_plot["slug"] == chart_slug]
            if chart_slug and not df_plot.empty:
                df_plot["time_dt"] = pd.to_datetime(df_plot["timestamp"], unit="s", utc=True)
                fig = px.scatter(
                    df_plot.sort_values("time_dt"),
                    x="time_dt", y="price",
                    size=(df_plot["notional"].clip(lower=1.0)),
                    size_max=24,
                    color="outcome",
                    symbol="side",
                    hover_data=["side", "outcome", "price", "qty", "notional", "taker",
                                "wallet_first_iso", "time", "is_young", "slug"],
                    labels={"time_dt": "Time (UTC)", "price": "Price", "outcome": "Outcome", "side": "Side", "qty": "Qty"},
                    title=None
                )
                fig.update_layout(margin=dict(l=10, r=10, b=10, t=10), height=380)
                st.plotly_chart(fig, width="stretch", theme="streamlit")
            else:
                st.info("Select a market from the table (or dropdown) to render the chart. We intentionally do not chart 'All'.")

        with colB:
            st.markdown("### 🧲 Top Accumulators (window, filtered)")
            # Build wallet->first_ts map prioritizing CACHE (so None resolves even if earlier rows were None)
            wallet_first_map: Dict[str, Optional[int]] = {}
            if cache_map:
                wallet_first_map.update(cache_map)  # cache first

            if not df.empty:
                grp = df.groupby("taker", dropna=True)["wallet_first_ts"].min()
                for w, ts in grp.items():
                    if isinstance(w, str) and w:
                        # If cache had None but df has a number, take the number; else keep existing
                        existing = wallet_first_map.get(w.lower())
                        if pd.notna(ts):
                            ts_i = int(ts)
                            if existing is None or (isinstance(existing, (int, float)) and ts_i < int(existing)):
                                wallet_first_map[w.lower()] = ts_i
                        else:
                            wallet_first_map.setdefault(w.lower(), None)

            acc_df = accum.get_above_threshold_df(
                threshold=float(accum_threshold),
                wallet_age_map=wallet_first_map,
                max_age_days=int(max_age_days),
                show_all_gray_old=bool(show_all_gray_old)
            )

            # Apply extra Top Accumulators filters (age + notional)
            if not acc_df.empty:
                # Age filter
                age_mask_acc = (acc_df["wallet_age_days"] <= float(max_age_days_filter))
                if include_unknown_age:
                    age_mask_acc = age_mask_acc | (acc_df["wallet_age_days"].isna())
                # Extra notional filter
                acc_df = acc_df[age_mask_acc & (acc_df["notional_24h"] >= float(min_accum_notional))]

                if require_known_age_accum:
                    acc_df = acc_df[acc_df["wallet_first_ts"].notna()]

            uniq_wallets, uniq_keys = accum.debug_counts()
            above_count = 0 if acc_df.empty else len(acc_df)
            log_json("INFO", "accum_heartbeat",
                     window_sec=accum.window_sec,
                     unique_wallets=uniq_wallets,
                     unique_wallet_outcome_pairs=uniq_keys,
                     above_threshold=above_count,
                     threshold=accum_threshold)

            if acc_df.empty:
                st.info("No wallets currently above the (filtered) threshold/window. Adjust filters or wait for flow.")
            else:
                acc_df["age_badge"] = [color_badge_for_age(a, y) for a, y in zip(acc_df["wallet_age_days"], acc_df["is_young"])]

                if chart_slug:
                    acc_df = acc_df[acc_df["slug"] == chart_slug]

                show_cols = ["age_badge", "is_young", "wallet", "outcome", "slug",
                             "notional_24h", "qty_24h", "trades_24h", "wallet_first_iso"]
                table = acc_df[show_cols].rename(columns={
                    "age_badge": "Age", "is_young": "Young?", "wallet": "Wallet", "outcome": "Outcome",
                    "slug": "Market (slug)", "notional_24h": "Notional 24h ($)",
                    "qty_24h": "Qty 24h", "trades_24h": "Trades 24h", "wallet_first_iso": "Wallet First Seen"
                })
                st.dataframe(table, width="stretch", height=420)

            st.markdown("---")
            st.markdown("### Quick Mix Snapshots (Filtered Feed)")
            buy_df = feed_df[feed_df["side"] == "BUY"]
            totals = buy_df.groupby("outcome", dropna=False)["notional"].sum().sort_values(ascending=False)
            total_yes = float(totals.get("Yes", 0.0))
            total_no = float(totals.get("No", 0.0))
            st.metric("Bought YES ($)", f"{total_yes:,.0f}")
            st.metric("Bought NO ($)", f"{total_no:,.0f}")

            side_counts = feed_df["side"].value_counts(dropna=False)
            st.markdown("**Side Mix (counts)**")
            st.dataframe(side_counts.to_frame("count"), width="stretch", height=160)

            out_counts = feed_df["outcome"].value_counts(dropna=False)
            st.markdown("**Outcome Mix (counts)**")
            st.dataframe(out_counts.to_frame("count"), width="stretch", height=160)

    else:
        st.info("Waiting for first trades from global window…")

    time.sleep(max(0.1, float(ui_refresh_ms) / 1000.0))
    st.rerun()

# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
