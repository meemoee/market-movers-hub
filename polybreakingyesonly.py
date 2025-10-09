#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
import calendar
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup, Tag

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception as dotenv_exc:  # pragma: no cover - optional convenience
    logging.warning("[env] unable to load .env file err=%s", dotenv_exc)

try:
    from zoneinfo import ZoneInfo
    _TZ_NY = ZoneInfo("America/New_York")
except Exception:
    _TZ_NY = None

# =========================
# Config
# =========================
BREAKING_URL = "https://polymarket.com/breaking"
GAMMA_BASE = "https://gamma-api.polymarket.com"
PORTFOLIO_FILE = "polybreaking_portfolio.json"

# PnL time-series + plot outputs
UPNL_CSV = "polybreaking_unrealized_pnl.csv"
UPNL_PNG = "polybreaking_unrealized_pnl.png"

# Per-position time-series CSV (one row per position per run)
POS_PNL_CSV = "polybreaking_positions_pnl.csv"
POS_PNL_PNG = "polybreaking_positions_pnl.png"  # NEW: per-market PnL over time plot

# Closing schedule file (pure array)
CLOSING_SCHEDULE_JSON = "polybreaking_closing_schedule.json"

TRADE_QTY = 10.0  # base "full size"
SKIP_EXTREME = True  # skip trades with quotes ~0 or ~1

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] polybreaking: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK", "").strip()


def _print_and_log(prefix: str, payload: Any) -> None:
    try:
        serialized = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, indent=2)
    except Exception:
        serialized = str(payload)
    message = f"{prefix}: {serialized}"
    logging.info(message)
    print(message)


def call_openrouter_chat(messages: List[Dict[str, Any]], response_format: Optional[Dict[str, Any]] = None) -> Optional[dict]:
    if not OPENROUTER_API_KEY:
        logging.error("[openrouter] missing OPENROUTER_API_KEY; skipping AI gate")
        return None

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "model": "openai/gpt-5-chat",
        "messages": messages,
    }
    if response_format:
        payload["response_format"] = response_format

    _print_and_log("[openrouter] request", payload)
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        _print_and_log("[openrouter] status", resp.status_code)
        _print_and_log("[openrouter] raw_response", resp.text)
        resp.raise_for_status()
        data = resp.json()
        return data
    except Exception as exc:
        logging.exception("[openrouter] request failed err=%s", exc)
        return None


def extract_message_content(resp: dict) -> Optional[str]:
    try:
        choices = resp.get("choices") or []
        if not choices:
            return None
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            # OpenRouter may return content as list of parts
            return "".join(part.get("text", "") for part in content if isinstance(part, dict))
        return None
    except Exception as exc:
        logging.exception("[openrouter] failed extracting content err=%s", exc)
        return None


def send_discord_notification(slug: str, title: str, price: float, qty: float, analysis: str, market_info: dict) -> None:
    if not DISCORD_WEBHOOK:
        logging.warning("[discord] DISCORD_WEBHOOK not configured; skipping notification")
        return

    content_lines = [
        "**Polybreaking YES Trade Executed**",
        f"Slug: `{slug}`",
        f"Title: {title}",
        f"Price: {price:.4f}",
        f"Quantity: {qty}",
        "",
        "**Market Info (JSON)**",
        f"```json\n{json.dumps(market_info, ensure_ascii=False, indent=2)[:1800]}\n```",
        "",
        "**GPT-5 Analysis**",
        analysis[:1900],
    ]
    payload = {"content": "\n".join(content_lines)}
    _print_and_log("[discord] payload", payload)
    try:
        resp = requests.post(DISCORD_WEBHOOK, json=payload, timeout=30)
        _print_and_log("[discord] status", resp.status_code)
        _print_and_log("[discord] raw_response", resp.text)
        resp.raise_for_status()
    except Exception as exc:
        logging.exception("[discord] notification failed err=%s", exc)


def ai_trade_gate(slug: str, title: str, qty: float, price: float, market_info: dict) -> Tuple[bool, Optional[str]]:
    labelled_market_info = {
        "slug": slug,
        "title": title,
        "intended_trade": {
            "side": "YES",
            "quantity": qty,
            "price": price,
        },
        "market": market_info,
    }

    prompt = (
        "(ALL the market info labelled from the api )+ ACQUIRE live news + rule traps + analogous events with differences going into this one.\n"
        "You are advising on whether to execute a Polymarket YES trade."
        " Provide detailed sections covering live news context, potential rule traps, analogous historical events (with their differences),"
        " and conclude with a clear assessment of whether the YES contract appears undervalued."
        " Cite sources where possible and focus on actionable insights."
        f"\n\nLabelled Market Info:\n{json.dumps(labelled_market_info, ensure_ascii=False, indent=2)}"
    )

    analysis_resp = call_openrouter_chat([
        {"role": "system", "content": "You are a meticulous analyst for prediction market trades."},
        {"role": "user", "content": prompt},
    ])
    if not analysis_resp:
        logging.warning("[ai_gate] analysis response missing; blocking trade slug=%s", slug)
        return False, None

    analysis_text = extract_message_content(analysis_resp)
    if not analysis_text:
        logging.warning("[ai_gate] analysis text missing; blocking trade slug=%s", slug)
        return False, None

    _print_and_log("[ai_gate] analysis_text", analysis_text)

    decision_prompt = (
        "Determine if the provided analysis indicates that the YES outcome is currently undervalued."
        " Respond strictly in JSON mode as {\"undervalued\": \"yes\"} or {\"undervalued\": \"no\"}."
        " Base the decision solely on the analysis narrative, live news, rule traps, and analogous events provided."
        f"\n\nAnalysis:\n{analysis_text}\n\nLabelled Market Info:\n{json.dumps(labelled_market_info, ensure_ascii=False)}"
    )

    decision_resp = call_openrouter_chat(
        [
            {"role": "system", "content": "You must reply with a strict JSON object."},
            {"role": "user", "content": decision_prompt},
        ],
        response_format={"type": "json_object"},
    )
    if not decision_resp:
        logging.warning("[ai_gate] decision response missing; blocking trade slug=%s", slug)
        return False, analysis_text

    decision_text = extract_message_content(decision_resp)
    _print_and_log("[ai_gate] decision_text", decision_text)

    decision_value = None
    try:
        if decision_text:
            parsed = json.loads(decision_text)
        else:
            parsed = decision_resp
        if isinstance(parsed, dict):
            decision_value = str(parsed.get("undervalued", "")).strip().lower()
    except Exception as exc:
        logging.exception("[ai_gate] failed parsing decision err=%s", exc)
        decision_value = None

    if decision_value != "yes":
        logging.info("[ai_gate] decision not yes (value=%s); skipping trade slug=%s", decision_value, slug)
        return False, analysis_text

    logging.info("[ai_gate] approval received for slug=%s", slug)
    return True, analysis_text

# =========================
# Bracket Parameters (YES side only)
# =========================
# New “breaking” ladder (percent-of-entry based)
STOP_PCT_DEFAULT = 0.02    # -2% hard stop (default)
STOP_PCT_ULTRA = 0.025     # optional wiggle for ultra-liquid names
TP1_GAIN_PCT = 0.05        # +5% => scale 33%
TP2_GAIN_PCT = 0.12        # +12% (within 10-13% guidance) => scale another 33%
TP1_TOTAL_SELL_PCT = 0.33
TP2_TOTAL_SELL_PCT = 0.66  # cumulative sold after TP2
TRAIL_STOP_PCT = 0.03      # 3% trailing stop on final runner
ULTRA_LIQUID_SLUGS = {
    slug.strip() for slug in os.getenv("POLYBREAK_ULTRA_SLUGS", "").split(",") if slug.strip()
}
TIME_DECAY_THRESHOLD_PCT = 0.02  # require +2% within window
TIME_DECAY_MIN_S = 30 * 60
TIME_DECAY_MAX_S = 45 * 60
TIME_DECAY_TRIM_STAGE1 = 0.25  # trim 25% if stall at 30m
TIME_DECAY_TRIM_STAGE2 = 0.50  # trim to 50% sold if still stalled at 45m
EPS = 1e-9

