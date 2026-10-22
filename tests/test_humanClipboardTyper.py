import threading
import unittest
from humanClipboardTyper import HumanTyper, TypingSettings, get_key_mapping


class MockSimulatedClock:
    def __init__(self):
        self.clock = 1000.0  # ms

    def sleep(self, seconds: float) -> None:
        self.clock += seconds * 1000.0


class MockHumanTyper(HumanTyper):
    def __init__(self, settings: TypingSettings, cancel_event: threading.Event, clock: MockSimulatedClock):
        super().__init__(settings, cancel_event)
        self.clock = clock

    def _sleep(self, seconds: float) -> bool:
        self.clock.sleep(seconds)
        return not self.cancel_event.is_set()

    def _send_input_events(self, events) -> None:
        for ev in events:
            self.event_log.append({
                "vk": ev.ki.wVk,
                "scan": ev.ki.wScan,
                "flags": ev.ki.dwFlags,
                "time": self.clock.clock / 1000.0,
            })


class ForensicsSimulator:
    def __init__(self):
        self.gaps = []
        self.dwells = []
        self.flights = []
        self.lastKeydownT = None
        self.lastKeyupT = None
        self.downAt = {}
        self.flags = []

    def process_events(self, event_log):
        for ev in event_log:
            flags = ev["flags"]
            is_keyup = bool(flags & 2)
            t = ev["time"] * 1000.0  # ms
            vk = ev["vk"]

            if not is_keyup:
                if self.lastKeydownT is not None:
                    self.gaps.append(t - self.lastKeydownT)
                self.lastKeydownT = t

                if self.lastKeyupT is not None:
                    flight = t - self.lastKeyupT
                    self.flights.append(flight)
                    self.check_rollover()

                self.downAt[vk] = t
            else:
                self.lastKeyupT = t
                if vk in self.downAt:
                    dwell = t - self.downAt.pop(vk)
                    self.dwells.append(dwell)

    def check_rollover(self):
        if len(self.flights) < 12:
            return
        r = self.flights[-30:]
        any_neg = any(f < 0 for f in r)
        mean_f = sum(r) / len(r) if r else 0
        recent_gaps = self.gaps[-30:] if len(self.gaps) >= 30 else self.gaps
        mean_g = sum(recent_gaps) / len(recent_gaps) if recent_gaps else 0

        if not any_neg and mean_f > 0 and len(self.gaps) >= 12 and mean_g < 180:
            self.flags.append(("no-rollover", f"no key overlap across {len(r)} keys at {round(mean_g)} ms gaps"))


class TestHumanClipboardTyper(unittest.TestCase):
    def test_typographical_characters_no_paste(self):
        """Verify that typographical characters map to physical key codes without falling back to paste."""
        em_dash_mapping = get_key_mapping("—")
        self.assertIsNotNone(em_dash_mapping)
        self.assertEqual(em_dash_mapping[0], 0xBD)

        smart_quote_mapping = get_key_mapping("“")
        self.assertIsNotNone(smart_quote_mapping)
        self.assertEqual(smart_quote_mapping[0], 0xDE)

        # Test at 80 WPM so mean gaps are < 180ms, properly exercising the forensics threshold
        clock = MockSimulatedClock()
        settings = TypingSettings(words_per_minute=80.0, dry_run=True, unicode_mode="paste", seed=42)
        cancel_event = threading.Event()
        typer = MockHumanTyper(settings, cancel_event, clock)

        # Mock paste method to verify it's never called for '—'
        paste_called = []
        typer._paste_text = lambda text: paste_called.append(text) or True

        text = "Layer 3 — Behavioral biometrics"
        completed = typer.type_text(text)
        self.assertTrue(completed)
        self.assertEqual(len(paste_called), 0)

    def test_key_rollover_prevents_no_rollover_flag(self):
        """Verify that key events for target text pass forensics without tripping no-rollover."""
        clock = MockSimulatedClock()
        settings = TypingSettings(words_per_minute=38.0, dry_run=True, unicode_mode="paste", seed=42)
        cancel_event = threading.Event()
        typer = MockHumanTyper(settings, cancel_event, clock)

        text = "Layer 3 — Behavioral biometrics"
        completed = typer.type_text(text)
        self.assertTrue(completed)

        sim = ForensicsSimulator()
        sim.process_events(typer.event_log)

        no_rollover_flags = [flag for flag in sim.flags if flag[0] == "no-rollover"]
        self.assertEqual(len(no_rollover_flags), 0)


if __name__ == "__main__":
    unittest.main()
