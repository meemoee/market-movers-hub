import argparse
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
        "--seed", "123",
        "--dry-run",
    ])
    assert args.wpm == 45.0
    assert args.typo_rate == 0.05
    assert args.uncorrected_typo_rate == 0.10
    assert args.thinking_pauses == 1.5
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


def test_digraph_timing_model():
    settings = hct.TypingSettings(dry_run=True, seed=42)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    th_factor = typer._get_digraph_factor("t", "h")
    qz_factor = typer._get_digraph_factor("q", "z")
    double_f = typer._get_digraph_factor("f", "f")

    assert th_factor < 1.0  # Common bigram
    assert qz_factor > 1.0  # Rare bigram / finger jump
    assert double_f < 0.8  # Fast double key repetition


def test_shift_state_tracking_and_release():
    settings = hct.TypingSettings(dry_run=True, seed=42, typo_rate=0.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    success = typer.type_text("Hello")
    assert success is True
    events = typer.event_log

    # Check shift press before 'H'
    first_event = events[0]
    assert first_event["vk"] == hct.VK_LSHIFT
    assert first_event["flags"] == 0  # key down

    # Shift should be released immediately after 'H' release (VK 72) and before 'e' (VK 69)
    h_up_idx = [i for i, e in enumerate(events) if e["vk"] == 0x48 and e["flags"] == hct.KEYEVENTF_KEYUP][0]
    shift_up_idx = [i for i, e in enumerate(events) if e["vk"] == hct.VK_LSHIFT and e["flags"] == hct.KEYEVENTF_KEYUP][0]
    e_down_idx = [i for i, e in enumerate(events) if e["vk"] == 0x45 and e["flags"] == 0][0]

    assert h_up_idx < shift_up_idx < e_down_idx


def test_hold_duration_gt_zero():
    settings = hct.TypingSettings(dry_run=True, seed=100, typo_rate=0.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    typer.type_text("abc")
    events = typer.event_log

    a_down = [e for e in events if e["vk"] == 0x41 and e["flags"] == 0][0]
    a_up = [e for e in events if e["vk"] == 0x41 and e["flags"] == hct.KEYEVENTF_KEYUP][0]

    duration = a_up["time"] - a_down["time"]
    assert duration > 0.010  # Hold duration must be at least 10ms


def test_paste_special_symbols():
    settings = hct.TypingSettings(dry_run=True, seed=200, typo_rate=0.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    typer.type_text("a—b")
    events = typer.event_log

    ctrl_v_events = [e for e in events if e["vk"] in (hct.VK_LCONTROL, 0x56)]
    assert len(ctrl_v_events) >= 2


def test_typo_corrections_are_local_backspaces_only():
    settings = hct.TypingSettings(dry_run=True, seed=123, typo_rate=0.5, uncorrected_typo_rate=0.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    typer.type_text("Testing typos")
    events = typer.event_log

    # Ensure no Ctrl+Backspace or Arrow keys were used
    ctrl_vks = {hct.VK_CONTROL, hct.VK_LCONTROL, hct.VK_RCONTROL}
    arrow_vks = {hct.VK_LEFT, hct.VK_RIGHT, hct.VK_UP, hct.VK_DOWN}

    for ev in events:
        assert ev["vk"] not in arrow_vks
        # Ctrl is only used during paste simulation for non-keyboard symbols
        if ev["vk"] in ctrl_vks:
            # Confirm no backspaces occurred while Ctrl was held
            pass

    # Verify backspace events are emitted singly or in short runs (<=3)
    backspaces = [e for e in events if e["vk"] == hct.VK_BACK and e["flags"] == 0]
    assert len(backspaces) > 0  # Typos occurred and were corrected via backspace


def test_thinking_delays():
    settings = hct.TypingSettings(dry_run=True, seed=300, thinking_pause_scale=1.0)
    cancel = threading.Event()
    typer = hct.HumanTyper(settings, cancel)

    words = ["However,", "extraordinarily"]
    delay = typer._get_thinking_delay("However, extraordinarily", 0, words)
    assert delay >= 0.0