# =========================
# Models
# =========================
@dataclass
class Lot:
    """Tracks each add with its own bracket state so partial exits are correct."""
    qty: float
    entry_price: float
    remaining_qty: float
    # Bracket state
    tp1_hit: bool = False
    tp2_hit: bool = False
    tp3_hit: bool = False  # legacy field (unused in new ladder but kept for compatibility)
    trail_active: bool = False
    stop_px: Optional[float] = None  # dynamic stop per specs
    # Accounting/meta
    sold_qty: float = 0.0
    stop_pct: float = STOP_PCT_DEFAULT
    entry_ts: int = 0
    peak_price: float = 0.0
    time_decay_stage: int = 0  # 0 -> none, 1 -> trimmed to 25%, 2 -> trimmed to 50%

@dataclass
class Position:
    slug: str
    title: str
    side: str  # YES only (by spec)
    qty: float
    avg_cost: float
    last_price: float = 0.0
    mtm_value: float = 0.0
    unrealized_pnl: float = 0.0
    # Per-position realized and lots for bracket logic
    realized_pnl_pos: float = 0.0
    lots: List[Lot] = field(default_factory=list)
    # NEW: MFE/MAE tracking per position (relative to entry per-lot)
    mfe: float = 0.0  # max(px - entry) observed across lots
    mae: float = 0.0  # min(px - entry) observed across lots

@dataclass
class Portfolio:
    cash: float = 10000.0
    positions: List[Position] = None
    realized_pnl: float = 0.0
    last_run_ts: int = 0

    def to_json(self) -> dict:
        pos_val = sum(p.mtm_value for p in self.positions)
        return {
            "cash": round(self.cash, 2),
            "positions": [asdict(p) for p in self.positions],
            "realized_pnl": round(self.realized_pnl, 2),
            "positions_value": round(pos_val, 2),
            "equity": round(self.cash + pos_val, 2),
            "last_run_ts": self.last_run_ts,
            "totals": {
                "unrealized_pnl": round(sum(p.unrealized_pnl for p in self.positions), 2),
                "realized_pnl": round(self.realized_pnl, 2),
                "position_count": len(self.positions),
            },
        }

# =========================
# IO – Portfolio
# =========================
def load_portfolio(path: str) -> Portfolio:
    if not os.path.exists(path):
        logging.info("[portfolio] new file")
        return Portfolio(positions=[])
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    positions = []
    for p in data.get("positions", []):
        # Backward-compat: synthesize a single lot if lots missing
        lots_raw = p.get("lots") or []
        lots: List[Lot] = []
        if lots_raw:
            for lr in lots_raw:
                try:
                    lot = Lot(
                        qty=float(lr.get("qty", 0.0)),
                        entry_price=float(lr.get("entry_price", p.get("avg_cost", 0.0))),
                        remaining_qty=float(lr.get("remaining_qty", lr.get("qty", 0.0))),
                        tp1_hit=bool(lr.get("tp1_hit", False)),
                        tp2_hit=bool(lr.get("tp2_hit", False)),
                        tp3_hit=bool(lr.get("tp3_hit", False)),
                        trail_active=bool(lr.get("trail_active", False)),
                        stop_px=float(lr.get("stop_px")) if lr.get("stop_px") is not None else None,
                        sold_qty=float(lr.get("sold_qty", 0.0)),
                        stop_pct=float(lr.get("stop_pct", STOP_PCT_DEFAULT)),
                        entry_ts=int(lr.get("entry_ts", int(time.time()))),
                        peak_price=float(lr.get("peak_price", lr.get("entry_price", p.get("avg_cost", 0.0)))),
                        time_decay_stage=int(lr.get("time_decay_stage", 0)),
                    )
                    if lot.entry_ts <= 0:
                        lot.entry_ts = int(time.time())
                    if lot.stop_pct <= 0:
                        lot.stop_pct = STOP_PCT_DEFAULT
                    if lot.peak_price <= 0:
                        lot.peak_price = lot.entry_price
                    # Re-initialize stop to current spec (percent-based)
                    lot.stop_px = lot.entry_price * (1.0 - lot.stop_pct)
                    if lot.tp1_hit:
                        lot.stop_px = max(lot.stop_px, lot.entry_price)
                    if lot.tp2_hit:
                        lot.trail_active = True
                        lot.peak_price = max(lot.peak_price, lot.entry_price * (1.0 + TP2_GAIN_PCT))
                        lot.stop_px = max(
                            lot.stop_px,
                            lot.entry_price,
                            lot.peak_price * (1.0 - TRAIL_STOP_PCT),
                        )
                    lots.append(lot)
                except Exception as e:
                    logging.warning("[portfolio] lot parse error slug=%s err=%s raw=%r", p.get("slug"), e, lr)
        else:
            # Create a single lot for existing holding
            q = float(p.get("qty", 0.0))
            ac = float(p.get("avg_cost", 0.0))
            if q > 0:
                stop_pct = STOP_PCT_DEFAULT
                lots = [
                    Lot(
                        qty=q,
                        entry_price=ac,
                        remaining_qty=q,
                        stop_px=ac * (1.0 - stop_pct),
                        stop_pct=stop_pct,
                        entry_ts=int(time.time()),
                        peak_price=ac,
                    )
                ]

        positions.append(
            Position(
                slug=p["slug"],
                title=p.get("title", p["slug"]),
                side=p.get("side", "YES"),
                qty=float(p.get("qty", 0.0)),
                avg_cost=float(p.get("avg_cost", 0.0)),
                last_price=float(p.get("last_price", 0.0)),
                mtm_value=float(p.get("mtm_value", 0.0)),
                unrealized_pnl=float(p.get("unrealized_pnl", 0.0)),
                realized_pnl_pos=float(p.get("realized_pnl_pos", 0.0)),
                lots=lots,
                mfe=float(p.get("mfe", 0.0)),
                mae=float(p.get("mae", 0.0)),
            )
        )
    return Portfolio(
        cash=float(data.get("cash", 10000.0)),
        positions=positions,
        realized_pnl=float(data.get("realized_pnl", 0.0)),
        last_run_ts=int(data.get("last_run_ts", 0)),
    )

def save_portfolio(path: str, pf: Portfolio) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(pf.to_json(), f, indent=2)
    logging.info("[portfolio] saved cash=%.2f positions=%d", pf.cash, len(pf.positions))

# =========================
# HTTP
# =========================
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "polybreaking/1.0 (+script)"})

def http_get(url: str, **kwargs) -> requests.Response:
    r = _SESSION.get(url, timeout=20, **kwargs)
    r.raise_for_status()
    return r

# =========================
# Breaking parsing (anchor-first)
# =========================
ANCHOR_RE = re.compile(r"^/event/[^/]+/([^/?#]+)$")

def fetch_breaking_html() -> str:
    r = http_get(BREAKING_URL)
    logging.info("[breaking] fetched bytes=%d status=%d", len(r.content), r.status_code)
    return r.text

