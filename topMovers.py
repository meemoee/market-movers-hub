#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
topmovers.py — fetch "top movers" from your Supabase function, hard-filter (incl. MIN VOLUME),
optionally filter by MAX SNAPSHOT SPREAD (decimal), ask OpenRouter to pick 10, then let YOU choose
any subset to run:
  • Polymarket  -> polyrecursiveagents.py <slug>

THIS BUILD (POLYMARKET-ONLY):
  • **No live price checks** anywhere. All prices/bids/asks come from your stored snapshots.
  • **Snapshot spread filter**: --max-spread DECIMAL enforces (final_best_ask - final_best_bid) ≤ max.
    - Falls back to initial_* then generic keys if finals are absent.
    - If --max-spread is set and we can’t compute both bid and ask, the market is skipped.
  • **Bid/Ask extraction fixed** to read your mover payload fields: final_best_bid/final_best_ask
    (and initial_* fallbacks), preventing “n/a” in the selection UI when your Redis/Supabase snapshot
    already has them.
  • De-dupe and recent-history skipping preserved. MIN TOTAL VOLUME enforced before LLM to hide illiquid junk.
  • Selection screen shows SNAPSHOT bestBid/bestAsk, spread, Δprice, total volume, and a trimmed description.
  • Reads/writes processed_markets.json so finished items don’t resurface.
  • HTTP keep-alive pooling for Supabase + OpenRouter calls to reduce overhead.

ENV:
  SUPABASE_URL, SUPABASE_ANON_KEY
  OPENROUTER_API_KEY
  PROCESSED_FILE (optional; default processed_markets.json)

Runner expected in PATH (or same directory):
  - polyrecursiveagents.py
"""

import argparse
import os
import re
import requests
from requests.adapters import HTTPAdapter
from urllib.parse import urlparse
import sys
import json
import subprocess
from typing import Any, Dict, Optional, Tuple, List, Set
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ================== CONFIG ==================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://lfmkoismabbhujycnqpn.supabase.co")
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc",
)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "sk-or-v1-xxx")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Runner script
POLYMARKET_RUNNER = "polyrecursiveagents.py"

# Minimum TOTAL volume filter (USD) — enforced at initial market finding stage
MIN_TOTAL_VOLUME_USD = 0

# Where to persist already-processed ids (slug)
DEFAULT_PROCESSED_FILE = os.environ.get("PROCESSED_FILE", "processed_markets.json")

# ===== HARD-CODED, POLYMARKET EXCLUDED TAGS =====
EXCLUDED_TAGS_POLY = [
    "sports", "recurring", "crypto prices", "esports",
    "Climate and Weather", "weather", "Mentions", "Macro Indicators",
    "Companies", "economy",
]

# ===== EXTRA HARD-CODED, POLYMARKET TITLE/SLUG KEYWORDS (safety net) =====
# (All checked case-insensitively against title, subtitle, description, slug and url.)
EXCLUDED_TEXT_KEYWORDS_POLY = [
    # weather/climate
    "weather", "climate", "temperature", "highest temperature", "heat index",
    "rain", "snow", "tornado", "hurricane", "storm", "wind speed", "humidity",
    "aqi", "air quality", "heatwave", "precip",
    # recurring/price-y
    "bitcoin", "solana", "ethereum", "crypto", "daily", "weekly",
]

# LLM prompt
BASE_PROMPT = """You are a trading researcher. You are given a list of filtered markets.

Pick 10 markets that:
- don’t hinge on one person’s decision
- reward deep domain research over surface takes
- aren’t random/speculative or simple asset prices
- have precise resolution rules you can exploit

DO NOT select election markets!

