import argparse
import math
import sys
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import humanClipboardTyper as hct


def test_cli_argument_parsing():
    parser = hct.build_argument_parser()
    args = parser.parse_args([
        "--wpm", "45",
        "--typo-rate", "0.05",
        "--uncorrected-typo-rate", "0.10",
        "--thinking-pauses", "1.5",
        "--unicode-mode", "unicode",
        "--seed", "123",
        "--dry-run",
    ])
    assert args.wpm == 45.0
    assert args.typo_rate == 0.05
    assert args.uncorrected_typo_rate == 0.10
    assert args.thinking_pauses == 1.5
    assert args.unicode_mode == "unicode"
    assert args.seed == 123
    assert args.dry_run is True


def test_parse_hotkey_valid():
    hk = hct.parse_hotkey("ctrl+alt+v", require_modifier=True)
    assert hk.display == "Ctrl+Alt+V"
    assert hk.key_code == ord("V")
    assert hk.modifiers == (hct.MOD_CONTROL | hct.MOD_ALT)


def test_parse_hotkey_invalid():
    with pytest.raises(argparse.ArgumentTypeError):
        hct.parse_hotkey("v", require_modifier=True)


def test_get_key_mapping():
    a_map = hct.get_key_mapping("a")
    assert a_map is not None
    vk, scan, req_shift = a_map
    assert vk == 0x41
    assert scan == 0x1E
    assert req_shift is False

    A_map = hct.get_key_mapping("A")
    assert A_map is not None
    vk, scan, req_shift = A_map
    assert vk == 0x41
    assert scan == 0x1E
    assert req_shift is True

    dash_map = hct.get_key_mapping("—")
    assert dash_map is None


def test_digraph_timing_and_distance_correlation():
    settings = hct.TypingSettings(dry_run=True, seed=42)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    letters = "abcdefghijklmnopqrstuvwxyz"
    pairs = [(a, b) for a in letters for b in letters if a != b]
    dists = [hct.get_key_distance(a, b) for a, b in pairs]
    delays = [typer._next_interkey_delay(a, b) for a, b in pairs]

    mean_d = sum(dists) / len(dists)
    mean_t = sum(delays) / len(delays)
    cov = sum((d - mean_d) * (t - mean_t) for d, t in zip(dists, delays)) / len(dists)
    var_d = sum((d - mean_d) ** 2 for d in dists) / len(dists)
    var_t = sum((t - mean_t) ** 2 for t in delays) / len(dists)
    r = cov / math.sqrt(var_d * var_t)

    assert r >= 0.50  # Strong correlation with physical 2D finger travel distance


def test_word_burst_structure():
    settings = hct.TypingSettings(dry_run=True, seed=42)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    boundary_gaps = [typer._next_interkey_delay(c, "a") for c in [" ", ",", ".", "—"]]
    letter_gaps = [typer._next_interkey_delay(c, "b") for c in ["a", "b", "c", "d"]]

    ratio = (sum(boundary_gaps) / len(boundary_gaps)) / (sum(letter_gaps) / len(letter_gaps))
    assert ratio >= 2.5  # Boundary gap ratio is significantly larger than mid-word letters


def test_latency_right_skewness():
    settings = hct.TypingSettings(dry_run=True, seed=42)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    delays = [typer._next_interkey_delay("a", "b") for _ in range(200)]
    mean_t = sum(delays) / len(delays)
    var_t = sum((t - mean_t) ** 2 for t in delays) / len(delays)
    skew = (sum((t - mean_t) ** 3 for t in delays) / len(delays)) / (var_t ** 1.5)

    assert skew >= 0.5  # Smooth right-skewed lognormal distribution


def test_key_rollover_overlap():
    settings = hct.TypingSettings(dry_run=True, seed=42, typo_rate=0.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    typer.type_text("the quick brown fox jumps over the lazy dog")
    events = typer.event_log

    rollovers = 0
    for i in range(len(events) - 1):
        e1, e2 = events[i], events[i + 1]
        if (e1["flags"] == 0 or e1["flags"] == hct.KEYEVENTF_EXTENDEDKEY) and (
            e2["flags"] == 0 or e2["flags"] == hct.KEYEVENTF_EXTENDEDKEY
        ):
            rollovers += 1

    assert rollovers >= 3  # Key rollover (negative flight time) occurs on fast letter transitions


def test_shift_state_tracking_and_release():
    settings = hct.TypingSettings(dry_run=True, seed=42, typo_rate=0.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    success = typer.type_text("Hello")
    assert success is True
    events = typer.event_log

    first_event = events[0]
    assert first_event["vk"] == hct.VK_LSHIFT
    assert first_event["flags"] == 0  # key down

    h_up_idx = [i for i, e in enumerate(events) if e["vk"] == 0x48 and e["flags"] == hct.KEYEVENTF_KEYUP][0]
    shift_up_idx = [i for i, e in enumerate(events) if e["vk"] == hct.VK_LSHIFT and e["flags"] == hct.KEYEVENTF_KEYUP][0]
    e_down_idx = [i for i, e in enumerate(events) if e["vk"] == 0x45 and e["flags"] == 0][0]

    assert h_up_idx < shift_up_idx < e_down_idx


def test_every_keydown_has_matching_keyup():
    settings = hct.TypingSettings(dry_run=True, seed=100, typo_rate=0.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    typer.type_text("Layer 3 — Behavioral biometrics")
    events = typer.event_log

    vks_down = [e["vk"] for e in events if not (e["flags"] & hct.KEYEVENTF_KEYUP)]
    vks_up = [e["vk"] for e in events if (e["flags"] & hct.KEYEVENTF_KEYUP)]

    assert len(vks_down) == len(vks_up)  # 100% keydown to keyup pairing


def test_passage_pace_drift():
    settings = hct.TypingSettings(dry_run=True, seed=42)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    sample_text = "Layer 3 — Behavioral biometrics. " * 5
    typer.type_text(sample_text)
    events = typer.event_log

    downs = [e for e in events if e["flags"] == 0 and e["vk"] not in (hct.VK_LSHIFT, hct.VK_LCONTROL)]
    times = [e["time"] for e in downs]
    gaps = [t2 - t1 for t1, t2 in zip(times, times[1:])]

    w1 = sum(gaps[:20]) / 20
    w2 = sum(gaps[len(gaps) // 2 - 10 : len(gaps) // 2 + 10]) / 20
    w3 = sum(gaps[-20:]) / 20

    drift = abs(w1 - w2) / w1 + abs(w2 - w3) / w2
    assert drift >= 0.20  # Significant passage pace drift


def test_paste_special_symbols():
    settings = hct.TypingSettings(dry_run=True, seed=200, typo_rate=0.0, unicode_mode="paste")
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    typer.type_text("a—b")
    events = typer.event_log

    ctrl_v_events = [e for e in events if e["vk"] in (hct.VK_LCONTROL, 0x56)]
    assert len(ctrl_v_events) >= 2


def test_unicode_mode_key_events():
    settings = hct.TypingSettings(dry_run=True, seed=200, typo_rate=0.0, unicode_mode="unicode")
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    typer.type_text("a—b")
    events = typer.event_log

    unicode_events = [e for e in events if e["scan"] == ord("—")]
    assert len(unicode_events) == 2  # Unicode keydown and keyup


def test_thinking_delays():
    settings = hct.TypingSettings(dry_run=True, seed=300, thinking_pause_scale=1.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    words = ["However,", "extraordinarily"]
    delay = typer._get_thinking_delay("However, extraordinarily", 0, words)
    assert delay >= 0.0