def near_text(node: Tag) -> str:
    img = node.find("img", attrs={"alt": True})
    if img and img.get("alt"):
        t = img["alt"].strip()
        if t:
            return t
    t = " ".join(node.stripped_strings)
    if t:
        return t
    parent = node
    for _ in range(2):
        if not parent:
            break
        for p in parent.find_all("p"):
            pt = p.get_text(strip=True)
            if pt:
                return pt
        parent = parent.parent
    return ""

def detect_sign_from_anchor(a: Tag) -> Optional[str]:
    """
    Returns POS/NEG/None based on color/icon heuristics on the breaking page.
    """
    container = a
    for _ in range(4):
        if not container:
            break
        for svg in container.find_all("svg"):
            svgc = " ".join(svg.get("class", [])) if svg.get("class") else ""
            candidates = [svg, svg.parent, getattr(svg.parent, "parent", None)]

            def has_color(node, color):
                return node is not None and node.get("class") and any(color in c for c in node.get("class"))

            is_green = any(has_color(n, "text-green") for n in candidates)
            is_red = any(has_color(n, "text-red") for n in candidates)
            if is_green and "-rotate-45" in svgc:
                return "POS"
            if is_red and "rotate-45" in svgc and "-rotate-45" not in svgc:
                return "NEG"
        container = container.parent

    container = a
    for _ in range(3):
        if not container:
            break
        any_green = any("text-green" in " ".join(n.get("class", [])) for n in container.find_all(True) if n.get("class"))
        any_red = any("text-red" in " ".join(n.get("class", [])) for n in container.find_all(True) if n.get("class"))
        if any_green and not any_red:
            return "POS"
        if any_red and not any_green:
            return "NEG"
        container = container.parent
    return None

def parse_breaking(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    items: List[Dict[str, str]] = []
    seen: set = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        m = ANCHOR_RE.match(href)
        if not m:
            continue
        slug = m.group(1)
        if not slug or slug in seen:
            continue
        title = near_text(a) or slug.replace("-", " ")
        sign = detect_sign_from_anchor(a)  # POS / NEG / None

        items.append({"slug": slug, "title": title, "sign": sign})
        seen.add(slug)

    logging.info("[breaking] parsed=%d", len(items))
    return items

# =========================
# Gamma market lookup & quotes (hardened)
# =========================
def _to_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None

def fetch_market_by_slug(slug: str) -> Optional[dict]:
    try:
        r = http_get(f"{GAMMA_BASE}/markets", params={"slug": slug})
        arr = r.json()
        if isinstance(arr, list) and arr:
            return arr[0]
        logging.warning("[gamma] not found slug=%s", slug)
        return None
    except Exception as e:
        logging.warning("[gamma] error slug=%s err=%s", slug, e)
        return None

def is_active_market(mkt: dict) -> bool:
    if mkt is None:
        return False
    active = mkt.get("active")
    if isinstance(active, bool):
        return active
    status = (mkt.get("status") or "").lower()
    if status:
        return status in ("active", "open", "trading")
    return True

def yes_no_quotes(mkt: dict) -> Optional[Tuple[float, float]]:
    yp = _to_float(mkt.get("yesPrice"))
    np = _to_float(mkt.get("noPrice"))
    if yp is not None or np is not None:
        if yp is None and np is not None: yp = 1.0 - np
        if np is None and yp is not None: np = 1.0 - yp
        if yp is not None and np is not None:
            return (max(0.0, min(1.0, yp)), max(0.0, min(1.0, np)))

    op = mkt.get("outcomePrices")
    if isinstance(op, dict):
        yp = _to_float(op.get("Yes") or op.get("YES"))
        np = _to_float(op.get("No") or op.get("NO"))
        if yp is not None or np is not None:
            if yp is None and np is not None: yp = 1.0 - np
            if np is None and yp is not None: np = 1.0 - yp
            if yp is not None and np is not None:
                return (max(0.0, min(1.0, yp)), max(0.0, min(1.0, np)))

    outs = mkt.get("outcomes")
    if isinstance(outs, dict):
        yv = outs.get("Yes", outs.get("YES"))
        nv = outs.get("No", outs.get("NO"))
        yp = _to_float(yv.get("price") if isinstance(yv, dict) else yv)
        np = _to_float(nv.get("price") if isinstance(nv, dict) else nv)
        if yp is not None or np is not None:
            if yp is None and np is not None: yp = 1.0 - np
            if np is None and yp is not None: np = 1.0 - yp
            if yp is not None and np is not None:
                return (max(0.0, min(1.0, yp)), max(0.0, min(1.0, np)))
    elif isinstance(outs, list):
        yes_px = None
        no_px = None
        if outs and all(isinstance(o, str) for o in outs):
            prices = mkt.get("prices") or []
            if isinstance(prices, list) and len(prices) == len(outs):
                for name, px in zip(outs, prices):
                    nm = str(name).strip().upper()
                    v = _to_float(px)
                    if nm in ("YES", "Y"): yes_px = v
                    elif nm in ("NO", "N"): no_px = v
        for o in outs:
            if not isinstance(o, dict):
                continue
            nm = str(o.get("name") or o.get("outcome") or o.get("ticker") or "").strip().upper()
            v = _to_float(o.get("price")) or _to_float(o.get("lastPrice")) or _to_float(o.get("value"))
            if v is None:
                bid = _to_float(o.get("bestBid") or o.get("bid"))
                ask = _to_float(o.get("bestAsk") or o.get("ask"))
                if bid is not None and ask is not None:
                    v = (bid + ask) / 2.0
            if nm in ("YES", "Y") and v is not None: yes_px = v
            if nm in ("NO", "N") and v is not None:  no_px = v
        if yes_px is not None and no_px is None: no_px = 1.0 - yes_px
        if no_px is not None and yes_px is None: yes_px = 1.0 - no_px
        if yes_px is not None and no_px is not None:
            return (max(0.0, min(1.0, yes_px)), max(0.0, min(1.0, no_px)))

    bid = _to_float(mkt.get("bestBid") or mkt.get("bid"))
    ask = _to_float(mkt.get("bestAsk") or mkt.get("ask"))
    if bid is not None and ask is not None:
        mid = max(0.0, min(1.0, (bid + ask) / 2.0))
        return (mid, 1.0 - mid)

    return None

# =========================
# CSV util
# =========================
def ensure_parent_dir(path: str) -> None:
    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)

# =========================
# PnL Time-Series + Plot (equity)
# =========================
def append_upnl_csv(csv_path: str, pf_snapshot: dict) -> None:
    header = [
        "ts_iso","ts_unix","equity","cash","positions_value",
        "unrealized_pnl_total","realized_pnl","position_count",
    ]
    row = [
        datetime.utcfromtimestamp(pf_snapshot["last_run_ts"]).isoformat() + "Z",
        pf_snapshot["last_run_ts"],
        pf_snapshot["equity"],
        pf_snapshot["cash"],
        pf_snapshot["positions_value"],
        pf_snapshot["totals"]["unrealized_pnl"],
        pf_snapshot["totals"]["realized_pnl"],
        pf_snapshot["totals"]["position_count"],
    ]
    ensure_parent_dir(csv_path)
    write_header = not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0
    try:
        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if write_header:
                w.writerow(header)
                logging.info("[pnl] csv header written path=%s", csv_path)
            w.writerow(row)
        logging.info(
            "[pnl] appended ts=%s equity=%.2f cash=%.2f pos_val=%.2f upnl=%.2f realized=%.2f npos=%d path=%s",
            row[0], row[2], row[3], row[4], row[5], row[6], row[7], csv_path
        )
    except Exception as e:
        logging.exception("[pnl] failed to append csv path=%s err=%s", csv_path, e)