Avoid duplicates and only use identifiers I provided (slug)."""

# ================== SINGLE SPEED FIX: pooled keep-alive HTTP session ==================
_HTTP_SESSION: Optional[requests.Session] = None

def _http() -> requests.Session:
    """
    Return a module-singleton requests.Session with connection pooling and keep-alive.
    Behavior is unchanged; only reduces TCP/TLS handshakes across many POSTs.
    """
    global _HTTP_SESSION
    if _HTTP_SESSION is None:
        s = requests.Session()
        adapter = HTTPAdapter(pool_connections=64, pool_maxsize=64)
        s.mount("https://", adapter)
        s.mount("http://", adapter)
        s.headers.update({"Connection": "keep-alive"})
        _HTTP_SESSION = s
    return _HTTP_SESSION

# ================== HELPERS ==================
def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def extract_slug(url: str) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    return parts[-1] if parts else None

def market_slug(m: Dict[str, Any]) -> Optional[str]:
    if not isinstance(m, dict):
        return None
    url = m.get("url") or ""
    s = extract_slug(url)
    if s:
        return s
    s2 = m.get("market_slug") or m.get("slug") or m.get("id")
    if isinstance(s2, str) and s2.strip():
        return s2.strip()
    return None

def normalize_tags(val: Any) -> List[str]:
    out: List[str] = []
    if isinstance(val, str):
        out.extend([x.strip() for x in val.split(",") if x.strip()])
    elif isinstance(val, list):
        for t in val:
            if isinstance(t, str):
                s = t.strip()
                if s:
                    out.append(s)
            elif isinstance(t, dict):
                for k in ("name", "label", "title", "slug"):
                    v = t.get(k)
                    if isinstance(v, str) and v.strip():
                        out.append(v.strip())
    elif isinstance(val, dict):
        for k in ("name", "label", "title", "slug"):
            v = val.get(k)
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
    return out

def collect_tags(m: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []
    for key in ("tags", "tagNames", "categories", "topics", "sections"):
        if key in m:
            candidates.extend(normalize_tags(m[key]))
    for key in ("category", "topic", "section"):
        if isinstance(m.get(key), str) and m[key].strip():
            candidates.append(m[key].strip())
    for node in ("event", "series", "attributes", "data", "meta", "market"):
        sub = m.get(node)
        if isinstance(sub, dict):
            for key in ("tags", "tagNames", "categories", "topics", "sections", "category", "topic", "section"):
                if key in sub:
                    if key in ("category", "topic", "section") and isinstance(sub[key], str):
                        candidates.append(sub[key].strip())
                    else:
                        candidates.extend(normalize_tags(sub[key]))
    seen: Set[str] = set()
    ordered: List[str] = []
    for t in candidates:
        tl = t.strip()
        if tl and tl not in seen:
            seen.add(tl)
            ordered.append(tl)
    return ordered

def _norm_tag(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', s.strip().lower()).strip('-')

def _text_blob_for_filter(m: Dict[str, Any]) -> str:
    s = " ".join([
        str(m.get("title") or m.get("question") or ""),
        str(m.get("subtitle") or m.get("subTitle") or ""),
        str(m.get("description") or m.get("longDescription") or m.get("desc") or ""),
        str(market_slug(m) or ""),
        str(m.get("url") or ""),
    ]).lower()
    return s

def detect_exchange(_: Dict[str, Any]) -> str:
    # Polymarket-only build
    return "polymarket"

def has_excluded_tag(m: Dict[str, Any]) -> bool:
    ex_norm = {_norm_tag(x) for x in EXCLUDED_TAGS_POLY}
    for t in collect_tags(m):
        if _norm_tag(t) in ex_norm:
            return True
    cat = str(m.get("category") or m.get("section") or m.get("topic") or "")
    return _norm_tag(cat) in ex_norm if cat else False

def is_excluded_by_text(m: Dict[str, Any]) -> bool:
    blob = _text_blob_for_filter(m)
    for w in EXCLUDED_TEXT_KEYWORDS_POLY:
        if w.lower() in blob:
            return True
    return False

def _coerce_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).strip()
        if s == "" or s.lower() == "null":
            return None
        return float(s)
    except Exception:
        return None

def _normalize_prob_0_1(val: Optional[float]) -> Optional[float]:
    if val is None:
        return None
    # Accept decimal (0..1). If 1..100, treat as percent. If 100..10000 treat as bps.
    if 0.0 <= val <= 1.0:
        return val
    if 1.0 < val <= 100.0:
        return val / 100.0
    if 100.0 < val <= 10000.0:
        return val / 10000.0
    return None

# ---------- Volume / desc / change helpers ----------
def safe_title(m: Dict[str, Any]) -> str:
    return (m.get("question") or m.get("market_slug") or m.get("title") or "").strip()

def safe_description(m: Dict[str, Any]) -> str:
    for k in ("description", "longDescription", "desc"):
        v = m.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    for nk in ("data", "attributes", "meta", "market"):
        sub = m.get(nk)
        if isinstance(sub, dict):
            v = sub.get("description")
            if isinstance(v, str) and v.strip():
                return v.strip()
    return ""

def compute_price_change(m: Dict[str, Any]) -> Optional[float]:
    pc = _coerce_float(m.get("price_change"))
    if pc is not None:
        return pc
    fin = _coerce_float(m.get("final_last_price"))
    ini = _coerce_float(m.get("initial_last_price"))
    if fin is not None and ini is not None:
        return fin - ini
    finy = _coerce_float(m.get("final_yes_price"))
    iniy = _coerce_float(m.get("initial_yes_price"))
    if finy is not None and iniy is not None:
        return finy - iniy
    return None

def extract_volume(m: Dict[str, Any]) -> Optional[float]:
    # TOTAL volume (not 24h): prefer final_volume from your pipeline.
    fv = _coerce_float(m.get("final_volume"))
    if fv is not None:
        return fv
    v = _coerce_float(m.get("volume"))
    if v is not None:
        return v
    for nk in ("stats", "data", "attributes", "meta", "market"):
        sub = m.get(nk)
        if isinstance(sub, dict):
            vv = _coerce_float(sub.get("volume"))
            if vv is not None:
                return vv
    return None

def truncate(s: str, n: int) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else (s[:n-1] + "…")

# ---------- Snapshot bid/ask extraction ----------
_SNAPSHOT_BID_KEYS = [
    # prefer your snapshot finals, then initials
    "final_best_bid", "initial_best_bid",
    # generic fallbacks that might exist in some payloads
    "best_bid", "bestBid", "bid", "best_bid_yes", "yes_bid",
    "yesBid", "bestYesBid", "bestYesPrice",
]
_SNAPSHOT_ASK_KEYS = [
    "final_best_ask", "initial_best_ask",
    "best_ask", "bestAsk", "ask", "best_ask_yes", "yes_ask",
    "yesAsk", "bestYesAsk", "bestAskPrice",
]

def _try_extract_from_dict(d: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    bb = ba = None
    for k in _SNAPSHOT_BID_KEYS:
        if k in d:
            val = _normalize_prob_0_1(_coerce_float(d.get(k)))
            if val is not None:
                if bb is None or k.startswith("final_"):
                    bb = val
    for k in _SNAPSHOT_ASK_KEYS:
        if k in d:
            val = _normalize_prob_0_1(_coerce_float(d.get(k)))
            if val is not None:
                if ba is None or k.startswith("final_"):
                    ba = val
    return bb, ba

def snapshot_bid_ask(m: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    # Try top-level first
    bb, ba = _try_extract_from_dict(m)
    if bb is not None or ba is not None:
        return bb, ba
    # Then nested common nodes
    for nk in ("data", "attributes", "meta", "market", "stats"):
        sub = m.get(nk)
        if isinstance(sub, dict):
            b2, a2 = _try_extract_from_dict(sub)
            bb = bb if bb is not None else b2
            ba = ba if ba is not None else a2
            if bb is not None or ba is not None:
                break
    return bb, ba

def spread_from_snapshot(m: Dict[str, Any]) -> Optional[float]:
    bb, ba = snapshot_bid_ask(m)
    if bb is None or ba is None:
        return None
    if bb < 0 or ba < 0:
        return None
    if bb > 1 or ba > 1:
        return None
    if ba < bb:
        return None
    return ba - bb

# ---------- Supabase fetch ----------
def fetch_top_movers(interval: int, limit: int = 25, offset: Optional[int] = None,
                     cursor: Optional[str] = None, page: Optional[int] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    url = f"{SUPABASE_URL}/functions/v1/get-top-movers"
    headers = {
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "interval": str(interval),
        "limit": limit,
        # Server-side hints (safe if function ignores them)
        "minVolume": MIN_TOTAL_VOLUME_USD,
        "excludedTagsPolymarket": [_norm_tag(t) for t in EXCLUDED_TAGS_POLY],
        "excludedTagsPolymarketRaw": EXCLUDED_TAGS_POLY,
    }
    if offset is not None:
        payload["offset"] = int(offset)
    if page is not None:
        payload["page"] = int(page)
    if cursor is not None:
        payload["cursor"] = cursor

    r = _http().post(url, headers=headers, json=payload, timeout=45)
    r.raise_for_status()
    body = r.json() if r.content else {}
    data = body.get("data", []) or []
    next_cursor = body.get("cursor") or body.get("nextCursor") or body.get("next_cursor") or None
    return data, next_cursor

# ---------- History ----------
def load_recent_ids(history_file: str, days: int = 7) -> Set[str]:
    recent: Set[str] = set()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    if not os.path.exists(history_file):
        return recent
    try:
        with open(history_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    j = json.loads(line)
                    ident = j.get("slug") or j.get("id")
                    ts = j.get("ts")
                    if not ident or not ts:
                        continue
                    try:
                        ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except Exception:
                        continue
                    if ts_dt >= cutoff:
                        recent.add(str(ident).lower())
                except Exception:
                    continue
    except Exception as e:
        print(f"[WARN] Failed to read history file '{history_file}': {e}")
    return recent

def append_history(history_file: str, ids: List[str]) -> None:
    os.makedirs(os.path.dirname(history_file) or ".", exist_ok=True)
    try:
        with open(history_file, "a", encoding="utf-8") as f:
            now = utc_now_iso()
            for s in ids:
                f.write(json.dumps({"ts": now, "slug": s}, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[WARN] Failed to append history: {e}")

# ---------- processed_markets.json helpers ----------
def _load_processed_map(path: str) -> Dict[str, str]:
    """Load {slug_lower: ISO timestamp} from processed_markets.json."""
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with p.open("r", encoding="utf-8") as f:
            data = json.load(f)
        out: Dict[str, str] = {}
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(k, str) and k.strip():
                    out[k.strip().lower()] = str(v) if v is not None else "1970-01-01T00:00:00"
        return out
    except Exception as e:
        print(f"[WARN] Failed to read {path}: {e}")
        return {}

def _update_processed_map(path: str, ids: List[str]) -> None:
    """Merge finished ids into processed_markets.json as {slug: ISO} (preserve existing)."""
    if not ids:
        return
    p = Path(path)
    existing = _load_processed_map(path)
    now = datetime.now(timezone.utc).isoformat()
    for s in ids:
        if not isinstance(s, str) or not s.strip():
            continue
        k = s.strip().lower()
        existing.setdefault(k, now)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2, sort_keys=True)
    except Exception as e:
        print(f"[WARN] Could not update {path}: {e}")

# ---------- OpenRouter helpers ----------
def stream_openrouter(prompt: str, model: str = "gpt-4o-mini") -> str:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }
    collected_text = ""
    with _http().post(
        OPENROUTER_URL,
        headers=headers,
        json=payload,
        stream=True,
        timeout=(15, 300),
    ) as r:
        if r.status_code != 200:
            raise RuntimeError(f"OpenRouter error {r.status_code}: {r.text}")
        for line in r.iter_lines():
            if not line:
                continue
            if line.startswith(b"data: "):
                data = line[len(b"data: "):]
                if data == b"[DONE]":
                    break
                try:
                    j = json.loads(data)
                    delta = j.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        sys.stdout.write(delta)
                        sys.stdout.flush()
                        collected_text += delta
                except Exception:
                    continue
    return collected_text.strip()

def openrouter_json_request(prompt: str, model: str = "google/gemini-flash-1.5"):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    r = _http().post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"OpenRouter JSON call failed {r.status_code}: {r.text}")
    data = r.json()
    return data["choices"][0]["message"]["content"]

# ---------- Pagination + filtering (WITH MIN VOLUME, NO LIVE CHECKS) ----------
def fetch_top_movers_pages(interval: int, need: int, batch: int, history_recent: Set[str], max_pages: int = 200) -> List[Dict[str, Any]]:
    qualified: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()  # everything we've *processed* (even skips)

    skipped_tags = 0
    skipped_text = 0
    skipped_prob = 0  # kept for debug parity; not used in this build
    skipped_unknown_prob = 0  # kept for parity; not used
    skipped_history = 0
    skipped_volume = 0

    def id_for_history(m: Dict[str, Any]) -> Optional[str]:
        s = market_slug(m)
        return s.lower() if s else None

    def print_price_line(m: Dict[str, Any], ident: str) -> None:
        title = safe_title(m)
        exchange = detect_exchange(m)
        tags_list = collect_tags(m)
        tags_str = ", ".join(tags_list) if tags_list else "(none)"
        pc = compute_price_change(m)
        pc_str = f"{pc:+.4f}" if pc is not None else "n/a"
        vol = extract_volume(m)
        vol_str = f"{vol:,.0f}" if (vol is not None and vol >= 0) else "n/a"
        bb, ba = snapshot_bid_ask(m)
        bb_str = f"{bb:.4f}" if bb is not None else "n/a"
        ba_str = f"{ba:.4f}" if ba is not None else "n/a"
        sp = spread_from_snapshot(m)
        sp_str = f"{sp:.4f}" if sp is not None else "n/a"

        print(f"[PRICE] [{exchange}] {title} — id={ident}")
        print(f"    SNAPSHOT bestBid: {bb_str} | bestAsk: {ba_str} | spread: {sp_str}")
        print(f"    Δprice: {pc_str} | volume: {vol_str}")
        print(f"    tags: {tags_str}")

    def consider_batch(data: List[Dict[str, Any]], label: str, iter_no: int) -> Tuple[int, int, int]:
        nonlocal skipped_tags, skipped_text, skipped_prob, skipped_unknown_prob, skipped_history, skipped_volume
        before_seen = len(seen_ids)
        before_kept = len(qualified)
        batch_ids: Set[str] = set()

        for m in data:
            ident = id_for_history(m)
            if not ident:
                url = (m.get("url") or "").strip().lower()
                ident = url or (m.get("id") and str(m.get("id")).lower())
                if not ident:
                    continue

            # ===== De-dupe BEFORE any logging =====
            if ident in seen_ids:
                continue
            seen_ids.add(ident)
            batch_ids.add(ident)

            # Volume filter FIRST — keep LLM blind to illiquid markets
            vol = extract_volume(m)
            if vol is None or vol < MIN_TOTAL_VOLUME_USD:
                skipped_volume += 1
                print(f"[SKIP VOL] id={ident} volume={vol if vol is not None else 'n/a'} (< ${MIN_TOTAL_VOLUME_USD:,.0f})")
                continue

            # Tag/text excludes
            if has_excluded_tag(m):
                skipped_tags += 1
                print(f"[SKIP TAG] id={ident} tags: {', '.join(collect_tags(m)) or '(none)'}")
                continue

            if is_excluded_by_text(m):
                skipped_text += 1
                print(f"[SKIP TEXT] id={ident} matched keyword filter")
                continue

            # Skip if already in recent/processed
            if ident in history_recent:
                skipped_history += 1
                print(f"[SKIP HISTORY] id={ident} already processed/recent")
                continue

            print_price_line(m, ident)
            qualified.append(m)
            if len(qualified) >= need:
                break

        new_seen = len(seen_ids) - before_seen
        new_kept = len(qualified) - before_kept
        unique_in_batch = len(batch_ids)
        print(
            f"[DEBUG] {label} {iter_no}: batch_size={len(data)} | unique_in_batch={unique_in_batch} | "
            f"new_seen={new_seen} | new_kept={new_kept} | kept_total={len(qualified)}/{need} | "
            f"skipped_vol={skipped_volume} | skipped_tags={skipped_tags} | skipped_text={skipped_text} | "
            f"skipped_prob={skipped_prob} | skipped_unknown_prob={skipped_unknown_prob} | skipped_history={skipped_history}"
        )
        return new_seen, new_kept, unique_in_batch

    # Cursor-first
    cursor = None
    no_progress = 0
    for i in range(max_pages):
        if len(qualified) >= need:
            break
        data, next_cursor = fetch_top_movers(interval=interval, limit=batch, cursor=cursor)
        if not data:
            print(f"[DEBUG] cursor phase {i}: empty batch; stopping cursor mode.")
            break
        new_seen, new_kept, unique_in_batch = consider_batch(data, "CURSOR", i)
        if new_seen == 0 and new_kept == 0:
            no_progress += 1
        else:
            no_progress = 0
        cursor = next_cursor
        if cursor is None:
            print("[DEBUG] No cursor returned by server; switching to OFFSET mode.")
            break
        if no_progress >= 2 or unique_in_batch == 0:
            print("[DEBUG] Cursor stalled; switching to LIMIT-GROWTH fallback.")
            cursor = None
            break

    if len(qualified) >= need:
        return qualified[:need]

    # Offset
    if cursor is None:
        no_progress = 0
        for page in range(max_pages):
            if len(qualified) >= need:
                break
            offset = page * batch
            try:
                data, _ = fetch_top_movers(interval=interval, limit=batch, offset=offset, page=page)
            except Exception as e:
                print(f"[WARN] fetch_top_movers failed offset={offset} page={page}: {e}")
                data = []
            if not data:
                print(f"[DEBUG] OFFSET page {page}: empty batch; stopping offset mode.")
                break
            new_seen, new_kept, unique_in_batch = consider_batch(data, "OFFSET", page)
            if new_seen == 0 and new_kept == 0:
                no_progress += 1
            else:
                no_progress = 0
            if no_progress >= 2 or unique_in_batch == 0:
                print("[DEBUG] Offset stalled; switching to LIMIT-GROWTH fallback.")
                break

        if len(qualified) >= need:
            return qualified[:need]

    # Fallback: limit growth (with no-progress stop)
    limit = batch
    fallback_no_progress = 0
    for tries in range(max_pages):
        if len(qualified) >= need:
            break
        # grow up to 1000, then keep at 1000
        limit = min(limit + batch, 1000)
        try:
            data, _ = fetch_top_movers(interval=interval, limit=limit)
        except Exception as e:
            print(f"[WARN] Fallback fetch(limit={limit}) failed: {e}")
            data = []
        if not data:
            print(f"[DEBUG] Fallback try {tries}: empty response; stopping fallback.")
            break
        new_seen, new_kept, unique_in_batch = consider_batch(data, "FALLBACK", tries)
        if new_seen == 0 and new_kept == 0:
            fallback_no_progress += 1
        else:
            fallback_no_progress = 0
        # If we hit 1000 and got no progress even once, bail quickly to avoid spam
        if unique_in_batch == 0 or fallback_no_progress >= 2 or (limit == 1000 and fallback_no_progress >= 1):
            print("[DEBUG] Fallback stalled; stopping fallback loop.")
            break

    return qualified[:need]

# ================== INTERACTIVE SELECTION ==================
def prompt_user_selection(candidates: List[Dict[str, Any]], market_index: Dict[str, Dict[str, Any]]) -> List[str]:
    """
    Show up to 10 LLM-picked candidates with details and ask the user to select any number.
    Returns a list of normalized keys (slug) chosen by the user.
    """
    print("\n==================== SELECTION ====================")
    print("Choose any number of the 10 suggested markets to run.")
    print("Enter indices (e.g., 1,3,5) or keys (slug), or 'all' to run all.")
    print("Press ENTER with nothing to skip.\n")

    for i, m in enumerate(candidates, start=1):
        ex = detect_exchange(m)  # always 'polymarket' in this build
        slug = market_slug(m) or f"item-{i}"
        key = slug

        pc = compute_price_change(m)
        pc_str = f"{pc:+.4f}" if pc is not None else "n/a"
        vol = extract_volume(m)
        vol_str = f"{vol:,.0f}" if (vol is not None and vol >= 0) else "n/a"
        bb, ba = snapshot_bid_ask(m)
        bb_str = f"{bb:.4f}" if bb is not None else "n/a"
        ba_str = f"{ba:.4f}" if ba is not None else "n/a"
        sp = spread_from_snapshot(m)
        sp_str = f"{sp:.4f}" if sp is not None else "n/a"
        desc = truncate(safe_description(m), 220) or "(no description)"
        title = safe_title(m)

        print(f"{i:>2}. [{ex}] {title}")
        print(f"    key: {key}")
        print(f"    SNAPSHOT bestBid: {bb_str} | bestAsk: {ba_str} | spread: {sp_str}")
        print(f"    Δprice: {pc_str} | volume: {vol_str}")
        print(f"    desc: {desc}\n")

    try:
        line = input("Select (comma/space separated indices or keys; 'all' for all; blank to skip): ").strip()
    except EOFError:
        line = ""
    if not line:
        print("[INFO] No selection made.")
        return []

    selected_keys: List[str] = []
    if line.lower() in ("all", "a", "*"):
        for m in candidates:
            slug = market_slug(m)
            key = (slug or "").strip()
            if key:
                selected_keys.append(key)
        print(f"[INFO] Selected ALL ({len(selected_keys)}).")
        return selected_keys

    tokens = re.split(r"[,\s]+", line)
    idx_map = {str(i): i-1 for i in range(1, len(candidates)+1)}
    for tok in tokens:
        if not tok:
            continue
        if tok in idx_map:
            m = candidates[idx_map[tok]]
            slug = market_slug(m)
            key = (slug or "").strip()
            if key:
                selected_keys.append(key)
        else:
            selected_keys.append(tok.strip())

    seen: Set[str] = set()
    validated: List[str] = []
    valid_keys_lower = set()
    for m in candidates:
        slug = market_slug(m)
        k = (slug or "").strip().lower()
        if k:
            valid_keys_lower.add(k)

    for key in selected_keys:
        kl = key.lower()
        if kl in seen:
            continue
        seen.add(kl)
        if kl in valid_keys_lower:
            validated.append(key)
        else:
            if kl in market_index:
                validated.append(key)
            else:
                print(f"[WARN] Ignoring unknown selection: {key}")

    print(f"[INFO] Final selections: {', '.join(validated) if validated else '(none)'}")
    return validated

# ================== MAIN ==================
def main():
    parser = argparse.ArgumentParser(
        description="Fetch top movers (min volume), optional max-spread filter, LLM-pick 10, and run chosen Polymarket slugs (NO live checks)."
    )
    parser.add_argument("interval", type=int, help="Interval in minutes (e.g., 5, 10, 30, 60, 1440)")
    parser.add_argument("--target", type=int, default=50, help="Pre-LLM target to collect (used with oversample)")
    parser.add_argument("--batch", type=int, default=50, help="Batch size per request when paginating (default: 50)")
    parser.add_argument("--dump", type=int, default=0, help="Dump the first N filtered JSONs for debugging")
    parser.add_argument("--history-file", type=str, default="logs/topmover_slugs_history.jsonl",
                        help="JSONL file tracking previously used identifiers (slug) with timestamps")
    parser.add_argument("--processed-file", type=str, default=DEFAULT_PROCESSED_FILE,
                        help="Path to processed_markets.json that stores finished ids (slug)")
    parser.add_argument("--analysis-model", type=str, default="gpt-4o-mini", help="Model for the longform reasoning step")
    parser.add_argument("--picker-model", type=str, default="google/gemini-flash-1.5", help="Model for JSON picking step")
    parser.add_argument("--present-min", type=int, default=10, help="Aim to present at least this many items to you")
    parser.add_argument("--oversample", type=int, default=25, help="Multiplier to oversample upstream before checks")
    parser.add_argument("--max-fetch", type=int, default=1000, help="Upper bound for upstream fetch size")
    parser.add_argument("--max-spread", type=float, default=None,
                        help="Max allowed SNAPSHOT spread (decimal 0..1). If set, markets lacking bid/ask snapshot are skipped.")
    args = parser.parse_args()

    # Local JSONL history (7d)
    recent_ids_local = load_recent_ids(args.history_file, days=7)
    print(f"[INFO] Recent ids from local history (7d): {len(recent_ids_local)}")

    # processed_markets.json
    processed_map = _load_processed_map(args.processed_file)
    if processed_map:
        print(f"[INFO] Also skipping processed file ids: {len(processed_map)} (from {args.processed_file})")

    # Union of both (lowercased keys)
    recent_ids: Set[str] = set(recent_ids_local) | set(processed_map.keys())

    print(f"[INFO] Enforcing MIN TOTAL VOLUME: ${MIN_TOTAL_VOLUME_USD:,.0f}")
    if args.max_spread is not None:
        if not (0.0 <= args.max_spread <= 1.0):
            print(f"[ERROR] --max-spread must be a decimal in [0,1]. Got {args.max_spread}.")
            sys.exit(2)
        print(f"[INFO] Enforcing MAX SNAPSHOT SPREAD: ≤ {args.max_spread:.4f}")

    # ---------- Helper to gather until we (try to) reach present_min ----------
    def gather_and_snapshot_filter(effective_need: int) -> List[Dict[str, Any]]:
        print(f"[INFO] Gathering markets until {effective_need} qualify (batch={args.batch}) …")
        qualified = fetch_top_movers_pages(
            interval=args.interval, need=effective_need, batch=args.batch, history_recent=recent_ids, max_pages=200,
        )
        if not qualified:
            print("[INFO] 0 qualified after pagination/filtering.")
            return []

        # Optional: apply max spread filter (decimal)
        kept: List[Dict[str, Any]] = []
        dropped_spread = 0
        for m in qualified:
            if args.max_spread is None:
                kept.append(m)
                continue
            sp = spread_from_snapshot(m)
            if sp is None:
                dropped_spread += 1
                continue
            if sp <= args.max_spread:
                kept.append(m)
            else:
                dropped_spread += 1
        if args.max_spread is not None:
            print(f"[INFO] After MAX SPREAD filter: kept={len(kept)} | dropped_spread={dropped_spread}")
        return kept

    effective_need = min(max(args.target, args.present_min * args.oversample), args.max_fetch)
    kept_live = gather_and_snapshot_filter(effective_need)

    attempts = 0
    while len(kept_live) < args.present_min and effective_need < args.max_fetch:
        attempts += 1
        prev = len(kept_live)
        effective_need = min(args.max_fetch, int(effective_need * 1.8))
        print(f"[WARN] Only {prev} items after checks; escalating fetch size to {effective_need} …")
        kept_live = gather_and_snapshot_filter(effective_need)
        if len(kept_live) <= prev:
            print("[WARN] No improvement after escalation; proceeding with what we have.")
            break

    if not kept_live:
        print("[INFO] 0 markets remain after checks; nothing to analyze.")
        return

    if args.dump > 0:
        to_dump = kept_live[:args.dump]
        print("\n=== RAW DUMP (first {} items post-filter) ===".format(len(to_dump)))
        print(json.dumps(to_dump, indent=2))
        print("=== END RAW DUMP ===\n")

    prompt_markets: List[Dict[str, Any]] = []
    market_index: Dict[str, Dict[str, Any]] = {}

    def _clean_text(s: Optional[str], max_len: int) -> str:
        if s is None:
            return ""
        t = " ".join(str(s).split())
        return (t[:max_len - 3] + "...") if len(t) > max_len else t

    for idx, market in enumerate(kept_live, start=1):
        title = safe_title(market)
        url = market.get("url") or ""
        slug = market_slug(market) or f"item-{idx}"

        market_index[slug.lower()] = market

        subtitle = (market.get("subtitle") or market.get("subTitle") or None)
        description = (market.get("description") or market.get("longDescription") or market.get("desc") or None)

        # Add snapshot spread to JSON for the LLM context (not required, but helpful)
        bb, ba = snapshot_bid_ask(market)
        sp = spread_from_snapshot(market)

        prompt_markets.append({
            "index": idx,
            "slug": slug,
            "url": url,
            "title": _clean_text(title, 400),
            "subtitle": _clean_text(subtitle, 400) if subtitle else "",
            "description": _clean_text(description, 1200) if description else "",
            "exchange": "polymarket",
            "tags": collect_tags(market),
            "snapshot_best_bid": round(bb, 6) if bb is not None else None,
            "snapshot_best_ask": round(ba, 6) if ba is not None else None,
            "snapshot_spread": round(sp, 6) if sp is not None else None,
            "delta_price": compute_price_change(market),
            "total_volume": extract_volume(market),
        })

    structured_json = json.dumps(prompt_markets, ensure_ascii=False, indent=2)
    full_prompt = BASE_PROMPT + "\n\nHere are the filtered markets (SNAPSHOT book included):\n\n" + structured_json

    print("\n--- OpenRouter analysis ({}) ---\n".format(args.analysis_model))
    analysis_text = stream_openrouter(full_prompt, model=args.analysis_model)

    print("\n\n--- Picker JSON Output (top 10 slugs) ---\n")
    mover_lines: List[str] = []
    for market in kept_live:
        slug = market_slug(market) or ""
        bb, ba = snapshot_bid_ask(market)
        sp = spread_from_snapshot(market)
        key_line = f"[polymarket] {safe_title(market)} (SNAPSHOT: bid={bb if bb is not None else 'n/a'}, ask={ba if ba is not None else 'n/a'}, spread={sp if sp is not None else 'n/a'}) — slug={slug or '(none)'}"
        mover_lines.append(key_line)

    json_prompt = (
        "From the filtered markets below and the prior analysis, pick the top 10 distinct items.\n"
        "Return a JSON object with `top10_keys` = list of up to 10 strings.\n"
        "Each string MUST be exactly one of the shown `slug` values.\n"
        "Do NOT invent or transform them; copy verbatim.\n\n"
        f"Filtered list:\n{json.dumps(mover_lines, indent=2)}\n\n"
        f"Prior analysis:\n{analysis_text}"
    )
    json_result_str = openrouter_json_request(json_prompt, model=args.picker_model)
    print(json_result_str)

    try:
        parsed = json.loads(json_result_str)
        top_keys = parsed.get("top10_keys") or []
        if not isinstance(top_keys, list):
            raise ValueError("top10_keys is not a list")

        candidates: List[Dict[str, Any]] = []
        used_lower: Set[str] = set()
        for key in top_keys:
            if not isinstance(key, str) or not key.strip():
                continue
            key_norm = key.strip().lower()
            m = market_index.get(key_norm)
            if not m:
                print(f"[HARD-SKIP] Picker key not in filtered list: {key}")
                continue
            uniq_id = (market_slug(m) or "").lower()
            if uniq_id and uniq_id in used_lower:
                continue
            used_lower.add(uniq_id)
            candidates.append(m)

        # Backfill if the picker returned < 10
        if len(candidates) < 10:
            for market in kept_live:
                if len(candidates) >= 10:
                    break
                uniq_id = (market_slug(market) or "").lower()
                if uniq_id and uniq_id not in used_lower:
                    candidates.append(market)
                    used_lower.add(uniq_id)

        if not candidates:
            print("[INFO] Picker returned 0 valid items; nothing to select.")
            return

        selected_keys = prompt_user_selection(candidates[:10], market_index)

        if not selected_keys:
            print("[INFO] No selections chosen; exiting without running runner.")
            return

        processed_ids: List[str] = []
        try:
            for key in selected_keys:
                if not isinstance(key, str) or not key.strip():
                    continue
                key_norm = key.strip().lower()
                market = market_index.get(key_norm)
                if not market:
                    print(f"[HARD-SKIP] Selected key not in filtered list: {key}")
                    continue

                if has_excluded_tag(market) or is_excluded_by_text(market):
                    print(f"[HARD-SKIP] Excluded by tag/text at dispatch: {key}")
                    continue

                slug = market_slug(market) or key.strip()
                print(f"\n>>> Running {POLYMARKET_RUNNER} for slug: {slug}\n")
                subprocess.run([sys.executable, POLYMARKET_RUNNER, slug], check=True)
                processed_ids.append(slug)
        finally:
            # persist both logs even if a later runner fails
            if processed_ids:
                append_history(args.history_file, processed_ids)          # JSONL log (7d skip)
                _update_processed_map(args.processed_file, processed_ids) # persistent skip file

    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Runner failed (exit {e.returncode}): {e}")
    except Exception as e:
        print(f"[ERROR] Could not parse picker JSON or dispatch runner: {e}")

if __name__ == "__main__":
    main()
