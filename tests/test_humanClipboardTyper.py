import threading
import pytest
from humanClipboardTyper import HumanTyper, TypingSettings, build_argument_parser, VK_LCONTROL, VK_CONTROL


def test_default_typing_settings():
    settings = TypingSettings()
    assert settings.unicode_mode == "unicode"


def test_cli_argument_parser_defaults():
    parser = build_argument_parser()
    args = parser.parse_args([])
    assert args.unicode_mode == "unicode"


def test_unicode_mode_emits_unicode_events_for_em_dash():
    settings = TypingSettings(dry_run=True, seed=42, unicode_mode="unicode")
    cancel_event = threading.Event()
    typer = HumanTyper(settings, cancel_event)

    text = "Layer 3 — Behavioral biometrics"
    completed = typer.type_text(text)
    assert completed is True

    # Confirm no Ctrl modifier keydown (VK_LCONTROL / VK_CONTROL) was emitted for paste
    ctrl_paste_events = [
        ev for ev in typer.event_log if ev["vk"] in (VK_LCONTROL, VK_CONTROL) and not (ev["flags"] & 2)
    ]
    assert len(ctrl_paste_events) == 0

    # Confirm em-dash (ord('—') == 8212) was sent as KEYEVENTF_UNICODE (flags & 4)
    unicode_events = [
        ev for ev in typer.event_log if ev["scan"] == ord("—") and (ev["flags"] & 4)
    ]
    assert len(unicode_events) == 2  # keydown and keyup


def test_forensics_analysis_no_rollover_and_no_paste_flagged():
    settings = TypingSettings(dry_run=True, seed=42, unicode_mode="unicode", words_per_minute=38.0)
    cancel_event = threading.Event()
    typer = HumanTyper(settings, cancel_event)

    text = "Layer 3 — Behavioral biometrics"
    typer.type_text(text)

    # Simulate forensics detectors on generated event log
    start_time = typer.event_log[0]["time"]
    gaps = []
    flights = []
    lastKeydownT = None
    lastKeyupT = None
    ctrl_held = False
    paste_flagged = False
    no_rollover_flagged = False

    for ev in typer.event_log:
        t_ms = (ev["time"] - start_time) * 1000.0
        is_keyup = bool(ev["flags"] & 2)
        vk = ev["vk"]

        if vk in (VK_LCONTROL, VK_CONTROL):
            ctrl_held = not is_keyup

        if vk == 0x56 and ctrl_held and not is_keyup:
            paste_flagged = True

        if is_keyup:
            lastKeyupT = t_ms
        else:
            if lastKeydownT is not None:
                gaps.append(t_ms - lastKeydownT)
            if lastKeyupT is not None:
                flights.append(t_ms - lastKeyupT)

            lastKeydownT = t_ms

            if len(flights) >= 12:
                r = flights[-30:]
                any_neg = any(f < 0 for f in r)
                mean_f = sum(r) / len(r) if r else 0
                r_gaps = gaps[-30:]
                mean_gap = sum(r_gaps) / len(r_gaps) if r_gaps else 0
                if not any_neg and mean_f > 0 and len(gaps) >= 12 and mean_gap < 180:
                    no_rollover_flagged = True

    assert paste_flagged is False
    assert no_rollover_flagged is False