# =========================
# Per-position PnL CSV + Plot
# =========================
def append_positions_pnl_csv(csv_path: str, pf: Portfolio) -> None:
    """
    Append one row per position with both unrealized and realized PnL for that position.
    Includes MFE/MAE per position.
    """
    header = [
        "ts_iso","ts_unix","slug","title","side",
        "qty","avg_cost","last_price","mtm_value",
        "unrealized_pnl","realized_pnl_pos","portfolio_realized_pnl",
        "mfe","mae","pnl_total"
    ]
    ensure_parent_dir(csv_path)
    write_header = not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0
    try:
        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if write_header:
                w.writerow(header)
                logging.info("[pos_pnl] csv header written path=%s", csv_path)
            ts_iso = datetime.utcfromtimestamp(pf.last_run_ts).isoformat() + "Z"
            for p in pf.positions:
                pnl_total = round(p.unrealized_pnl + p.realized_pnl_pos, 6)
                w.writerow([
                    ts_iso,
                    pf.last_run_ts,
                    p.slug,
                    p.title,
                    p.side,
                    p.qty,
                    p.avg_cost,
                    p.last_price,
                    p.mtm_value,
                    p.unrealized_pnl,
                    round(p.realized_pnl_pos, 6),
                    round(pf.realized_pnl, 6),
                    round(p.mfe, 6),
                    round(p.mae, 6),
                    pnl_total
                ])
        logging.info("[pos_pnl] appended rows=%d path=%s", len(pf.positions), csv_path)
    except Exception as e:
        logging.exception("[pos_pnl] failed to append csv path=%s err=%s", csv_path, e)

def save_upnl_plot(csv_path: str, img_path: str) -> None:
    """
    Plot OVERALL ACCOUNT EQUITY over TRUE time — x-axis spacing reflects real elapsed time.
    """
    try:
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
    except Exception as e:
        logging.warning("[plot] matplotlib not available, skipping graph save err=%s", e)
        return

    if not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0:
        logging.warning("[plot] csv missing or empty, skip plot path=%s", csv_path)
        return

    points: List[Tuple[int, float, str]] = []
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            r = csv.DictReader(f)
            for row in r:
                try:
                    tsu = int(float(row.get("ts_unix"))) if row.get("ts_unix") not in (None, "") else None
                    eq = float(row.get("equity")) if row.get("equity") not in (None, "") else None
                    tsi = row.get("ts_iso") or ""
                    if tsu is None or eq is None:
                        logging.debug("[plot] skip row missing ts_unix/equity | row=%r", row)
                        continue
                    points.append((tsu, eq, tsi))
                except Exception as ie:
                    logging.debug("[plot] skip row parse error row=%r err=%s", row, ie)
                    continue
    except Exception as e:
        logging.exception("[plot] failed reading csv path=%s err=%s", csv_path, e)
        return

    if not points:
        logging.warning("[plot] no data points found, skipping plot")
        return

    points.sort(key=lambda t: t[0])

    ts_unix = [p[0] for p in points]
    equity = [p[1] for p in points]

    first_ts = ts_unix[0]
    last_ts = ts_unix[-1]
    span_sec = max(0, last_ts - first_ts)
    span_hours = span_sec / 3600.0
    span_days = span_sec / 86400.0

    logging.info(
        "[plot] points=%d first=%s (%d) last=%s (%d) span_sec=%d span_hours=%.3f span_days=%.3f",
        len(points),
        datetime.utcfromtimestamp(first_ts).isoformat() + "Z", first_ts,
        datetime.utcfromtimestamp(last_ts).isoformat() + "Z", last_ts,
        span_sec, span_hours, span_days
    )

    x_datetimes = [datetime.utcfromtimestamp(t) for t in ts_unix]

    try:
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
        plt.figure(figsize=(10, 4.5))
        ax = plt.gca()

        ax.plot(x_datetimes, equity, marker="o", linewidth=2)
        ax.set_title("Account Equity Over Time")
        ax.set_xlabel("Time (UTC)")
        ax.set_ylabel("Equity")

        # Locators/formatters
        major_locator = None
        minor_locator = None
        major_formatter = mdates.DateFormatter("%Y-%m-%d\n%H:%M UTC")

        if span_hours <= 6:
            major_locator = mdates.MinuteLocator(interval=10)
            minor_locator = mdates.MinuteLocator(interval=2)
            chosen = "10-min major / 2-min minor"
        elif span_hours <= 24:
            major_locator = mdates.HourLocator(interval=2)
            minor_locator = mdates.MinuteLocator(interval=30)
            chosen = "2-hr major / 30-min minor"
        elif span_days <= 7:
            major_locator = mdates.DayLocator(interval=1)
            minor_locator = mdates.HourLocator(interval=6)
            chosen = "daily major / 6-hr minor"
        elif span_days <= 31:
            major_locator = mdates.DayLocator(interval=2)
            minor_locator = mdates.DayLocator(interval=1)
            chosen = "2-day major / daily minor"
        else:
            major_locator = mdates.WeekdayLocator(byweekday=mdates.MO, interval=1)
            minor_locator = mdates.DayLocator(interval=1)
            chosen = "weekly major (Mon) / daily minor"

        logging.info("[plot] locator_choice=%s", chosen)

        ax.xaxis.set_major_locator(major_locator)
        if minor_locator is not None:
            ax.xaxis.set_minor_locator(minor_locator)
        ax.xaxis.set_major_formatter(major_formatter)
        plt.setp(ax.get_xticklabels(), rotation=30, ha="right")

        plt.tight_layout()
        ensure_parent_dir(img_path)
        plt.savefig(img_path, dpi=150)
        plt.close()

        logging.info("[plot] saved img=%s points=%d last_equity=%.2f", img_path, len(equity), equity[-1])
    except Exception as e:
        logging.exception("[plot] save failed img=%s err=%s", img_path, e)

def save_positions_pnl_plot(csv_path: str, img_path: str) -> None:
    """
    NEW: Plot each market's total PnL over time (line per slug).
    Uses POS_PNL_CSV with 'pnl_total' column (realized_pnl_pos + unrealized_pnl).
    """
    try:
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
    except Exception as e:
        logging.warning("[plot2] matplotlib not available, skipping per-market pnl plot err=%s", e)
        return

    if not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0:
        logging.warning("[plot2] csv missing or empty, skip plot path=%s", csv_path)
        return

    # Gather series by slug
    series: Dict[str, List[Tuple[int, float]]] = {}
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            r = csv.DictReader(f)
            for row in r:
                try:
                    tsu = int(float(row.get("ts_unix"))) if row.get("ts_unix") not in (None, "") else None
                    slug = row.get("slug") or ""
                    pnl_total = float(row.get("pnl_total")) if row.get("pnl_total") not in (None, "") else None
                    if tsu is None or pnl_total is None or not slug:
                        continue
                    series.setdefault(slug, []).append((tsu, pnl_total))
                except Exception as ie:
                    logging.debug("[plot2] skip row parse error row=%r err=%s", row, ie)
                    continue
    except Exception as e:
        logging.exception("[plot2] failed reading csv path=%s err=%s", csv_path, e)
        return

    if not series:
        logging.warning("[plot2] no series to plot from %s", csv_path)
        return

    try:
        plt.figure(figsize=(11, 6))
        ax = plt.gca()
        for slug, pts in series.items():
            pts.sort(key=lambda t: t[0])
            x = [datetime.utcfromtimestamp(t[0]) for t in pts]
            y = [t[1] for t in pts]
            ax.plot(x, y, linewidth=1.8, label=slug)

        ax.set_title("Per-Market PnL Over Time (realized + unrealized)")
        ax.set_xlabel("Time (UTC)")
        ax.set_ylabel("PnL")

        ax.xaxis.set_major_locator(mdates.AutoDateLocator())
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d\n%H:%M"))
        plt.setp(ax.get_xticklabels(), rotation=30, ha="right")

        # Legend may be long; place outside with tight layout
        ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), frameon=False)
        plt.tight_layout()
        ensure_parent_dir(img_path)
        plt.savefig(img_path, dpi=150, bbox_inches="tight")
        plt.close()
        logging.info("[plot2] saved img=%s series=%d", img_path, len(series))
    except Exception as e:
        logging.exception("[plot2] save failed img=%s err=%s", img_path, e)

