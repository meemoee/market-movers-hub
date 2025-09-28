#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import aiohttp
import os
import sys
import json
import math
import argparse
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union

from dotenv import load_dotenv

# ──────────────────────────────────────────────────────────────────────────────
# Environment & constants
# ──────────────────────────────────────────────────────────────────────────────

if sys.platform.startswith('win'):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
POLYMARKET_GAMMA_API_URL = "https://gamma-api.polymarket.com"

DEFAULT_MARKET_SLUG = "no-trump-cabinet-confirmations-in-january"
CURRENT_DATE = datetime.now().strftime("%Y-%m-%d")

# Labels to describe final stance. Keep shape used by your prompts.
RESPONSE_TERMS = [
    [
        "Extremely unlikely",
        "Very unlikely",
        "Unlikely",
        "Somewhat unlikely",
        "Uncertain",
        "Somewhat likely",
        "Likely",
        "Very likely",
        "Extremely likely"
    ]
]

PROCESSED_MARKETS_FILE = "processed_markets.json"
OUTPUT_FILE = "openrouter_responses.jsonl"

# HTTP tuning
HTTP_TOTAL_TIMEOUT_SECS = 180  # deep-research can be slow
HTTP_CONNECT_TIMEOUT_SECS = 30
OPENROUTER_RETRIES = 3
OPENROUTER_BACKOFF = 1.7

# Default knobs (override via CLI flags or env)
DEFAULT_NUM_AGENTS = int(os.getenv("PRA_NUM_AGENTS", "4"))
DEFAULT_NUM_SUB_AGENTS = int(os.getenv("PRA_NUM_SUB_AGENTS", "2"))
DEFAULT_NUM_LAYERS = int(os.getenv("PRA_NUM_LAYERS", "2"))
DEFAULT_NUM_FINAL_EVALS = int(os.getenv("PRA_NUM_FINAL_EVALS", "2"))
DEFAULT_NUM_QUESTIONS_PER_EVAL = int(os.getenv("PRA_NUM_QUESTIONS_PER_EVAL", "5"))
DEFAULT_NUM_FINAL_EVALS_WITH_PX = int(os.getenv("PRA_NUM_FINAL_EVALS_WITH_PX", "2"))

# ──────────────────────────────────────────────────────────────────────────────
# Utilities: persistence
# ──────────────────────────────────────────────────────────────────────────────

def load_processed_markets() -> Dict[str, str]:
    """Load mapping of market slug to ISO timestamp of last analysis."""
    if os.path.exists(PROCESSED_MARKETS_FILE):
        with open(PROCESSED_MARKETS_FILE, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
                if isinstance(data, dict):
                    return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}
                if isinstance(data, list):  # backward compatibility
                    return {slug: "1970-01-01T00:00:00" for slug in data if isinstance(slug, str)}
            except json.JSONDecodeError:
                pass
    return {}

def save_processed_market(slug: str) -> None:
    processed = load_processed_markets()
    processed[slug] = datetime.now().isoformat()
    with open(PROCESSED_MARKETS_FILE, "w", encoding="utf-8") as f:
        json.dump(processed, f, indent=2, ensure_ascii=False)


def log_openrouter_response(response: str, market_url: str) -> None:
    """Append an OpenRouter response to the output file with a timestamp."""
    if not response:
        return
    try:
        with open(OUTPUT_FILE, "a", encoding="utf-8") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "market_url": market_url,
                "response": response,
            }, f, ensure_ascii=False)
            f.write("\n")
    except Exception as e:
        print(f"[WARN] Failed to log OpenRouter response: {e}")

# ──────────────────────────────────────────────────────────────────────────────
# NEW: Queue helpers
# ──────────────────────────────────────────────────────────────────────────────

def load_queue_slugs(queue_path: str) -> List[str]:
    """
    Load a queue file of market slugs. One slug per line.
    - Ignores blank lines and lines starting with '#'
    - Trims inline comments after '#'
    - Preserves order; de-duplicates while respecting first occurrence
    """
    if not os.path.exists(queue_path):
        raise FileNotFoundError(f"Queue file not found: {queue_path}")
    seen = set()
    slugs: List[str] = []
    with open(queue_path, "r", encoding="utf-8") as f:
        for line in f:
            raw = line.rstrip("\n")
            stripped = raw.strip()
            if not stripped or stripped.startswith("#"):
                continue
            token = stripped.split("#", 1)[0].strip()
            if token and token not in seen:
                seen.add(token)
                slugs.append(token)
    return slugs