# =========================
# End-date extraction (tranche-aware, deterministic)
# =========================
_END_KEYS = [
    "endDate","endTime","endTs","end_date","end_time","end_ts",
    "closeTime","closeDate","closeTs","close_time","close_date","close_ts",
    "resolutionTime","resolutionDate","resolveTime","resolve_time","resolve_date",
    "expiryTime","expiryDate","expireTime","expireDate",
    "endDateISO","endDateIso","closeDateISO","resolutionDateISO",
]

_ISO_PATTERNS = [
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%d %H:%M:%S%z",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
]

_MONTHS = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12
}

def _parse_epochish(v: Any) -> Optional[int]:
    try:
        n = int(v)
        if n > 10**12:
            return n // 10**6
        if n > 10**11:
            return n // 1000
        if n > 10**9:
            return n
        if 0 < n < 10**9:
            return n
    except Exception:
        return None
    return None

def _parse_iso_any(s: str) -> Optional[int]:
    if not s:
        return None
    s = s.strip()
    s_norm = s.replace("Z", "+00:00") if s.endswith("Z") and "+" not in s else s
    try:
        dt = datetime.fromisoformat(s_norm)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        pass
    for pat in _ISO_PATTERNS:
        try:
            if pat.endswith("%z"):
                dt = datetime.strptime(s, pat)
            else:
                dt = datetime.strptime(s, pat).replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except Exception:
            continue
    return None

def _collect_end_candidates(obj: dict, label: str) -> List[Tuple[str, int, str]]:
    rows: List[Tuple[str, int, str]] = []
    for k in _END_KEYS:
        if k in obj and obj[k] is not None:
            v = obj[k]
            ts = _parse_epochish(v)
            if ts is None and isinstance(v, str):
                ts = _parse_iso_any(v)
            if ts is not None:
                iso = datetime.utcfromtimestamp(ts).isoformat() + "Z"
                logging.info("[enddate] %s-candidate key=%s raw=%r ts=%d iso=%s", label, k, v, ts, iso)
                rows.append((f"{label}.{k}", ts, iso))
    return rows

def _collect_event_candidates(evt_obj: Any) -> List[Tuple[str, int, str]]:
    cands: List[Tuple[str, int, str]] = []
    if isinstance(evt_obj, dict):
        cands.extend(_collect_end_candidates(evt_obj, "event"))
    elif isinstance(evt_obj, list):
        for i, item in enumerate(evt_obj):
            if isinstance(item, dict):
                for lab, ts, iso in _collect_end_candidates(item, f"event[{i}]"):
                    cands.append((lab, ts, iso))
    return cands

def _et_to_utc_ts(year:int, month:int, day:int, hour:int, minute:int) -> Optional[int]:
    try:
        if _TZ_NY is not None:
            dt_et = datetime(year, month, day, hour, minute, 0, tzinfo=_TZ_NY)
            ts = int(dt_et.astimezone(timezone.utc).timestamp())
            logging.info("[enddate] et_to_utc ok | year=%d month=%d day=%d hour=%d min=%d tz=NY->UTC ts=%d iso=%s",
                         year, month, day, hour, minute, ts, datetime.utcfromtimestamp(ts).isoformat()+"Z")
            return ts
        dt_utc = datetime(year, month, day, hour + 5, minute, 0, tzinfo=timezone.utc)
        ts = int(dt_utc.timestamp())
        logging.warning("[enddate] ZoneInfo missing; approximating ET→UTC as +5h | %04d-%02d-%02d %02d:%02d ET -> ts=%d iso=%s",
                        year, month, day, hour, minute, ts, datetime.utcfromtimestamp(ts).isoformat()+"Z")
        return ts
    except ValueError as ve:
        logging.error("[enddate] INVALID DATE in et_to_utc | year=%d month=%d day=%d hour=%d min=%d err=%s",
                      year, month, day, hour, minute, ve)
        return None
    except Exception as e:
        logging.exception("[enddate] unexpected error in et_to_utc | year=%d month=%d day=%d hour=%d min=%d err=%s",
                          year, month, day, hour, minute, e)
        return None

def _year_hint_from_event(events_obj: Any) -> Optional[int]:
    rows = _collect_event_candidates(events_obj)
    if rows:
        _, ts, _ = max(rows, key=lambda r: r[1])
        return datetime.utcfromtimestamp(ts).year
    return None

def _candidate_from_group_item(mkt: dict, events_obj: Any, title: str, description: str) -> Optional[Tuple[str, int, str]]:
    name = (mkt.get("groupItemTitle") or mkt.get("groupItem") or "").strip()
    if not name:
        return None

    raw_name_for_logs = name
    parts = re.split(r"\s+", name)
    if not parts:
        return None

    mon_s = parts[0].strip(", ").lower()
    if mon_s not in _MONTHS:
        return None

    day = None
    if len(parts) > 1:
        try:
            day = int(re.sub(r"[^\d]", "", parts[1]))
        except Exception:
            day = None
    if day is None:
        return None

    month = _MONTHS[mon_s]

    year_hint = _year_hint_from_event(events_obj)
    if year_hint is None:
        y_m = re.search(r"\b(20\d{2})\b", f"{title} {description}")
        if y_m:
            year_hint = int(y_m.group(1))
    if year_hint is None:
        year_hint = datetime.utcnow().year

    try:
        last_day = calendar.monthrange(year_hint, month)[1]
    except Exception as e:
        logging.exception("[enddate] monthrange error | name=%r year=%d month=%d day=%r err=%s",
                          raw_name_for_logs, year_hint, month, day, e)
        return None

    if not (1 <= day <= last_day):
        logging.error(
            "[enddate] INVALID tranche day for month | groupItemTitle=%r -> year=%d month=%d day=%d (max=%d) | "
            "SKIP tranche and fallback to event/market candidates",
            raw_name_for_logs, year_hint, month, day, last_day
        )
        return None

    ts = _et_to_utc_ts(year_hint, month, day, 23, 59)
    if ts is None:
        logging.error(
            "[enddate] FAILED to build tranche timestamp after validation | groupItemTitle=%r -> year=%d month=%d day=%d 23:59 ET",
            raw_name_for_logs, year_hint, month, day
        )
        return None

    iso = datetime.utcfromtimestamp(ts).isoformat() + "Z"
    logging.info(
        "[enddate] tranche from groupItemTitle=%r -> %04d-%02d-%02d 23:59 ET -> ts=%d iso=%s",
        raw_name_for_logs, year_hint, month, day, ts, iso
    )
    return ("tranche.groupItemTitle", ts, iso)

def extract_end_ts_iso(mkt: Optional[dict]) -> Tuple[Optional[int], Optional[str]]:
    if not isinstance(mkt, dict):
        return (None, None)

    title = (mkt.get("question") or mkt.get("title") or "") or ""
    description = mkt.get("description") or ""

    market_rows = _collect_end_candidates(mkt, "market")
    evt = mkt.get("events") if "events" in mkt else mkt.get("event")
    event_rows = _collect_event_candidates(evt) if evt is not None else []

    tranche = _candidate_from_group_item(mkt, evt, title, description)
    if tranche:
        source, ts, iso = tranche
        if ts < int(time.time()):
            logging.warning("[enddate] chosen(tranche) is in the past ts=%d iso=%s slug=%s source=%s",
                            ts, iso, mkt.get("slug") or mkt.get("id") or "?", source)
        logging.info("[enddate] chosen source=%s ts=%d iso=%s slug=%s", source, ts, iso, mkt.get("slug") or mkt.get("id") or "?")
        return (ts, iso)

    if event_rows:
        key, ts, iso = max(event_rows, key=lambda r: r[1])
        if ts < int(time.time()):
            logging.warning("[enddate] chosen(event) is in the past ts=%d iso=%s slug=%s key=%s",
                            ts, iso, mkt.get("slug") or mkt.get("id") or "?", key)
        logging.info("[enddate] chosen key=%s ts=%d iso=%s slug=%s", key, ts, iso, mkt.get("slug") or mkt.get("id") or "?")
        return (ts, iso)

    if market_rows:
        key, ts, iso = max(market_rows, key=lambda r: r[1])
        if ts < int(time.time()):
            logging.warning("[enddate] chosen(market) is in the past ts=%d iso=%s slug=%s key=%s",
                            ts, iso, mkt.get("slug") or mkt.get("id") or "?", key)
        logging.info("[enddate] chosen key=%s ts=%d iso=%s", key, ts, iso)
        return (ts, iso)

    logging.info("[enddate] no candidates found slug=%s", mkt.get("slug") or mkt.get("id") or "?")
    return (None, None)

# =========================
# Trading + MTM
# =========================
def find_position(pf: Portfolio, slug: str, side: str) -> Optional[Position]:
    for p in pf.positions:
        if p.slug == slug and p.side == side:
            return p
    return None

def _recompute_avg_cost_from_lots(p: Position) -> None:
    total_qty = sum(l.remaining_qty for l in p.lots)
    if total_qty <= 0:
        p.avg_cost = 0.0
        p.qty = 0.0
        return
    wsum = sum(l.entry_price * l.remaining_qty for l in p.lots)
    p.avg_cost = wsum / total_qty
    p.qty = total_qty

def _add_lot(p: Position, trade_qty: float, trade_price: float) -> None:
    stop_pct = STOP_PCT_ULTRA if p.slug in ULTRA_LIQUID_SLUGS else STOP_PCT_DEFAULT
    lot = Lot(
        qty=trade_qty,
        entry_price=trade_price,
        remaining_qty=trade_qty,
        tp1_hit=False,
        tp2_hit=False,
        tp3_hit=False,
        trail_active=False,
        stop_px=trade_price * (1.0 - stop_pct),
        sold_qty=0.0,
        stop_pct=stop_pct,
        entry_ts=int(time.time()),
        peak_price=trade_price,
        time_decay_stage=0,
    )
    p.lots.append(lot)
    _recompute_avg_cost_from_lots(p)

def add_or_update_position(pf: Portfolio, slug: str, title: str, side: str, trade_qty: float, trade_price: float):
    cost = trade_qty * trade_price
    pf.cash = round(pf.cash - cost, 2)

    pos = find_position(pf, slug, side)
    if pos is None:
        pos = Position(slug=slug, title=title, side=side, qty=0.0, avg_cost=0.0)
        if pf.positions is None:
            pf.positions = []
        pf.positions.append(pos)

    _add_lot(pos, trade_qty, trade_price)

    logging.info(
        "[trade] BUY %-3s %-80s qty=%g @ %.4f cash=%.2f | lots=%d avg_cost=%.4f qty_total=%.4f",
        side, slug, trade_qty, trade_price, pf.cash, len(pos.lots), pos.avg_cost, pos.qty
    )

def mark_to_market(pf: Portfolio, quotes_by_slug: Dict[str, Tuple[float, float]]):
    for p in pf.positions:
        q = quotes_by_slug.get(p.slug)
        if not q:
            continue
        yes_px, no_px = q
        px = yes_px  # YES-only strategy
        p.last_price = px
        p.mtm_value = round(p.qty * px, 2)
        p.unrealized_pnl = round(sum((px - l.entry_price) * l.remaining_qty for l in p.lots), 6)

def update_mfe_mae(pf: Portfolio, quotes_by_slug: Dict[str, Tuple[float, float]]) -> None:
    """
    Update per-position MFE/MAE given current quotes.
    MFE = max over runs of (px - entry); MAE = min over runs of (px - entry).
    Uses the most favorable/adverse across the lots to set position-level MFE/MAE.
    """
    for p in pf.positions:
        q = quotes_by_slug.get(p.slug)
        if not q:
            continue
        px = q[0]  # YES price
        # compute excursions per-lot
        lot_excs = [(px - l.entry_price) for l in p.lots if l.remaining_qty > 0 or l.sold_qty > 0]
        if not lot_excs:
            continue
        current_max = max(lot_excs)
        current_min = min(lot_excs)
        # initialize on first run
        if p.last_price == 0.0 and p.mfe == 0.0 and p.mae == 0.0:
            p.mfe = current_max
            p.mae = current_min
        else:
            p.mfe = max(p.mfe, current_max)
            p.mae = min(p.mae, current_min)
        logging.info("[mfe/mae] slug=%s px=%.4f max_exc=%.4f min_exc=%.4f MFE=%.4f MAE=%.4f",
                     p.slug, px, current_max, current_min, p.mfe, p.mae)

# =========================
# Bracket processing (YES-only, Stops/TPs with trailing)
# =========================
def _sell_from_lot(pf: Portfolio, p: Position, lot: Lot, sell_qty: float, exec_px: float, reason: str) -> None:
    """
    Execute a deterministic sale from a lot at exec_px.
    """
    sell_qty = max(0.0, min(sell_qty, lot.remaining_qty))
    if sell_qty <= EPS:
        return
    proceeds = sell_qty * exec_px
    pnl = (exec_px - lot.entry_price) * sell_qty

    lot.remaining_qty -= sell_qty
    lot.sold_qty += sell_qty
    pf.cash = round(pf.cash + proceeds, 2)
    p.realized_pnl_pos = round(p.realized_pnl_pos + pnl, 6)
    pf.realized_pnl = round(pf.realized_pnl + pnl, 6)

    logging.info(
        "[exec] %s | slug=%s entry=%.4f exec=%.4f sell_qty=%.6f rem_after=%.6f proceeds=%.4f pnl=%.6f cash=%.2f",
        reason, p.slug, lot.entry_price, exec_px, sell_qty, lot.remaining_qty, proceeds, pnl, pf.cash
    )