def dequeue_slug_from_file(queue_path: str, slug: str) -> bool:
    """
    Remove the first occurrence of 'slug' from the queue file.
    - Matches a line where the content before an optional '#' equals slug (ignoring surrounding whitespace).
    - Preserves other lines verbatim (including comments, spacing).
    Returns True if a line was removed, False otherwise.
    """
    try:
        with open(queue_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return False

    removed = False
    new_lines: List[str] = []
    for line in lines:
        if removed:
            new_lines.append(line)
            continue
        # Evaluate match safely
        _s = line.strip()
        if _s and not _s.startswith("#"):
            token = _s.split("#", 1)[0].strip()
            if token == slug:
                removed = True
                continue
        new_lines.append(line)

    if removed:
        with open(queue_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    return removed

# ──────────────────────────────────────────────────────────────────────────────
# Utilities: parsing / SSE helpers
# ──────────────────────────────────────────────────────────────────────────────

def extract_json_field(field: Any) -> Optional[List[Any]]:
    """
    Accept list or JSON-stringified list, else None.
    """
    if isinstance(field, list):
        return field
    if isinstance(field, str):
        try:
            val = json.loads(field)
            if isinstance(val, list):
                return val
        except Exception:
            pass
    return None

async def parse_openrouter_payload(resp: aiohttp.ClientResponse) -> Optional[Dict[str, Any]]:
    """
    Normalize OpenRouter responses:
      • Standard OpenAI schema -> {'content': str}
      • Perplexity deep-research -> {'content': str} from 'answer' or 'output'
      • Error envelope -> raise
    """
    data = await resp.json(content_type=None)
    # Error wrapped in 200
    if isinstance(data, dict) and 'error' in data:
        code = data['error'].get('code')
        message = data['error'].get('message')
        raise RuntimeError(f"OpenRouter error {code}: {message}")

    # Perplexity deep-research schemas
    if isinstance(data, dict) and 'answer' in data:
        return {'content': data.get('answer', '')}
    if isinstance(data, dict) and 'output' in data:
        return {'content': data.get('output', '')}

    # Standard OpenAI schema
    if isinstance(data, dict) and 'choices' in data and data['choices']:
        choice = data['choices'][0]
        # prefer message.content
        if 'message' in choice and isinstance(choice['message'], dict) and 'content' in choice['message']:
            return {'content': choice['message']['content']}
        if 'text' in choice:
            return {'content': choice['text']}

    # Unknown – log and return None
    print("[WARN] Unrecognised OpenRouter payload:", data)
    return None

async def read_sse_stream(resp: aiohttp.ClientResponse) -> str:
    """
    Read SSE stream from OpenRouter, concatenating text from:
      - OpenAI-style deltas in choices[].delta.content
      - Perplexity deep-research streaming (rare; fallback to 'answer' chunks if present)
    """
    buffer = []
    async for raw in resp.content:
        try:
            line = raw.decode("utf-8", errors="ignore").strip()
        except Exception:
            continue

        if not line:
            continue
        # OpenRouter uses 'data: {...}' lines
        if line.startswith("data:"):
            payload_str = line[len("data:"):].strip()
            if payload_str in ("[DONE]", ""):
                continue
            try:
                data = json.loads(payload_str)
            except json.JSONDecodeError:
                continue

            # Handle error envelopes
            if isinstance(data, dict) and 'error' in data:
                msg = data['error'].get('message', 'Unknown streaming error')
                raise RuntimeError(f"OpenRouter stream error: {msg}")

            # Standard delta
            if 'choices' in data and data['choices']:
                delta = data['choices'][0].get('delta', {})
                if 'content' in delta and delta['content'] is not None:
                    text = delta['content']
                    print(text, end='', flush=True)  # mirror streaming to console
                    buffer.append(text)
            # Deep-research – sometimes streams through "answer" segments (provider-dependent)
            elif 'answer' in data:
                text = str(data['answer'])
                print(text, end='', flush=True)
                buffer.append(text)
            elif 'output' in data:
                text = str(data['output'])
                print(text, end='', flush=True)
                buffer.append(text)

    print()  # newline after stream completes
    return "".join(buffer)

def sleeping_backoff(attempt: int, base: float = OPENROUTER_BACKOFF) -> float:
    return base ** attempt

# ──────────────────────────────────────────────────────────────────────────────
# OpenRouter unified caller
# ──────────────────────────────────────────────────────────────────────────────

async def openrouter_chat(
    session: aiohttp.ClientSession,
    *,
    model: str,
    messages: List[Dict[str, str]],
    max_tokens: int = 8000,
    temperature: float = 0.2,
    stream: bool = False,
    response_format: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """
    Sends a chat completion request to OpenRouter and returns text content.
    Handles:
      • standard models (choices[].message.content)
      • Perplexity deep-research (answer/output)
      • streaming SSE or non-streaming
      • retries with backoff
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("Missing OPENROUTER_API_KEY")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    # Strip citation markup in Perplexity answers to keep outputs clean
    if model.startswith("perplexity/"):
        payload["strip_sources"] = True

    # Add response_format if provided (e.g., {"type":"json_object"})
    if response_format:
        payload["response_format"] = response_format

    # Include any extra provider-specific knobs (e.g., reasoning_effort)
    if extra:
        payload.update(extra)

    if stream:
        payload["stream"] = True

    for attempt in range(OPENROUTER_RETRIES):
        try:
            async with session.post(
                OPENROUTER_URL,
                headers=headers,
                json=payload,
            ) as resp:
                # Non-2xx → try to read error and maybe retry
                if resp.status // 100 != 2:
                    txt = await resp.text()
                    if resp.status in (429, 500, 502, 503, 504) and attempt < OPENROUTER_RETRIES - 1:
                        await asyncio.sleep(sleeping_backoff(attempt))
                        continue
                    raise RuntimeError(f"OpenRouter HTTP {resp.status}: {txt}")

                if stream:
                    content = await read_sse_stream(resp)
                    return content
                else:
                    parsed = await parse_openrouter_payload(resp)
                    if parsed and 'content' in parsed:
                        content = parsed['content']
                        return content
                    # Unexpected: retry?
                    if attempt < OPENROUTER_RETRIES - 1:
                        await asyncio.sleep(sleeping_backoff(attempt))
                        continue
                    return None

        except (aiohttp.ClientError, asyncio.TimeoutError):
            if attempt < OPENROUTER_RETRIES - 1:
                await asyncio.sleep(sleeping_backoff(attempt))
                continue
            raise

    return None

# ──────────────────────────────────────────────────────────────────────────────
# Polymarket Gamma API
# ──────────────────────────────────────────────────────────────────────────────

async def get_polymarket_market_by_slug(session: aiohttp.ClientSession, slug: str) -> Optional[Dict[str, Any]]:
    url = f"{POLYMARKET_GAMMA_API_URL}/markets"
    params = {"slug": slug}
    async with session.get(url, params=params) as resp:
        data = await resp.json()
        print(f"\n[RAW] /markets?slug={slug}\n{json.dumps(data, indent=2)}")
        if not data:
            return None
        return data[0]

async def get_polymarket_event_by_slug(session: aiohttp.ClientSession, event_slug: str) -> Optional[Dict[str, Any]]:
    url = f"{POLYMARKET_GAMMA_API_URL}/events"
    params = {"slug": event_slug}
    async with session.get(url, params=params) as resp:
        data = await resp.json()
        print(f"\n[RAW] /events?slug={event_slug}\n{json.dumps(data, indent=2)}")
        if not data:
            return None
        return data[0]

async def get_polymarket_event_markets(
    session: aiohttp.ClientSession, 
    market_slug: str
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:

    market = await get_polymarket_market_by_slug(session, market_slug)
    if not market:
        return None, None

    event_slug = None
    if market.get("eventSlug"):
        event_slug = market["eventSlug"]
    elif isinstance(market.get("events"), dict) and market["events"].get("slug"):
        event_slug = market["events"]["slug"]
    elif isinstance(market.get("events"), list) and market["events"]:
        event_slug = market["events"][0].get("slug")
    elif market.get("groupSlug"):
        event_slug = market["groupSlug"]

    print(f"\n[DEBUG] Extracted event_slug: {event_slug}")
    if not event_slug:
        print(f"Could not find event slug for market '{market_slug}'")
        return None, None

    event = await get_polymarket_event_by_slug(session, event_slug)
    if not event or "markets" not in event:
        print(f"Event '{event_slug}' does not contain a 'markets' array")
        return None, None
    return event["markets"], event_slug

async def get_full_market_details(session: aiohttp.ClientSession, slugs: List[str]) -> List[Dict[str, Any]]:
    tasks = [get_polymarket_market_by_slug(session, slug) for slug in slugs]
    results = await asyncio.gather(*tasks)
    return [m for m in results if m]

async def get_active_event_markets_with_prices(session: aiohttp.ClientSession, market_slug: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    event_markets, event_slug = await get_polymarket_event_markets(session, market_slug)
    if not event_markets:
        return [], event_slug

    active_slugs: List[str] = []
    for m in event_markets:
        print(f"\n[RAW] Event Market summary:\n{json.dumps(m, indent=2)}")
        if m.get("active", False) and not m.get("closed", True) and m.get("slug"):
            active_slugs.append(m["slug"])

    full_markets = await get_full_market_details(session, active_slugs)
    all_market_data: List[Dict[str, Any]] = []
    for m in full_markets:
        print(f"\n[RAW] FULL Market data:\n{json.dumps(m, indent=2)}")
        outcomes = None
        prices = None
        for key in ["outcomes", "outcomeNames", "outcome_prices", "outcomePrices"]:
            v = m.get(key)
            outcomes = extract_json_field(v)
            if outcomes:
                break
        for price_key in ["outcomePrices", "outcome_prices", "prices"]:
            v = m.get(price_key)
            prices = extract_json_field(v)
            if prices:
                break
        all_market_data.append({
            "slug": m.get("slug"),
            "title": m.get("question") or m.get("title") or m.get("slug"),
            "description": m.get("description", ""),
            "outcomes": outcomes,
            "prices": prices,
            "raw": m
        })
    return all_market_data, event_slug

# ──────────────────────────────────────────────────────────────────────────────
# Market conversion / price parsing
# ──────────────────────────────────────────────────────────────────────────────

def convert_polymarket_to_question(market: Dict[str, Any]) -> Dict[str, Any]:
    title = market.get("question") or market.get("title") or market.get("slug", "")
    description = market.get("description", "")
    events_field = market.get("events", {})
    if isinstance(events_field, dict):
        event_res_src = events_field.get("resolutionSource")
    else:
        event_res_src = ""
    resolution_criteria = market.get("resolutionSource") or event_res_src or description
    open_time = market.get("startDate") or market.get("createdAt", "")
    close_time = market.get("endDate") or market.get("closedTime", "")
    resolve_time = market.get("umaEndDate") or market.get("endDate") or ""
    # Additional timing/catalyst hints if present (non-breaking if missing)
    event_date = market.get("eventDate") or ""
    start_time = market.get("startTime") or ""

    status = "open" if market.get("active", False) and not market.get("closed", True) else "closed"

    outcomes = market.get("outcomes")
    if not outcomes or not isinstance(outcomes, list) or len(outcomes) != 2:
        outcomes = market.get("outcomeNames")
    if not outcomes or not isinstance(outcomes, list) or len(outcomes) != 2:
        outcomes = market.get("outcomePrices")

    type_ = "binary"
    user_permission = "forecaster"

    return {
        "title": title,
        "description": description,
        "resolution_criteria": resolution_criteria,
        "open_time": open_time,
        "close_time": close_time,
        "resolve_time": resolve_time,
        "event_date": event_date,
        "start_time": start_time,
        "status": status,
        "type": type_,
        "user_permission": user_permission,
        "question": market
    }

def extract_latest_price_info(market_info: Dict[str, Any]) -> Optional[Dict[str, float]]:
    q = market_info.get("question", {})
    outcome_prices = q.get("outcomePrices")
    last_trade_price = q.get("lastTradePrice")
    best_ask = q.get("bestAsk")
    try:
        if outcome_prices and isinstance(outcome_prices, list) and len(outcome_prices) == 2:
            yes_price = float(outcome_prices[1])
            no_price = float(outcome_prices[0])
            return {
                "center": yes_price,
                "lower_bound": min(yes_price, no_price),
                "upper_bound": max(yes_price, no_price),
            }
        if last_trade_price is not None:
            p = float(last_trade_price)
            return {"center": p, "lower_bound": p, "upper_bound": p}
        if best_ask is not None:
            p = float(best_ask)
            return {"center": p, "lower_bound": p, "upper_bound": p}
        return None
    except Exception as e:
        print("Error extracting price info:", e)
        return None

def get_market_context_string(markets: List[Dict[str, Any]]) -> str:
    out = []
    for m in markets:
        line = f"[{m['slug']}]: {m['title']}\n  Description: {m['description']}\n"
        if m['outcomes']:
            line += f"  Outcomes: {m['outcomes']}\n"
        if m['prices']:
            line += f"  Prices: {m['prices']}\n"
        out.append(line)
    return "\n".join(out)

# ──────────────────────────────────────────────────────────────────────────────
# OpenRouter request wrappers for this pipeline
# ──────────────────────────────────────────────────────────────────────────────

async def generate_openrouter_response(
    session: aiohttp.ClientSession, prompt: str, model: str = "perplexity/sonar"
) -> Optional[str]:
    messages = [
        {"role": "system", "content": f"You are an AI assistant helping with forecasting analysis. Today's date is {CURRENT_DATE}."},
        {"role": "user", "content": prompt},
    ]
    # Use streaming for quick console feedback
    return await openrouter_chat(
        session,
        model=model,
        messages=messages,
        max_tokens=8000,
        temperature=0.2,
        stream=True,
    )

async def generate_agents(
    session: aiohttp.ClientSession, market_info: Dict[str, Any], num_agents: int, all_markets: List[Dict[str, Any]]
) -> Optional[str]:
    markets_context = get_market_context_string(all_markets)
    prompt = f"""
You are a professional forecaster interviewing for a job to create and prompt agents meant for various specific forecasting jobs to investigate what would need to occur for the given market outcome to resolve to 'YES'.
Today's date: {CURRENT_DATE}

The current date range for the market outcome to occur would be TODAY until the market resolution date.

The market you are focused on:
Title: {market_info['title']}
Description: {market_info['description']}
Resolution Criteria: {market_info['resolution_criteria']}
Open Time: {market_info['open_time']}
Close Time: {market_info['close_time']}
Resolve Time: {market_info['resolve_time']}

The event also contains these other active markets:
{markets_context}

Before answering you write:
(a) The time left until the outcome to the question is known.
(b) What the outcome would be if nothing changed.
(c) What you would forecast if there was only a quarter of the time left.
(d) What you would forecast if there was 4x the time left.

When applicable, agents should aim to collect verifiable artifacts BEFORE opinions and INCLUDE dates with their events/sources.

Gate > Sentiment
Always find the binding constraint (the minimal trigger / threshold / quorum / approval / artifact) and price that first. When the crowd prices vibes or sentiment, you shade away until the gate is actually satisfied or imminently verifiable by a listed artifact.

Necessary vs. Sufficient
Split drivers into supportive but insufficient (PR, polling, chatter) vs sufficient (official artifact that resolves criteria). Penalize any forecast that leans on the former without the latter.

Joint, not marginal
When the outcome requires multiple conditions (A and B) or a pair/joint event, compute the joint explicitly (and correlation). Markets routinely overprice by treating correlated marginals as if independent.

Unmodeled mass (“Other” floor)
If uncertainty is high (many viable outcomes, big undecided, wide spreads), reserve non-trivial probability for “unlisted/other.” Crowds compress tails; you re-inflate them until concrete evidence collapses them.

Evidence state machine
Tie probability updates to state transitions (Unsignaled → Multi-source → Official → Secondary → Completion). If the state hasn’t advanced, don’t let price momentum alone raise conviction.

Outside view before inside view
Start from base rates (historical success/lead-time/attrition) and only deviate with fresh, multi-source evidence. This systematically discounts narrative overreach in consensus.

Intent → Realization conversion
Convert soft intent metrics (statements, plans, survey intent) into realized rates with attrition/lag models. Apply a haircut unless there’s verifiable logistics that collapse the gap.

Parallel paths & hazards
Model multiple independent routes to YES with per-path hazards and combine as 
1
−
∏
(
1
−
𝑝
path
)
1−∏(1−ppath)
.

ATTENTION: If the market has not resolved to 0% or 100% yet, then that means no event has yet qualified for it. If a recent event appears to have qualified for the resolution, assume the market was created AFTER the recent supposed event.

Give PRECISELY {num_agents} potential independent forecasting agents that would best help understand the events that would need to occur in order for the YES outcome of the above market information to occur. Include agent prompts for each, ensuring diversity of thought and attacking the problem from different angles. Focus on finding historical precedents and rate of change. Find analogous situations and find differences between their conditions and ours, and analyze changes that have occurred recently to find base rates, and other agents may find comparisons to fulfill a greater conclusion. Find average amounts or percentages that would be highly helpful, if needed. Focus on the meta-analysis aspect of the situation. 1-2 of these agents MUST be tasked with gathering current odds or expert opinions (meta-analysis) (both positive and negative). When appropraite, you want to compute the conservative floor non-listed outcomes. When apprropriate, prioritize recency. Pay attention to the minimum verifying artifacts of the market resoluton and where they'll appear.When appropriate prioritize agents that may be dedicated to finding quotes from stakeholders with real power over the outcome, as well as agents whos job is to find prior analogous events that could be compared.

# ── ADDITIONS (1–4,6) ───────────────────────────────────────────────────────

**RESOLUTION LOCK.** Work only from the market card’s resolution text. Extract the minimal trigger and the verifying artifacts required to resolve YES. Treat anything not in the card or a named, timestamped primary source as UNKNOWN. Do not price sentiment unless the gate is satisfied or imminently verifiable by a listed artifact.
Return this upfront:
<criteria>
MIN_TRIGGER: …
ARTIFACTS_TO_VERIFY: [ … exact pages/outlets/docs … ]
OUT_OF_SCOPE: [ items explicitly excluded by the card ]
</criteria>

<timing>
TODAY: {CURRENT_DATE}
DEADLINE: {market_info['resolve_time']}
CATALYSTS: eventDate={market_info['event_date']}, startTime={market_info['start_time']}, closedTime={market_info['close_time']}
ASSUME: piecewise timing — baseline → catalyst window → post-catalyst decay.
If within ±2 days of a catalyst, weight “press-release/official drop” paths higher than organic discovery.
</timing>

<discounts>
ATTRIBUTION_RULE: If clear attribution is required by the card, apply a strong discount to paths with “unidentified/deniable/covert”.
DEFINITION_BREADTH: If broad wording suffices (e.g., “any mention”/“any artifact” that meets scope), apply a positive adjustment to paths that produce a minimal qualifying artifact.
State the net ±pp from these two knobs before the final number.
</discounts>

<paths>
Enumerate ≥3 disjoint YES paths. State per-path p.
Assume positive correlation when the same actor/process unlocks multiple paths. Use a correlation haircut; do not multiply as independent.
Give: RAW_NOISY_OR, CORR_HAIRCUT(ρ≈0.3–0.5), FINAL_COMBINED_P.
</paths>

<consistency_audit>
Flag mutually exclusive claims (e.g., operational modes that cannot both be true). For any conflict: mark the edge UNKNOWN and remove it from aggregation. Re-compute FINAL_COMBINED_P.
</consistency_audit>
"""
    return await generate_openrouter_response(session, prompt)

async def parse_agent_prompts(session: aiohttp.ClientSession, agents_response: str) -> List[Union[str, Dict[str, Any]]]:
    """
    Accepts free-text agents_response and returns a list of agent prompt objects or strings.
    Robust to different JSON wrappers.
    """
    messages = [
        {"role": "system", "content": f"Today's date is {CURRENT_DATE}. Parse the given text into a JSON array of agent prompts."},
        {"role": "user", "content": f"Parse the following text into a JSON array of agent prompts:\n\n{agents_response}"},
    ]
    content = await openrouter_chat(
        session,
        model="google/gemini-2.5-flash",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    if not content:
        return []
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            for k, v in parsed.items():
                if isinstance(v, list):
                    return v
            return parsed.get("agent_prompts", []) or []
    except json.JSONDecodeError:
        pass
    return []

async def generate_sub_agents(session: aiohttp.ClientSession, agent_prompt: Union[str, Dict[str, Any]],
                              num_sub_agents: int, all_markets: List[Dict[str, Any]]) -> List[str]:
    markets_context = get_market_context_string(all_markets)
    if isinstance(agent_prompt, dict) and 'prompt' in agent_prompt:
        agent_prompt_text = agent_prompt['prompt']
    else:
        agent_prompt_text = str(agent_prompt)

    prompt = f"""
The following is the market context for all related active markets in this event:

{markets_context}

Ponder about specific prior analogous events. Base rates are important.

The current date range for the market outcome to occur would be TODAY until the market resolution date.

Based on the following agent prompt, create {num_sub_agents} sub-agents/prompts that each seek a specific piece of data:

{agent_prompt_text}

Ensure that each sub-agent has a unique and non-overlapping focus area to maintain cohesiveness in the analysis. Tell each sub agent to include specific dates with their claims.

Return the result as a numbered list of {num_sub_agents} prompts.
"""
    # 1) Generate numbered list with Sonar
    sonar_content = await openrouter_chat(
        session,
        model="perplexity/sonar",
        messages=[
            {"role": "system", "content": "You are an AI assistant creating sub-agents for data collection."},
            {"role": "user", "content": prompt},
        ],
    )
    if not sonar_content:
        return []

    # 2) Parse that list to JSON array with Gemini
    parse_prompt = f"""
Parse the following numbered list of sub-agent prompts into a JSON array:

{sonar_content}

Return the result as a JSON array where each element is a string containing a sub-agent prompt.
"""
    parsed = await openrouter_chat(
        session,
        model="google/gemini-2.5-flash",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that parses text and extracts structured information."},
            {"role": "user", "content": parse_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    if not parsed:
        return []

    try:
        parsed_json = json.loads(parsed)
        if isinstance(parsed_json, dict) and 'sub_agents' in parsed_json and isinstance(parsed_json['sub_agents'], list):
            return [str(x) for x in parsed_json['sub_agents']]
        if isinstance(parsed_json, list):
            return [str(x) for x in parsed_json]
    except json.JSONDecodeError:
        pass
    return []

async def generate_sub_agents_recursive(
    session: aiohttp.ClientSession,
    prompt: Union[str, Dict[str, Any]],
    num_sub_agents: int,
    current_layer: int,
    num_layers: int,
    all_markets: List[Dict[str, Any]],
) -> List[str]:
    if current_layer >= num_layers:
        return []
    sub_agent_prompts = await generate_sub_agents(session, prompt, num_sub_agents, all_markets)
    all_sub_agents: List[str] = []
    for sub_prompt in sub_agent_prompts:
        all_sub_agents.append(sub_prompt)
        deeper = await generate_sub_agents_recursive(
            session, sub_prompt, num_sub_agents, current_layer + 1, num_layers, all_markets
        )
        all_sub_agents.extend(deeper)
    return all_sub_agents

# ──────────────────────────────────────────────────────────────────────────────
# Perplexity queries
# ──────────────────────────────────────────────────────────────────────────────

async def query_perplexity(session: aiohttp.ClientSession, question: str) -> Optional[str]:
    messages = [
        {"role": "system", "content": f"You are a professional forecaster interviewing for a job. Today's date: {CURRENT_DATE}."},
        {"role": "user", "content": f"Answer the following question in-depth: {question}"},
    ]
    return await openrouter_chat(
        session,
        model="perplexity/sonar",
        messages=messages,
        max_tokens=8000,
    )

async def deep_research(session: aiohttp.ClientSession, question: str) -> Optional[str]:
    """
    Uses Perplexity sonar-deep-research. Returns the normalized 'content' which is the 'answer' field.
    """
    messages = [
        {"role": "system", "content": f"You are a professional forecaster interviewing for a job. Today's date: {CURRENT_DATE}."},
        {"role": "user", "content": f"Answer the following question in-depth: {question}"},
    ]
    return await openrouter_chat(
        session,
        model="openai/gpt-5-chat",
        messages=messages,
    )

async def query_perplexity_for_sub_agents(session: aiohttp.ClientSession, sub_agent_prompts: List[str]) -> List[str]:
    results: List[str] = []
    for p in sub_agent_prompts:
        ans = await deep_research(session, p)
        print(ans)
        results.append(f"Prompt: {p}\nAnswer: {ans or ''}\n")
    return results

# ──────────────────────────────────────────────────────────────────────────────
# Analysis generators
# ──────────────────────────────────────────────────────────────────────────────

async def generate_pessimistic_analysis(session: aiohttp.ClientSession, market_info: Dict[str, Any],
                                        agent_prompt: Union[str, Dict[str, Any]],
                                        all_markets: List[Dict[str, Any]]) -> Optional[str]:
    ap = agent_prompt['prompt'] if isinstance(agent_prompt, dict) and 'prompt' in agent_prompt else str(agent_prompt)
    prompt = f"""
You are a professional forecaster interviewing for a job.
Today's date: {CURRENT_DATE}

The current date range for the market outcome to occur would be TODAY until the market resolution date.

===GIVEN MARKET===
Market Information:
Title: {market_info['title']}
Description: {market_info['description']}
Resolution Criteria: {market_info['resolution_criteria']}
Open Time: {market_info['open_time']}
Close Time: {market_info['close_time']}
Resolve Time: {market_info['resolve_time']}
===
Other event markets:
{get_market_context_string(all_markets)}

First, state today's date. Then, state the market resolution date.

Agent Prompt: {ap}

FOCUS HEAVILY on factors that add probability to the NO outcome of the GIVEN MARKET. Then list POSSIBLE FUTURE EXTERNAL FACTORS that could indirectly increase the probability of the NO outcome of the GIVEN MARKET. You must be specific and precise in researching and listing ALTERNATIVE outcomes and their likelihood as well.

Enumerate ≥3 concrete vehicles and assign path probabilities; combine hazards across paths (not just the hardest one).

Specify the expected first artifact type and where it would appear; define how secondary reporting can substitute if criteria permit.

Timing & decay

Use a piecewise hazard: baseline → coordination signal spike → deadline pressure; update probabilities at each phase.

Tie decay/upticks to observable milestones (signals hit/missed), not to the calendar alone.

Signaling & verification

Convert strong multi-source signals into a near-term artifact expectation; if it doesn’t arrive, systematically reduce confidence.

Maintain a short verification checklist (where to look, what language would confirm, what would falsify).

Incentives & governance

Map who can trigger and who can veto; weigh pathways that minimize governance friction more favorably.

Distinguish optics/politics from mechanics/authority and quantify their influence separately.

ATTENTION: If the market has not resolved to 0% or 100% yet, then that means no event has yet qualified for it. If a recent event appears to have qualified for the resolution, assume the market was created AFTER the recent supposed event.

MINIMAL_TRIGGER
- State the single simplest event that satisfies the market's YES resolution per its criteria.
- List the concrete artifacts/identifiers that would verify it.

TIME_DECAY
- Assume a simple hazard-rate model for the trigger arriving before DEADLINE (constant or piecewise).
- Show how the YES probability would drift each week absent new information.

BLOCKERS
- Enumerate structural blockers (legal, operational, seasonal, capacity) that reduce trigger arrival rate, each with whether it is temporary or structural.

# ── ADDITIONS (1–6) ──────────────────────────────────────────────────────────

**RESOLUTION LOCK.** Work only from the market card’s resolution text. Extract the minimal trigger and the verifying artifacts required to resolve YES. Treat anything not in the card or a named, timestamped primary source as UNKNOWN. Do not price sentiment unless the gate is satisfied or imminently verifiable by a listed artifact.
Return this upfront:
<criteria>
MIN_TRIGGER: …
ARTIFACTS_TO_VERIFY: [ … exact pages/outlets/docs … ]
OUT_OF_SCOPE: [ items explicitly excluded by the card ]
</criteria>

<timing>
TODAY: {CURRENT_DATE}
DEADLINE: {market_info['resolve_time']}
CATALYSTS: eventDate={market_info['event_date']}, startTime={market_info['start_time']}, closedTime={market_info['close_time']}
ASSUME: piecewise timing — baseline → catalyst window → post-catalyst decay.
If within ±2 days of a catalyst, weight “press-release/official drop” paths higher than organic discovery.
</timing>

<discounts>
ATTRIBUTION_RULE: If clear attribution is required by the card, apply a strong discount to paths with “unidentified/deniable/covert”.
DEFINITION_BREADTH: If broad wording suffices (e.g., “any mention”/“any artifact” that meets scope), apply a positive adjustment to paths that produce a minimal qualifying artifact.
State the net ±pp from these two knobs before the final number.
</discounts>

<paths>
Enumerate ≥3 disjoint YES paths. State per-path p.
Assume positive correlation when the same actor/process unlocks multiple paths. Use a correlation haircut; do not multiply as independent.
Give: RAW_NOISY_OR, CORR_HAIRCUT(ρ≈0.3–0.5), FINAL_COMBINED_P.
</paths>

<kill_switch>
Trigger: “If ≥2 mainstream outlets publish a qualifying artifact that matches <criteria/ARTIFACTS_TO_VERIFY>, update to ~1.00 immediately.”
List EXACT 3 pages to watch next (historical/past sources or official repositories relevant to this topic). You do not need to monitor; just list the locations that would have settled it during the window.
</kill_switch>

<consistency_audit>
Flag mutually exclusive claims. For any conflict: mark the edge UNKNOWN and remove it from aggregation. Re-compute FINAL_COMBINED_P.
Conflicts: [ … ]
</consistency_audit>

At the end of your response, provide a likelihood of the YES outcome of the market as a decimal between 0 and 1, formatted as follows:
LIKELIHOOD: [your decimal here]
"""
    return await generate_openrouter_response(session, prompt)

async def generate_optimistic_analysis(session: aiohttp.ClientSession, market_info: Dict[str, Any],
                                       agent_prompt: Union[str, Dict[str, Any]],
                                       all_markets: List[Dict[str, Any]]) -> Optional[str]:
    ap = agent_prompt['prompt'] if isinstance(agent_prompt, dict) and 'prompt' in agent_prompt else str(agent_prompt)
    prompt = f"""
You are a professional forecaster interviewing for a job.
Today's date: {CURRENT_DATE}

The current date range for the market outcome to occur would be TODAY until the market resolution date.

===GIVEN MARKET===
Market Information:
Title: {market_info['title']}
Description: {market_info['description']}
Resolution Criteria: {market_info['resolution_criteria']}
Open Time: {market_info['open_time']}
Close Time: {market_info['close_time']}
Resolve Time: {market_info['resolve_time']}
===
Other event markets:
{get_market_context_string(all_markets)}

First, state today's date. Then, state the market resolution date.

Agent Prompt: {ap}

FOCUS HEAVILY on factors that add probability to the YES outcome of the GIVEN MARKET. Then list POSSIBLE FUTURE EXTERNAL FACTORS that could indirectly increase the probability of the YES outcome for the GIVEN MARKET.

If announcement alone resolves YES, weight ‘press-release-only’ paths above closing paths and cap legal blockers’ weight accordingly.

ATTENTION: If the market has not resolved to 0% or 100% yet, then that means no event has yet qualified for it. If a recent event appears to have qualified for the resolution, assume the market was created AFTER the recent supposed event.

For each factor, list uncertainties that could prevent or delay the hypothesis.

SWING_FACTORS (≥15 pp shift)
- List specific developments that would plausibly move the YES probability by ≥0.15 each.
- For each: the mechanism, earliest plausible timing, and how to verify.

Then, list those who have power over this market outcome, and list possible reasons they would be incentivized to PREVENT the YES outcome from happening.

Inquire about specific prior analogous events.

# ── ADDITIONS (1–6) ──────────────────────────────────────────────────────────

**RESOLUTION LOCK.** Work only from the market card’s resolution text. Extract the minimal trigger and the verifying artifacts required to resolve YES. Treat anything not in the card or a named, timestamped primary source as UNKNOWN. Do not price sentiment unless the gate is satisfied or imminently verifiable by a listed artifact.
Return this upfront:
<criteria>
MIN_TRIGGER: …
ARTIFACTS_TO_VERIFY: [ … exact pages/outlets/docs … ]
OUT_OF_SCOPE: [ items explicitly excluded by the card ]
</criteria>

<timing>
TODAY: {CURRENT_DATE}
DEADLINE: {market_info['resolve_time']}
CATALYSTS: eventDate={market_info['event_date']}, startTime={market_info['start_time']}, closedTime={market_info['close_time']}
ASSUME: piecewise timing — baseline → catalyst window → post-catalyst decay.
If within ±2 days of a catalyst, weight “press-release/official drop” paths higher than organic discovery.
</timing>

<discounts>
ATTRIBUTION_RULE: If clear attribution is required by the card, apply a strong discount to paths with “unidentified/deniable/covert”.
DEFINITION_BREADTH: If broad wording suffices (e.g., “any mention”/“any artifact” that meets scope), apply a positive adjustment to paths that produce a minimal qualifying artifact.
State the net ±pp from these two knobs before the final number.
</discounts>

<paths>
Enumerate ≥3 disjoint YES paths. State per-path p.
Assume positive correlation when the same actor/process unlocks multiple paths. Use a correlation haircut; do not multiply as independent.
Give: RAW_NOISY_OR, CORR_HAIRCUT(ρ≈0.3–0.5), FINAL_COMBINED_P.
</paths>

<kill_switch>
Trigger: “If ≥2 mainstream outlets publish a qualifying artifact that matches <criteria/ARTIFACTS_TO_VERIFY>, update to ~1.00 immediately.”
List EXACT 3 pages to watch next (historical/past sources or official repositories relevant to this topic). You do not need to monitor; just list the locations that would have settled it during the window.
</kill_switch>

<consistency_audit>
Flag mutually exclusive claims. For any conflict: mark the edge UNKNOWN and remove it from aggregation. Re-compute FINAL_COMBINED_P.
Conflicts: [ … ]
</consistency_audit>
"""
    return await generate_openrouter_response(session, prompt)

async def parse_likelihood(session: aiohttp.ClientSession, analysis: str) -> Optional[float]:
    """
    Extracts a likelihood from the analysis text. The instruction in pessimistic asks for YES likelihood,
    so we keep the parser generic: search for a float after 'LIKELIHOOD:'.
    """
    prompt = f"""
Extract the numeric value in the 'LIKELIHOOD: [x]' line from the following text.
Return JSON: {{ "likelihood": <float> }} (0..1). If not found, return {{ "likelihood": null }}.

Text:
{analysis}
"""
    content = await openrouter_chat(
        session,
        model="google/gemini-2.5-flash",
        messages=[
            {"role": "system", "content": "You extract structured values from text."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    if not content:
        return None
    try:
        obj = json.loads(content)
        return obj.get("likelihood")
    except json.JSONDecodeError:
        return None

async def parse_questions_with_gemini(session: aiohttp.ClientSession, evaluation: str) -> List[Dict[str, str]]:
    prompt = f"""
Parse the following evaluation and extract the 5 most relevant future external factors and their associated questions. When appropriate, also prompt the agent to compare appropriate factors to prior similar/analagous events.
Return the result as a JSON array of objects, where each object has two keys: 'factor' and 'question'.

Evaluation:
{evaluation}
"""
    content = await openrouter_chat(
        session,
        model="google/gemini-2.5-flash",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that parses text and extracts structured information."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    if not content:
        return []
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict) and 'factor' in x and 'question' in x]
        if isinstance(parsed, dict):
            # Try common wrappers
            for key in ("factors_and_questions", "externalFactors", "factors"):
                if key in parsed and isinstance(parsed[key], list):
                    return [x for x in parsed[key] if isinstance(x, dict) and 'factor' in x and 'question' in x]
            # Or any list value with desired shape
            for _, v in parsed.items():
                if isinstance(v, list):
                    cand = [x for x in v if isinstance(x, dict) and 'factor' in x and 'question' in x]
                    if cand:
                        return cand
    except json.JSONDecodeError:
        pass
    return []

async def generate_final_evaluation(session: aiohttp.ClientSession, market_info: Dict[str, Any], all_analyses: str,
                                    response_terms: List[str], price_info: Optional[Dict[str, float]],
                                    all_markets: List[Dict[str, Any]], market_url: str) -> Optional[str]:
    if price_info:
        polymarket_data = (
            f"\nLatest Polymarket Market Data:\n"
            f"Consensus center estimate: {price_info['center']}\n"
            f"Lower bound of consensus: {price_info['lower_bound']}\n"
            f"Upper bound of consensus: {price_info['upper_bound']}\n"
        )
    else:
        polymarket_data = "No Polymarket price data available."

    event_context = get_market_context_string(all_markets)
    terms = ", ".join(response_terms)

    prompt = f"""
You are a professional forecaster interviewing for a job.
Today's date: {CURRENT_DATE}

The current date range for the market outcome to occur would be TODAY until the market resolution date.

Market Information:
Title: {market_info['title']}
Description: {market_info['description']}
Resolution Criteria: {market_info['resolution_criteria']}
Open Time: {market_info['open_time']}
Close Time: {market_info['close_time']}
Resolve Time: {market_info['resolve_time']}

Other active event markets:
{event_context}

{polymarket_data}

Agent Analyses:
{all_analyses}

First, state today's date. Then, state the market resolution date.

Before answering you write:
(a) The time left until the outcome to the question is known.
(b) What the outcome would be if nothing changed.
(c) What you would forecast if there was only a quarter of the time left.
(d) What you would forecast if there was 4x the time left.
(c) What you would forecast if the recent news for this outcome was just a "spark in the pan" and did not lead to further occurrences or advancements.

At the start, do a deep dive into the resolution criteria and any vagueness or insights we can gain that will likely influence the outcome:Resolution Criteria: {market_info['resolution_criteria']} - wrap your criteria analysis in <criteria></criteria> tags before your final critical judgement. Outline unique specifics or broadness about the resolution criteria.

Consider today's date and what could realistically happen to increase the likelihood of the NO and YES outcomes for the market. 

Compress key factual information from the sources, as well as useful background information which may not be in the sources, into a list of core factual points to reference. Aim for information which is specific, relevant, and covers the core considerations you'll use to make your forecast. For this step, do not draw any conclusions about how a fact will influence your answer or forecast. Place this section of your response in <facts></facts> tags.

Provide a few reasons why the answer might be no. Rate the strength of each reason on a scale of 1-10. Use <no></no> tags.

Provide a few reasons why the answer might be yes. Rate the strength of each reason on a scale of 1-10. Use <yes></yes> tags.

Aggregate your considerations. Do not summarize or repeat previous points; instead, investigate how the competing factors and mechanisms interact and weigh against each other. Factorize your thinking across (exhaustive, mutually exclusive) cases if and only if it would be beneficial to your reasoning. We have detected that you overestimate world conflict, drama, violence, and crises due to news' negativity bias, which doesn't necessarily represent overall trends or base rates. Similarly, we also have detected you overestimate dramatic, shocking, or emotionally charged news due to news' sensationalism bias. Therefore adjust for news' negativity bias and sensationalism bias by considering reasons to why your provided sources might be biased or exaggerated. If the question is timing based, focus on the amount of time left until the deadline and the realism of how long the outcome is likely to take to be achieved. Will stalling or slow processing delay the outcome until after the deadline?  - Does a single minimal trigger suffice to resolve YES per the criteria? (yes/no)
- List the concrete artifacts that would verify resolution. 

Enumerate ≥3 concrete vehicles and assign path probabilities; combine hazards across paths (not just the hardest one).

If announcement alone resolves YES, weight ‘press-release-only’ paths above closing paths and cap legal blockers’ weight accordingly.

Prioritize RECENT NEWS and fresh happenings. Weigh older sources less.

If today is decision day, anchor on official channels/quick counts; do not increase conviction without named early returns.

Renormalize siblings: “If analyzing a pair inside an event, show the event-level distribution (Pair A, Pair B, …, Other) after renormalization.”

Confidence bounds: “Report p ± CI where CI widens when inputs are stale or sources conflict.”

MINIMAL_TRIGGER
- State the single simplest event that satisfies the market's YES resolution per its criteria.
- List the concrete artifacts/identifiers that would verify it.

TIME_DECAY
- Assume a simple hazard-rate model for the trigger arriving before DEADLINE (constant or piecewise).
- Show how the YES probability would drift each week absent new information.

BLOCKERS
- Enumerate structural blockers (legal, operational, seasonal, capacity) that reduce trigger arrival rate, each with whether it is temporary or structural.

ATTENTION: If the market has not resolved to 0% or 100% yet, then that means no event has yet qualified for it. If a recent event appears to have qualified for the resolution, assume the market was created AFTER the recent supposed event.

KEY CONSIDERATIONS:

Evidence over narrative (artifact-first, verification watchdogs).

Stateful progression (minimal-trigger state machine driving p-updates).

Parallel causality (multiple independent paths to YES combined properly).

Outside-view discipline (defaults, priors, deadline uplift/decay that beat vibes).

Coherence + unmodeled mass (event-level normalization, “Other” floor).

Driver transparency (explicit ±pp attribution you can learn from later).

Freshness gates & reproducibility (age-aware inputs, manifests/metrics).

Think like a superforecaster. Use <thinking></thinking> tags for this section of your response.

Based on the market information, the analyses provided by various agents, and the latest Polymarket market data (if available), please provide a final evaluation of the likelihood of the YES outcome for this market. Consider both the optimistic and pessimistic factors mentioned by the agents, and provide a balanced assessment of the situation. If Polymarket data is available, take into account the consensus estimates, particularly the upper and lower bounds. Alongside a detailed analysis of the importance of time decay and external future factors, provide detailed arguments for and against the outcome. Give a final evaluation using one of the following terms for the outcome:

{terms}

Finally, give a final decimal likelihood of the YES outcome between 0-1. If Polymarket data is available, why is the latest consensus where it's at? Does your analysis allow you to stray from the consensus? Are you optimistic or pessimistic compared to it? If you have conviction, do not be afraid to stray from the consensus. If Polymarket data is not available, explain your reasoning for your likelihood estimate.

At the end, list the 5 most relevant future external factors from our optimistic/pessimistic agent analyses that have the highest historical precedent of influencing our outcome in the future. If the outcome hinges on recent or breaking news, or recent information, you may search upcoming or latest relevant news or queries. With each factor, include a specific and directed question that would allow you to glean as much useful information about the possibility of that external factor occurring using up to date info. ATTENTION: Each question MUST contain all named entities and be fully understandable as a standalone, searchable query without any headers or context.

Inquire about specific prior analogous events.

“Do driver decomposition explaining why your p differs from market (e.g., +0.06 announcement-suffices, −0.08 legal friction).”

“End with FINAL_TERM (from fixed list) and FINAL_PROBABILITY 0.xx.”

“List 3 verification checks for the next 72 hours (exact pages to watch).”

“Output TOP 5 future factors each paired with a standalone, fully-qualified query.”

# ── ADDITIONS (1–6) ──────────────────────────────────────────────────────────

**RESOLUTION LOCK.** Work only from the market card’s resolution text. Extract the minimal trigger and the verifying artifacts required to resolve YES. Treat anything not in the card or a named, timestamped primary source as UNKNOWN. Do not price sentiment unless the gate is satisfied or imminently verifiable by a listed artifact.
Return this upfront (restate, do not skip):
<criteria>
MIN_TRIGGER: …
ARTIFACTS_TO_VERIFY: [ … exact pages/outlets/docs … ]
OUT_OF_SCOPE: [ items explicitly excluded by the card ]
</criteria>

<timing>
TODAY: {CURRENT_DATE}
DEADLINE: {market_info['resolve_time']}
CATALYSTS: eventDate={market_info['event_date']}, startTime={market_info['start_time']}, closedTime={market_info['close_time']}
ASSUME: piecewise timing — baseline → catalyst window → post-catalyst decay.
If within ±2 days of a catalyst, weight “press-release/official drop” paths higher than organic discovery.
</timing>

<discounts>
ATTRIBUTION_RULE: If clear attribution is required by the card, apply a strong discount to paths with “unidentified/deniable/covert”.
DEFINITION_BREADTH: If broad wording suffices, apply a positive adjustment to paths that produce a minimal qualifying artifact.
State the net ±pp from these two knobs before the final number.
</discounts>

<paths>
Enumerate ≥3 disjoint YES paths. State per-path p.
Assume positive correlation when the same actor/process unlocks multiple paths. Use a correlation haircut; do not multiply as independent.
Give: RAW_NOISY_OR, CORR_HAIRCUT(ρ≈0.3–0.5), FINAL_COMBINED_P.
</paths>

<kill_switch>
Trigger: “If ≥2 mainstream outlets publish a qualifying artifact that matches <criteria/ARTIFACTS_TO_VERIFY>, update to ~1.00 immediately.”
List EXACT 3 pages to watch next (historical/past sources or official repositories relevant to this topic). You do not need to monitor; just list the locations that would have settled it during the window.
</kill_switch>

<consistency_audit>
Flag mutually exclusive claims. For any conflict: mark the edge UNKNOWN and remove it from aggregation. Re-compute FINAL_COMBINED_P.
Conflicts: [ … ]
</consistency_audit>
"""
    content = await openrouter_chat(
        session,
        model="google/gemini-2.5-flash",
        messages=[
            {"role": "system", "content": "You are a rigorous forecasting analyst."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=8000,
        temperature=0.2,
        stream=True,
    )
    if content:
        log_openrouter_response(content, market_url)
    return content

async def final_evaluation_with_perplexity(session: aiohttp.ClientSession, market_info: Dict[str, Any],
                                           all_analyses: str, response_terms: List[str],
                                           price_info: Optional[Dict[str, float]],
                                           perplexity_answers: str,
                                           all_markets: List[Dict[str, Any]], market_url: str) -> Optional[str]:
    if price_info:
        polymarket_data = (
            f"\nLatest Polymarket Market Data:\n"
            f"Consensus center estimate: {price_info['center']}\n"
            f"Lower bound of consensus: {price_info['lower_bound']}\n"
            f"Upper bound of consensus: {price_info['upper_bound']}\n"
        )
    else:
        polymarket_data = "No Polymarket price data available."
    event_context = get_market_context_string(all_markets)
    terms = ", ".join(response_terms)

    prompt = f"""
You are a professional forecaster interviewing for a job.
Today's date: {CURRENT_DATE}

The current date range for the market outcome to occur would be TODAY until the market resolution date.

Market Information:
Title: {market_info['title']}
Description: {market_info['description']}
Resolution Criteria: {market_info['resolution_criteria']}
Open Time: {market_info['open_time']}
Close Time: {market_info['close_time']}
Resolve Time: {market_info['resolve_time']}

Other active event markets:
{event_context}

{polymarket_data}

Agent Analyses:
{all_analyses}

Additional Information from Perplexity:
{perplexity_answers}

First, state today's date. Then, state the market resolution date.

IMPORTANT: YOU MUST state the MARKET TITLE and the MARKET RESOLUTION DESCRIPTION, verbatim. Then ruminate over the differences where the resolution may adjust or change the specifics of what is inferred initially from the title.

Before answering you write:
(a) The time left until the outcome to the question is known.
(b) What the outcome would be if nothing changed.
(c) What you would forecast if there was only a quarter of the time left.
(d) What you would forecast if there was 4x the time left.

At the start, do a deep dive into the resolution criteria and any vagueness or insights we can gain that will likely influence the outcome:Resolution Criteria: {market_info['resolution_criteria']} - wrap your criteria analysis in <criteria></criteria> tags before your final critical judgement. Outline unique specifics or broadness about the resolution criteria.

Consider today's date and what could realistically happen to increase the likelihood of the NO and YES outcomes for the market. 

Compress key factual information from the sources, as well as useful background information which may not be in the sources, into a list of core factual points to reference. Aim for information which is specific, relevant, and covers the core considerations you'll use to make your forecast. For this step, do not draw any conclusions about how a fact will influence your answer or forecast. Place this section of your response in <facts></facts> tags.

Provide a few reasons why the answer might be no. Rate the strength of each reason on a scale of 1-10. Use <no></no> tags.

Provide a few reasons why the answer might be yes. Rate the strength of each reason on a scale of 1-10. Use <yes></yes> tags.

Enumerate ≥3 concrete vehicles and assign path probabilities; combine hazards across paths (not just the hardest one).

If announcement alone resolves YES, weight ‘press-release-only’ paths above closing paths and cap legal blockers’ weight accordingly.

Prioritize RECENT NEWS and fresh happenings. Weigh older sources less.

If today is decision day, anchor on official channels/quick counts; do not increase conviction without named early returns.

Ensure a staleness penalty when appropriate.

Renormalize siblings: “If analyzing a pair inside an event, show the event-level distribution (Pair A, Pair B, …, Other) after renormalization.”

Confidence bounds: “Report p ± CI where CI widens when inputs are stale or sources conflict.”

MINIMAL_TRIGGER
- State the single simplest event that satisfies the market's YES resolution per its criteria.
- List the concrete artifacts/identifiers that would verify it.

TIME_DECAY
- Assume a simple hazard-rate model for the trigger arriving before DEADLINE (constant or piecewise).
- Show how the YES probability would drift each week absent new information.

BLOCKERS
- Enumerate structural blockers (legal, operational, seasonal, capacity) that reduce trigger arrival rate, each with whether it is temporary or structural.

KEY CONSIDERATIONS:

Evidence over narrative (artifact-first, verification watchdogs).

Stateful progression (minimal-trigger state machine driving p-updates).

Parallel causality (multiple independent paths to YES combined properly).

Outside-view discipline (defaults, priors, deadline uplift/decay that beat vibes).

Coherence + unmodeled mass (event-level normalization, “Other” floor).

Driver transparency (explicit ±pp attribution you can learn from later).

Freshness gates & reproducibility (age-aware inputs, manifests/metrics).

Gate > Sentiment
Always find the binding constraint (the minimal trigger / threshold / quorum / approval / artifact) and price that first. When the crowd prices vibes or sentiment, you shade away until the gate is actually satisfied or imminently verifiable by a listed artifact.

Necessary vs. Sufficient
Split drivers into supportive but insufficient (PR, polling, chatter) vs sufficient (official artifact that resolves criteria). Penalize any forecast that leans on the former without the latter.

Joint, not marginal
When the outcome requires multiple conditions (A and B) or a pair/joint event, compute the joint explicitly (and correlation). Markets routinely overprice by treating correlated marginals as if independent.

Unmodeled mass (“Other” floor)
If uncertainty is high (many viable outcomes, big undecided, wide spreads), reserve non-trivial probability for “unlisted/other.” Crowds compress tails; you re-inflate them until concrete evidence collapses them.

Evidence state machine
Tie probability updates to state transitions (Unsignaled → Multi-source → Official → Secondary → Completion). If the state hasn’t advanced, don’t let price momentum alone raise conviction.

Outside view before inside view
Start from base rates (historical success/lead-time/attrition) and only deviate with fresh, multi-source evidence. This systematically discounts narrative overreach in consensus.

Intent → Realization conversion
Convert soft intent metrics (statements, plans, survey intent) into realized rates with attrition/lag models. Apply a haircut unless there’s verifiable logistics that collapse the gap.

Parallel paths & hazards
Model multiple independent routes to YES with per-path hazards and combine as 
1
−
∏
(
1
−
𝑝
path
)
1−∏(1−ppath)
.

ATTENTION: If the market has not resolved to 0% or 100% yet, then that means no event has yet qualified for it. If a recent event appears to have qualified for the resolution, assume the market was created AFTER the recent supposed event.

Aggregate your considerations. Do not summarize or repeat previous points; instead, investigate how the competing factors and mechanisms interact and weigh against each other. Factorize your thinking across (exhaustive, mutually exclusive) cases if and only if it would be beneficial to your reasoning. We have detected that you overestimate world conflict, drama, violence, and crises due to news' negativity bias, which doesn't necessarily represent overall trends or base rates. Similarly, we also have detected you overestimate dramatic, shocking, or emotionally charged news due to news' sensationalism bias. Therefore adjust for news' negativity bias and sensationalism bias by considering reasons to why your provided sources might be biased or exaggerated. If the question is timing based, focus on the amount of time left until the deadline and the realism of how long the outcome is likely to take to be achieved. Will stalling or slow processing delay the outcome until after the deadline? Think like a superforecaster. Use <thinking></thinking> tags for this section of your response.

Based on all available information, including the Perplexity answers, provide a final evaluation of the likelihood of the YES outcome for this market. Consider both the optimistic and pessimistic factors mentioned by the agents, and provide a balanced assessment of the situation. Take into account the consensus estimates from Polymarket, particularly the upper and lower bounds. Alongside a detailed analysis of the importance of time decay and external future factors, provide detailed arguments for and against the outcome. Give a final evaluation using one of the following terms for the outcome:

{terms}

Finally, give a final decimal likelihood of the YES outcome between 0-1. Explain in detail why you agree or disagree with the current Polymarket consensus (if available) and justify any significant deviations from it.

# ── ADDITIONS (1–6) ──────────────────────────────────────────────────────────

**RESOLUTION LOCK.** Work only from the market card’s resolution text. Extract the minimal trigger and the verifying artifacts required to resolve YES. Treat anything not in the card or a named, timestamped primary source as UNKNOWN. Do not price sentiment unless the gate is satisfied or imminently verifiable by a listed artifact.
Return this upfront (restate, do not skip):
<criteria>
MIN_TRIGGER: …
ARTIFACTS_TO_VERIFY: [ … exact pages/outlets/docs … ]
OUT_OF_SCOPE: [ items explicitly excluded by the card ]
</criteria>

<timing>
TODAY: {CURRENT_DATE}
DEADLINE: {market_info['resolve_time']}
CATALYSTS: eventDate={market_info['event_date']}, startTime={market_info['start_time']}, closedTime={market_info['close_time']}
ASSUME: piecewise timing — baseline → catalyst window → post-catalyst decay.
If within ±2 days of a catalyst, weight “press-release/official drop” paths higher than organic discovery.
</timing>

<discounts>
ATTRIBUTION_RULE: If clear attribution is required by the card, apply a strong discount to paths with “unidentified/deniable/covert”.
DEFINITION_BREADTH: If broad wording suffices, apply a positive adjustment to paths that produce a minimal qualifying artifact.
State the net ±pp from these two knobs before the final number.
</discounts>

<paths>
Enumerate ≥3 disjoint YES paths. State per-path p.
Assume positive correlation when the same actor/process unlocks multiple paths. Use a correlation haircut; do not multiply as independent.
Give: RAW_NOISY_OR, CORR_HAIRCUT(ρ≈0.3–0.5), FINAL_COMBINED_P.
</paths>

<kill_switch>
Trigger: “If ≥2 mainstream outlets publish a qualifying artifact that matches <criteria/ARTIFACTS_TO_VERIFY>, update to ~1.00 immediately.”
List EXACT 3 pages to watch next (historical/past sources or official repositories relevant to this topic). You do not need to monitor; just list the locations that would have settled it during the window.
</kill_switch>

<consistency_audit>
Flag mutually exclusive claims. For any conflict: mark the edge UNKNOWN and remove it from aggregation. Re-compute FINAL_COMBINED_P.
Conflicts: [ … ]
</consistency_audit>
"""
    content = await openrouter_chat(
        session,
        model="openai/gpt-5-chat",
        messages=[
            {"role": "system", "content": "You are a rigorous forecasting analyst."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=8000,
        temperature=0.2,
        stream=True,
    )
    if content:
        log_openrouter_response(content, market_url)
    return content

async def generate_final_summary(session: aiohttp.ClientSession, final_evaluations_with_perplexity: List[str], market_url: str) -> Optional[Dict[str, Any]]:
    evaluations_text = "\n\n".join(final_evaluations_with_perplexity)
    prompt = f"""
Given the following final evaluations:

{evaluations_text}

Please provide a summary of the analyses, and compute the average of the numerical predictions.
Return the result as a JSON object with the following fields:

- "summary": a string summarizing the analyses. YOU MUST include a "variability" score, which grades the event on "how much it comes down to a one persons decision or a random event" - a low variability would mean that good analysis, and not luck, determines the likelihood. YOU MUST also give a "description difference" score, which is "the likelihood of the MARKET TITLE inviting or fostering a narrative, while the actual resolution description implies specifics that change the outcome likelihood significantly." If the resolution description specifics do not differ from or alter the MARKET TITLE logic significantly, it would have a low "descirption difference" score.
- "final_numerical_prediction_average": a float representing the average of the numerical predictions.

If there is only a single numerical prediction, just provide that value.
"""
    content = await openrouter_chat(
        session,
        model="google/gemini-2.5-flash",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that summarizes analyses and computes averages of numerical predictions."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    if not content:
        return None
    log_openrouter_response(content, market_url)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return None

# ──────────────────────────────────────────────────────────────────────────────
# Orchestration
# ──────────────────────────────────────────────────────────────────────────────

async def process_market(session: aiohttp.ClientSession, slug: str,
                         num_agents: int, num_sub_agents: int, num_layers: int,
                         num_final_evaluations: int, num_questions_per_evaluation: int,
                         num_final_evaluations_with_perplexity: int) -> bool:
    try:
        all_markets, event_slug = await get_active_event_markets_with_prices(session, slug)
        if not all_markets:
            print("No active markets found in the event containing this market slug.")
            return False

        main_market = None
        for m in all_markets:
            if m['slug'] == slug:
                main_market = m['raw']
                break
        if not main_market:
            print(f"Could not find the main market slug {slug} in the event.")
            return False

        market_info = convert_polymarket_to_question(main_market)
        if event_slug:
            market_url = f"https://polymarket.com/event/{event_slug}/{slug}"
        else:
            market_url = f"https://polymarket.com/market/{slug}"

        print("\n" + "="*50)
        print(f"Processing Market Slug: {slug}")
        print("="*50)
        print("Title: " + market_info['title'])
        print("Description: " + market_info['description'])
        print("Resolution Criteria: " + market_info['resolution_criteria'])
        print("Open Time: " + market_info['open_time'])
        print("Close Time: " + market_info['close_time'])
        print("Resolve Time: " + market_info['resolve_time'])
        print(f"Status: {market_info['status']}")
        print(f"Type: {market_info['type']}")
        print(f"User Permission: {market_info['user_permission']}")

        if market_info['status'] != 'open':
            print(f"Market is not open for forecasting (status: {market_info['status']})")
            return False
        if market_info['type'] != 'binary':
            print(f"Market is not a binary market (type: {market_info['type']})")
            return False
        if market_info['user_permission'] not in ['forecaster', 'predictor']:
            print(f"Bot does not have permission to forecast (permission: {market_info['user_permission']})")
            return False

        price_info = extract_latest_price_info(market_info)
        if price_info:
            print("\nLatest Polymarket Market Data:")
            print(f"Consensus center estimate: {price_info['center']}")
            print(f"Lower bound of consensus: {price_info['lower_bound']}")
            print(f"Upper bound of consensus: {price_info['upper_bound']}")
        else:
            print("\nNo Polymarket price data available.")

        print("\nGenerating forecasting agents...")
        agents_response = await generate_agents(session, market_info, num_agents, all_markets)
        if not agents_response:
            print("Failed to generate agent responses")
            return False

        print("\nParsing agent prompts...")
        agent_prompts = await parse_agent_prompts(session, agents_response)
        if not agent_prompts:
            print("Failed to parse agent prompts")
            return False

        all_analyses = ""
        for i, agent_prompt in enumerate(agent_prompts, 1):
            try:
                print(f"\nProcessing Agent {i}/{len(agent_prompts)}:")
                print(f"Prompt: {agent_prompt}")

                print("Generating sub-agents...")
                sub_agent_prompts = await generate_sub_agents_recursive(
                    session, agent_prompt, num_sub_agents, 1, num_layers, all_markets
                )

                if sub_agent_prompts:
                    print("Querying Perplexity for sub-agents...")
                    sub_agent_results = await query_perplexity_for_sub_agents(session, sub_agent_prompts)
                else:
                    print("No sub-agents generated")
                    sub_agent_results = []

                print("Generating Pessimistic Analysis...")
                pessimistic = await generate_pessimistic_analysis(session, market_info, agent_prompt, all_markets)
                if pessimistic:
                    pessimistic_likelihood = await parse_likelihood(session, pessimistic)
                    all_analyses += f"\nAgent {i} Pessimistic Analysis:\n{pessimistic}\nLikelihood: {pessimistic_likelihood}\n\n"

                print("Generating Optimistic Analysis...")
                optimistic = await generate_optimistic_analysis(session, market_info, agent_prompt, all_markets)
                if optimistic:
                    all_analyses += f"Agent {i} Optimistic Analysis:\n{optimistic}\n\n"

                if sub_agent_results:
                    all_analyses += f"Agent {i} Sub-agent Results:\n" + "\n".join(sub_agent_results) + "\n\n"

            except Exception as e:
                print(f"Error processing agent {i}: {e}")
                continue

            print("=" * 50)

        if not all_analyses:
            print("No analyses were generated")
            return False

        print("\nGenerating initial final evaluations...")
        final_evaluation_tasks = [
            generate_final_evaluation(session, market_info, all_analyses, RESPONSE_TERMS[0], price_info, all_markets, market_url)
            for _ in range(num_final_evaluations)
        ]
        final_evaluations = await asyncio.gather(*final_evaluation_tasks)
        final_evaluations = [fe for fe in final_evaluations if fe]
        if not final_evaluations:
            print("No final evaluations were generated")
            return False

        all_questions: List[Dict[str, str]] = []
        for i, evaluation in enumerate(final_evaluations, 1):
            if evaluation:
                print(f"\nParsing questions from Final Evaluation {i}...")
                parsed_questions = await parse_questions_with_gemini(session, evaluation)
                if parsed_questions:
                    subset = parsed_questions[:num_questions_per_evaluation]
                    all_questions.extend(subset)
                    print(f"Parsed {len(subset)} questions")

        print("\nQuerying Perplexity for additional information...")
        perplexity_answers: List[str] = []
        for item in all_questions:
            if isinstance(item, dict) and 'question' in item and 'factor' in item:
                try:
                    print(f"\nQuerying: {item['question']}")
                    answer = await query_perplexity(session, item['question'])
                    if answer:
                        perplexity_answers.append(
                            f"Factor: {item['factor']}\nQuestion: {item['question']}\nAnswer: {answer}\n"
                        )
                except Exception as e:
                    print(f"Error querying Perplexity: {e}")
                    continue

        if perplexity_answers:
            print(f"\nGenerating {num_final_evaluations_with_perplexity} final evaluation(s) with Perplexity answers...")
            final_evaluations_with_perplexity: List[str] = []
            for i in range(num_final_evaluations_with_perplexity):
                try:
                    evaluation = await final_evaluation_with_perplexity(
                        session,
                        market_info,
                        all_analyses,
                        RESPONSE_TERMS[0],
                        price_info,
                        "\n".join(perplexity_answers),
                        all_markets,
                        market_url,
                    )
                    if evaluation:
                        final_evaluations_with_perplexity.append(evaluation)
                        print(f"Completed final evaluation {i+1} with Perplexity answers")
                except Exception as e:
                    print(f"Error generating final evaluation {i+1}: {e}")
                    continue

            if final_evaluations_with_perplexity:
                print("\nGenerating final summary...")
                final_summary = await generate_final_summary(session, final_evaluations_with_perplexity, market_url)
                if final_summary:
                    print("\nFinal Summary:")
                    print(json.dumps(final_summary, indent=2))
                    avg = final_summary.get('final_numerical_prediction_average')
                    if isinstance(avg, (int, float)):
                        print(f"\nCalculated percentage from final summary: {avg * 100:.2f}%")
                    save_processed_market(slug)
                    return True
                print("Failed to generate final summary.")
            else:
                print("No valid final evaluations with Perplexity were generated.")
        else:
            print("No Perplexity answers to process for final evaluation.")
        return False

    except Exception as e:
        print(f"An error occurred while processing market {slug}: {e}")
        import traceback
        traceback.print_exc()
        return False

# ──────────────────────────────────────────────────────────────────────────────
# NEW: Queue processing orchestration
# ──────────────────────────────────────────────────────────────────────────────

async def process_queue(session: aiohttp.ClientSession, queue_path: str,
                        num_agents: int, num_sub_agents: int, num_layers: int,
                        num_final_evaluations: int, num_questions_per_evaluation: int,
                        num_final_evaluations_with_perplexity: int,
                        force: bool, dequeue: bool) -> None:
    """
    Process a file of slugs (one per line) sequentially until the queue is exhausted
    or all slugs have been attempted. If `dequeue` is True, successfully processed
    slugs are removed from the file after completion.
    """
    try:
        slugs = load_queue_slugs(queue_path)
    except Exception as e:
        print(f"[ERROR] Could not load queue file '{queue_path}': {e}")
        return

    if not slugs:
        print(f"[INFO] Queue '{queue_path}' is empty. Nothing to do.")
        return

    print("\n" + "="*80)
    print(f"[QUEUE] Loaded {len(slugs)} slug(s) from: {queue_path}")
    print("="*80)

    processed_markets = load_processed_markets()
    total = len(slugs)
    success_count = 0
    skip_count = 0
    fail_count = 0

    for idx, slug in enumerate(slugs, start=1):
        print("\n" + "-"*80)
        print(f"[QUEUE] {idx}/{total} -> Slug: {slug}")
        print("-"*80)

        # Respect previous processing unless overridden by --force
        if not force and slug in processed_markets:
            try:
                last_time = datetime.fromisoformat(processed_markets[slug])
            except ValueError:
                last_time = datetime.min
            if datetime.now() - last_time < timedelta(days=7):
                print(f"[QUEUE] Skipping '{slug}' (last analyzed {last_time.isoformat()}; use --force to reprocess).")
                skip_count += 1
                # Optionally dequeue skipped (we do NOT dequeue skipped by default)
                continue

        ok = await process_market(
            session,
            slug,
            num_agents,
            num_sub_agents,
            num_layers,
            num_final_evaluations,
            num_questions_per_evaluation,
            num_final_evaluations_with_perplexity
        )

        if ok:
            print(f"[QUEUE] ✅ Completed: {slug}")
            success_count += 1
            if dequeue:
                removed = dequeue_slug_from_file(queue_path, slug)
                print(f"[QUEUE] Dequeued '{slug}' from file: {'YES' if removed else 'NO (not found)'}")
        else:
            print(f"[QUEUE] ❌ Failed: {slug}")
            fail_count += 1
            # Keep failed slug in queue so it can be retried later.

    print("\n" + "="*80)
    print(f"[QUEUE] Finished. Success={success_count} | Skipped={skip_count} | Failed={fail_count} | Total={total}")
    print("="*80 + "\n")

# ──────────────────────────────────────────────────────────────────────────────
# Entrypoint (CLI args – non-interactive)
# ──────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="PolyRecursiveAgents: end-to-end forecasting pipeline for Polymarket markets."
    )
    # Single-slug mode (retained)
    parser.add_argument("slug", nargs="?", default=DEFAULT_MARKET_SLUG, help="Polymarket market slug")

    # NEW: queue mode
    parser.add_argument("--queue", dest="queue_file", help="Path to a text file with market slugs (one per line). If set, processes each slug sequentially until done.")
    parser.add_argument("--dequeue", action="store_true", help="When using --queue, remove successfully processed slugs from the file.")

    # Shared knobs
    parser.add_argument("--agents", type=int, default=DEFAULT_NUM_AGENTS, help="Number of top-level agents to create")
    parser.add_argument("--sub-agents", type=int, default=DEFAULT_NUM_SUB_AGENTS, help="Number of sub-agents per agent")
    parser.add_argument("--layers", type=int, default=DEFAULT_NUM_LAYERS, help="Number of sub-agent layers")
    parser.add_argument("--final-evals", type=int, default=DEFAULT_NUM_FINAL_EVALS, help="Number of initial final evaluations")
    parser.add_argument("--questions-per-eval", type=int, default=DEFAULT_NUM_QUESTIONS_PER_EVAL, help="Questions to extract per evaluation")
    parser.add_argument("--final-evals-with-px", type=int, default=DEFAULT_NUM_FINAL_EVALS_WITH_PX, help="Number of final evaluations with Perplexity answers")
    parser.add_argument("--force", action="store_true", help="Reprocess even if slug is in processed_markets.json")

    return parser.parse_args()

async def run_single(session: aiohttp.ClientSession, args: argparse.Namespace) -> None:
    slug = args.slug.strip()
    processed_markets = load_processed_markets()
    if slug in processed_markets and not args.force:
        try:
            last_time = datetime.fromisoformat(processed_markets[slug])
        except ValueError:
            last_time = datetime.min
        if datetime.now() - last_time < timedelta(days=7):
            print(
                f"\nSkipping market {slug}; last analyzed on {last_time.isoformat()}"
                " (use --force to reprocess)"
            )
            return

    await process_market(
        session,
        slug,
        args.agents,
        args.sub_agents,
        args.layers,
        args.final_evals,
        args.questions_per_eval,
        args.final_evals_with_px
    )

async def main():
    args = parse_args()

    timeout = aiohttp.ClientTimeout(total=HTTP_TOTAL_TIMEOUT_SECS, connect=HTTP_CONNECT_TIMEOUT_SECS)
    connector = aiohttp.TCPConnector(limit=10)

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        if args.queue_file:
            await process_queue(
                session=session,
                queue_path=args.queue_file,
                num_agents=args.agents,
                num_sub_agents=args.sub_agents,
                num_layers=args.layers,
                num_final_evaluations=args.final_evals,
                num_questions_per_evaluation=args.questions_per_eval,
                num_final_evaluations_with_perplexity=args.final_evals_with_px,
                force=args.force,
                dequeue=args.dequeue
            )
        else:
            await run_single(session, args)

if __name__ == "__main__":
    asyncio.run(main())