def process_brackets(pf: Portfolio, quotes_by_slug: Dict[str, Tuple[float, float]]):
    """
    YES-only bracket system:

    - Initial hard stop: entry * (1 - stop_pct) where stop_pct defaults to 2% (or 2.5% if
      slug marked ultra-liquid via POLYBREAK_ULTRA_SLUGS)
    - TP1: entry * (1 + 5%) => scale to 33% of original size sold, move stop to breakeven
    - TP2: entry * (1 + 12%) => scale to 66% of original size sold, enable runner with 3% trailing stop
    - Trailing: once active, trail remaining quantity with 3% stop from peak (never below entry)
    - Time-decay kicker: if price never prints +2% within 30-45 minutes, trim to 25-50% sold

    All executions happen at the exact trigger price, not current price, to keep deterministic accounting.
    """
    for p in pf.positions:
        q = quotes_by_slug.get(p.slug)
        if not q:
            logging.debug("[bracket] no quote slug=%s", p.slug)
            continue
        px = q[0]  # YES price
        for idx, lot in enumerate(p.lots):
            if lot.remaining_qty <= EPS:
                continue

            # Compute key price levels for this lot
            entry = lot.entry_price
            stop_pct = lot.stop_pct or STOP_PCT_DEFAULT
            lvl_stop_initial = entry * (1.0 - stop_pct)
            lvl_tp1 = entry * (1.0 + TP1_GAIN_PCT)
            lvl_tp2 = entry * (1.0 + TP2_GAIN_PCT)

            # Ensure stop_px initialized
            if lot.stop_px is None:
                lot.stop_px = lvl_stop_initial
            else:
                lot.stop_px = max(lot.stop_px, lvl_stop_initial)

            # Update peak tracking for trailing + decay logic
            lot.peak_price = max(lot.peak_price, px)

            # Time-decay trim if price failed to extend
            if lot.remaining_qty > EPS:
                now_ts = int(time.time())
                if lot.entry_ts <= 0:
                    lot.entry_ts = now_ts
                elapsed = now_ts - lot.entry_ts
                threshold_px = entry * (1.0 + TIME_DECAY_THRESHOLD_PCT)
                met_threshold = lot.peak_price >= threshold_px - EPS

                if not met_threshold:
                    if lot.time_decay_stage == 0 and elapsed >= TIME_DECAY_MIN_S:
                        target_sold = lot.qty * TIME_DECAY_TRIM_STAGE1
                        need_to_sell = max(0.0, target_sold - lot.sold_qty)
                        if need_to_sell > EPS:
                            _sell_from_lot(
                                pf,
                                p,
                                lot,
                                need_to_sell,
                                px,
                                f"TIME DECAY TRIM30 (lot_idx={idx})",
                            )
                        lot.time_decay_stage = 1
                    if lot.time_decay_stage < 2 and elapsed >= TIME_DECAY_MAX_S:
                        target_sold = lot.qty * TIME_DECAY_TRIM_STAGE2
                        need_to_sell = max(0.0, target_sold - lot.sold_qty)
                        if need_to_sell > EPS:
                            _sell_from_lot(
                                pf,
                                p,
                                lot,
                                need_to_sell,
                                px,
                                f"TIME DECAY TRIM45 (lot_idx={idx})",
                            )
                        lot.time_decay_stage = 2

            # 1) Upward triggers (TP1/TP2/TP3)
            # We process upward first so stops can be advanced appropriately.
            # TP1
            if not lot.tp1_hit and px >= lvl_tp1 - EPS:
                target_sold = lot.qty * TP1_TOTAL_SELL_PCT
                need_to_sell = max(0.0, target_sold - lot.sold_qty)
                if need_to_sell > EPS:
                    _sell_from_lot(pf, p, lot, need_to_sell, lvl_tp1, f"TP1 HIT (lot_idx={idx})")
                lot.tp1_hit = True
                # Move stop to breakeven
                old_stop = lot.stop_px
                lot.stop_px = max(lot.stop_px or -1.0, entry)
                logging.info(
                    "[bracket] TP1->move stop | slug=%s lot=%d old_stop=%.4f new_stop=%.4f",
                    p.slug, idx, old_stop if old_stop is not None else float("nan"), lot.stop_px
                )

            # TP2
            if lot.tp1_hit and not lot.tp2_hit and px >= lvl_tp2 - EPS:
                target_sold = lot.qty * TP2_TOTAL_SELL_PCT  # 66% total
                need_to_sell = max(0.0, target_sold - lot.sold_qty)
                if need_to_sell > EPS:
                    _sell_from_lot(pf, p, lot, need_to_sell, lvl_tp2, f"TP2 HIT (lot_idx={idx})")
                lot.tp2_hit = True
                lot.trail_active = True
                # Initialize trailing stop with current peak
                lot.peak_price = max(lot.peak_price, px, lvl_tp2)
                old_stop = lot.stop_px
                desired_stop = max(entry, lot.peak_price * (1.0 - TRAIL_STOP_PCT))
                lot.stop_px = max(lot.stop_px or -1.0, desired_stop)
                logging.info(
                    "[bracket] TP2->trail | slug=%s lot=%d old_stop=%.4f new_stop=%.4f peak=%.4f",
                    p.slug,
                    idx,
                    old_stop if old_stop is not None else float("nan"),
                    lot.stop_px,
                    lot.peak_price,
                )

            # 2) Trailing stop update (if active after TP3)
            if lot.trail_active and lot.remaining_qty > EPS:
                lot.peak_price = max(lot.peak_price, px)
                desired_trail_stop = max(entry, lot.peak_price * (1.0 - TRAIL_STOP_PCT))
                if lot.stop_px is None or desired_trail_stop > lot.stop_px + EPS:
                    old_stop = lot.stop_px
                    lot.stop_px = desired_trail_stop
                    logging.info(
                        "[bracket] TRAIL update | slug=%s lot=%d old_stop=%.4f new_stop=%.4f px=%.4f",
                        p.slug, idx, old_stop if old_stop is not None else float("nan"), lot.stop_px, px
                    )

            # 3) Downward stop check (may be initial, moved to BE, moved to TP1, or trailing)
            if lot.stop_px is not None and px <= lot.stop_px + EPS and lot.remaining_qty > EPS:
                # Execute FULL remaining at stop_px
                _sell_from_lot(pf, p, lot, lot.remaining_qty, lot.stop_px, f"STOP HIT (lot_idx={idx})")
                # After stop-flat, recompute aggregates
                _recompute_avg_cost_from_lots(p)

        # After lot loop, recompute aggregates for this position
        _recompute_avg_cost_from_lots(p)

# =========================
# Closing schedule builder + saver
# =========================
def build_closing_schedule(positions: List[Position],
                           markets_cache: Dict[str, dict]) -> List[Dict[str, Any]]:
    now_ts = int(time.time())
    rows: List[Dict[str, Any]] = []
    for p in positions:
        mkt = markets_cache.get(p.slug)
        if not mkt:
            mkt = fetch_market_by_slug(p.slug)
            if mkt:
                markets_cache[p.slug] = mkt
        end_ts, end_iso = extract_end_ts_iso(mkt)
        delta = None
        if end_ts is not None:
            delta = end_ts - now_ts
        row = {
            "slug": p.slug,
            "title": p.title,
            "side": p.side,
            "qty": p.qty,
            "avg_cost": round(p.avg_cost, 6),
            "end_ts": end_ts,
            "end_iso": end_iso,
            "seconds_to_close": delta,
            "minutes_to_close": None if delta is None else round(delta / 60.0, 3),
            "hours_to_close": None if delta is None else round(delta / 3600.0, 3),
            "days_to_close": None if delta is None else round(delta / 86400.0, 6),
        }
        logging.info(
            "[enddate] schedule slug=%s end_ts=%s end_iso=%s d_sec=%s",
            p.slug, str(end_ts), str(end_iso), str(delta)
        )
        rows.append(row)

    rows.sort(key=lambda r: (r["end_ts"] is None, r["end_ts"] if r["end_ts"] is not None else float("inf")))
    future_cnt = sum(1 for r in rows if r["seconds_to_close"] is not None and r["seconds_to_close"] >= 0)
    past_cnt = sum(1 for r in rows if r["seconds_to_close"] is not None and r["seconds_to_close"] < 0)
    none_cnt = sum(1 for r in rows if r["seconds_to_close"] is None)
    logging.info("[enddate] summary future=%d past=%d none=%d total=%d", future_cnt, past_cnt, none_cnt, len(rows))
    return rows

def save_closing_schedule_json(path: str, schedule_rows: List[Dict[str, Any]]) -> None:
    ensure_parent_dir(path)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(schedule_rows, f, indent=2)
        logging.info("[enddate] closing schedule saved path=%s rows=%d", path, len(schedule_rows))
    except Exception as e:
        logging.exception("[enddate] failed saving schedule path=%s err=%s", path, e)

# =========================
# Orchestration helpers
# =========================
def refresh_quotes_for_positions_only(pf: Portfolio) -> Tuple[Dict[str, Tuple[float, float]], Dict[str, dict]]:
    quotes_cache: Dict[str, Tuple[float, float]] = {}
    markets_cache: Dict[str, dict] = {}
    for p in pf.positions:
        m = fetch_market_by_slug(p.slug)
        if m:
            markets_cache[p.slug] = m
        if m and is_active_market(m):
            q = yes_no_quotes(m)
            if q:
                quotes_cache[p.slug] = q
                logging.info(
                    "[mtm] quote slug=%s yes=%.4f no=%.4f pos_side=%s qty=%g avg=%-.6f",
                    p.slug, q[0], q[1], p.side, p.qty, p.avg_cost
                )
            else:
                logging.warning("[price] unavailable (held) slug=%s", p.slug)
        else:
            logging.info("[map] skip non-active or missing (held) slug=%s", p.slug)
    return quotes_cache, markets_cache

def trading_pass_from_breaking(pf: Portfolio) -> Tuple[Dict[str, Tuple[float, float]], Dict[str, dict]]:
    html = fetch_breaking_html()
    items = parse_breaking(html)

    quotes_cache: Dict[str, Tuple[float, float]] = {}
    markets_cache: Dict[str, dict] = {}
    traded = 0

    for idx, it in enumerate(items):
        slug = it["slug"]
        title = it["title"]
        sign = it["sign"]

        # ONLY act on POS (YES) signals; ignore NEG (NO) by spec
        if sign != "POS":
            logging.info("[filter] skip non-POS signal slug=%s sign=%s", slug, sign)
            continue

        this_size = TRADE_QTY if idx < 10 else (TRADE_QTY / 2.0)

        mkt = fetch_market_by_slug(slug)
        if mkt:
            markets_cache[slug] = mkt
        if mkt:
            title = (mkt.get("question") or mkt.get("title") or title)

        if not mkt:
            continue
        if not is_active_market(mkt):
            logging.info("[map] skip non-active slug=%s status=%s", slug, mkt.get("status"))
            continue

        q = yes_no_quotes(mkt)
        if not q:
            logging.warning("[price] unavailable slug=%s", slug)
            continue
        yes_px, no_px = q
        quotes_cache[slug] = q

        side = "YES"
        px = yes_px

        if SKIP_EXTREME and (px >= 0.97 or px <= 0.03):
            logging.warning("[price] extreme skip slug=%s side=%s px=%.4f", slug, side, px)
            continue

        approved, analysis_text = ai_trade_gate(slug, title, this_size, px, mkt)
        if not approved:
            logging.info("[trade] blocked by AI gate slug=%s", slug)
            continue

        add_or_update_position(pf, slug, title, side, this_size, px)
        traded += 1

        if analysis_text:
            send_discord_notification(slug, title, px, this_size, analysis_text, mkt)

        logging.info(
            "[trade] size_rule idx=%d size=%g top10_full=%s slug=%s side=%s px=%.4f",
            idx, this_size, "Y" if idx < 10 else "N (half)", slug, side, px
        )

    logging.info("[breaking] traded=%d", traded)
    return quotes_cache, markets_cache

# =========================
# Orchestration
# =========================
def run_once(stats_mode: bool = False) -> Portfolio:
    pf = load_portfolio(PORTFOLIO_FILE)
    logging.info("[portfolio] loaded cash=%.2f positions=%d realized=%.2f stats_mode=%s",
                 pf.cash, len(pf.positions or []), pf.realized_pnl, stats_mode)

    quotes_cache: Dict[str, Tuple[float, float]] = {}
    markets_cache: Dict[str, dict] = {}

    if stats_mode:
        logging.info("[mode] stats-only: skipping breaking/trading pass; refreshing held positions only")
        quotes_cache, markets_cache = refresh_quotes_for_positions_only(pf)
    else:
        quotes_cache, markets_cache = trading_pass_from_breaking(pf)
        for p in pf.positions:
            if p.slug not in quotes_cache or p.slug not in markets_cache:
                m = fetch_market_by_slug(p.slug)
                if m:
                    markets_cache[p.slug] = m
                if m and is_active_market(m):
                    q = yes_no_quotes(m)
                    if q:
                        quotes_cache[p.slug] = q
                        logging.info(
                            "[mtm] backfill quote slug=%s yes=%.4f no=%.4f pos_side=%s qty=%g avg=%-.6f",
                            p.slug, q[0], q[1], p.side, p.qty, p.avg_cost
                        )

    # Apply bracket processing BEFORE MTM so realized/cash updates reflect in snapshot
    process_brackets(pf, quotes_cache)

    # Mark-to-market remaining
    mark_to_market(pf, quotes_cache)

    # Update MFE/MAE after we have current px
    update_mfe_mae(pf, quotes_cache)

    pf.last_run_ts = int(time.time())
    snap = pf.to_json()
    logging.info(
        "[mtm] equity=%.2f positions_value=%.2f upnl=%.2f realized=%.2f npos=%d",
        snap["equity"], snap["positions_value"],
        snap["totals"]["unrealized_pnl"], snap["totals"]["realized_pnl"], snap["totals"]["position_count"]
    )

    # Closing schedule (soonest first) + save separate JSON
    closing_schedule = build_closing_schedule(pf.positions or [], markets_cache)
    snap["closing_schedule"] = closing_schedule
    save_closing_schedule_json(CLOSING_SCHEDULE_JSON, closing_schedule)

    # Save portfolio
    save_portfolio(PORTFOLIO_FILE, pf)

    # Append CSVs + Save plots (equity plot + NEW per-market plot)
    append_upnl_csv(UPNL_CSV, snap)
    append_positions_pnl_csv(POS_PNL_CSV, pf)
    save_upnl_plot(UPNL_CSV, UPNL_PNG)
    save_positions_pnl_plot(POS_PNL_CSV, POS_PNL_PNG)

    # Print full snapshot JSON (includes closing_schedule)
    print(json.dumps(snap, indent=2))
    return pf

def parse_args(argv: List[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Polybreaking YES-only: scrape breaking POS signals, trade/mark-to-market, track PnL over time (overall and per-position), bracket exits (Stops/TPs per spec), MFE/MAE, and closing schedule."
    )
    ap.add_argument(
        "--stats",
        action="store_true",
        help="Stats-only mode: do NOT place trades; only refresh held positions, apply paper brackets, update PnL CSV/plots, and save portfolio."
    )
    return ap.parse_args(argv)

def main():
    args = parse_args(sys.argv[1:])
    try:
        run_once(stats_mode=args.stats)
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as e:
        logging.exception("fatal: %s", e)
        return 1

if __name__ == "__main__":
    sys.exit(main())
