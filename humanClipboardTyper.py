#!/usr/bin/env python3
"""Type clipboard text with natural, imperfect human timing on Windows.

Run this script, focus any text field, and press Ctrl+Alt+V.  The current
clipboard text is typed one key at a time.  Press F8 to stop an active run.

The script uses only the Python standard library.  Try ``--help`` to change
the hotkeys, speed, typo frequency, or random seed.
"""

from __future__ import annotations

import argparse
import ctypes
import math
import random
import sys
import threading
import time
from ctypes import wintypes
from dataclasses import dataclass


if sys.platform != "win32":
    raise SystemExit("humanClipboardTyper.py currently supports Windows only.")


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

CF_UNICODETEXT = 13
WM_HOTKEY = 0x0312
INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
MOD_NOREPEAT = 0x4000

VK_BACK = 0x08
VK_TAB = 0x09
VK_RETURN = 0x0D

HOTKEY_ID_TYPE = 1
HOTKEY_ID_CANCEL = 2


if ctypes.sizeof(ctypes.c_void_p) == 8:
    ULONG_PTR = ctypes.c_ulonglong
else:
    ULONG_PTR = ctypes.c_ulong


class KEYBDINPUT(ctypes.Structure):
    _fields_ = (
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    )


class MOUSEINPUT(ctypes.Structure):
    # Included so INPUT has the exact union size/alignment expected by Win32,
    # even though this program never emits mouse events.
    _fields_ = (
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    )


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = (
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    )


class INPUT_UNION(ctypes.Union):
    _fields_ = (("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT))


class INPUT(ctypes.Structure):
    _anonymous_ = ("union",)
    _fields_ = (("type", wintypes.DWORD), ("union", INPUT_UNION))


user32.SendInput.argtypes = (wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
user32.SendInput.restype = wintypes.UINT
user32.RegisterHotKey.argtypes = (wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT)
user32.RegisterHotKey.restype = wintypes.BOOL
user32.UnregisterHotKey.argtypes = (wintypes.HWND, ctypes.c_int)
user32.UnregisterHotKey.restype = wintypes.BOOL
user32.GetAsyncKeyState.argtypes = (ctypes.c_int,)
user32.GetAsyncKeyState.restype = wintypes.SHORT
user32.OpenClipboard.argtypes = (wintypes.HWND,)
user32.OpenClipboard.restype = wintypes.BOOL
user32.CloseClipboard.argtypes = ()
user32.CloseClipboard.restype = wintypes.BOOL
user32.IsClipboardFormatAvailable.argtypes = (wintypes.UINT,)
user32.IsClipboardFormatAvailable.restype = wintypes.BOOL
user32.GetClipboardData.argtypes = (wintypes.UINT,)
user32.GetClipboardData.restype = wintypes.HANDLE
kernel32.GlobalLock.argtypes = (wintypes.HGLOBAL,)
kernel32.GlobalLock.restype = ctypes.c_void_p
kernel32.GlobalUnlock.argtypes = (wintypes.HGLOBAL,)
kernel32.GlobalUnlock.restype = wintypes.BOOL


MODIFIER_NAMES = {
    "alt": (MOD_ALT, 0x12),
    "ctrl": (MOD_CONTROL, 0x11),
    "control": (MOD_CONTROL, 0x11),
    "shift": (MOD_SHIFT, 0x10),
    "win": (MOD_WIN, 0x5B),
    "windows": (MOD_WIN, 0x5B),
}

NAMED_KEYS = {
    "backspace": VK_BACK,
    "tab": VK_TAB,
    "enter": VK_RETURN,
    "escape": 0x1B,
    "esc": 0x1B,
    "space": 0x20,
    "pageup": 0x21,
    "pagedown": 0x22,
    "end": 0x23,
    "home": 0x24,
    "left": 0x25,
    "up": 0x26,
    "right": 0x27,
    "down": 0x28,
    "insert": 0x2D,
    "delete": 0x2E,
}

# Nearby keys on a US QWERTY keyboard.  Mistakes preserve capitalization and
# are always corrected, so the final text still matches the clipboard exactly.
NEIGHBORS = {
    "1": "2", "2": "13", "3": "24", "4": "35", "5": "46",
    "6": "57", "7": "68", "8": "79", "9": "80", "0": "9",
    "q": "wa", "w": "qesa", "e": "wrsd", "r": "etdf", "t": "ryfg",
    "y": "tugh", "u": "yihj", "i": "uojk", "o": "ipkl", "p": "ol",
    "a": "qwsz", "s": "awedxz", "d": "serfcx", "f": "drtgvc",
    "g": "ftyhbv", "h": "gyujnb", "j": "huikmn", "k": "jiolm",
    "l": "kop", "z": "asx", "x": "zsdc", "c": "xdfv",
    "v": "cfgb", "b": "vghn", "n": "bhjm", "m": "njk",
}

KEYBOARD_LOOK_SYMBOLS = frozenset("`~!@#$%^&*()_+-=[]{}\\|;:'\",<>/?")
SHIFTED_SYMBOLS = frozenset("~!@#$%^&*()_+{}|:\"<>?")
HARD_SHIFT_SYMBOLS = frozenset("~@#$%^&*_+{}|:\"<>?")
SHIFT_KEY_PAIRS = {
    "`": "~", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%",
    "6": "^", "7": "&", "8": "*", "9": "(", "0": ")", "-": "_",
    "=": "+", "[": "{", "]": "}", "\\": "|", ";": ":", "'": "\"",
    ",": "<", ".": ">", "/": "?",
}
SHIFT_VARIANTS = {
    **SHIFT_KEY_PAIRS,
    **{shifted: plain for plain, shifted in SHIFT_KEY_PAIRS.items()},
}


def requires_shift(character: str | None) -> bool:
    return bool(
        character
        and (
            character in SHIFTED_SYMBOLS
            or (character.isalpha() and character.isupper())
        )
    )


@dataclass(frozen=True)
class Hotkey:
    modifiers: int
    key_code: int
    held_key_codes: tuple[int, ...]
    display: str


@dataclass(frozen=True)
class TypingSettings:
    words_per_minute: float
    typo_rate: float
    start_delay: float
    seed: int | None
    quiet: bool
    thinking_pause_scale: float = 1.0


def parse_hotkey(value: str, *, require_modifier: bool) -> Hotkey:
    parts = [part.strip().lower() for part in value.split("+") if part.strip()]
    if not parts:
        raise argparse.ArgumentTypeError("hotkey cannot be empty")

    modifiers = 0
    held: list[int] = []
    key_code: int | None = None
    normalized: list[str] = []

    for part in parts:
        if part in MODIFIER_NAMES:
            modifier, virtual_key = MODIFIER_NAMES[part]
            if modifier & modifiers:
                raise argparse.ArgumentTypeError(f"duplicate modifier in {value!r}")
            modifiers |= modifier
            held.append(virtual_key)
            normalized.append("Ctrl" if part in {"ctrl", "control"} else part.title())
            continue

        if key_code is not None:
            raise argparse.ArgumentTypeError("a hotkey must contain exactly one non-modifier key")
        if len(part) == 1 and part.isascii() and part.isalnum():
            key_code = ord(part.upper())
            normalized.append(part.upper())
        elif part.startswith("f") and part[1:].isdigit() and 1 <= int(part[1:]) <= 24:
            key_code = 0x70 + int(part[1:]) - 1
            normalized.append(part.upper())
        elif part in NAMED_KEYS:
            key_code = NAMED_KEYS[part]
            normalized.append(part.title())
        else:
            raise argparse.ArgumentTypeError(f"unsupported hotkey key: {part!r}")

    if key_code is None:
        raise argparse.ArgumentTypeError("hotkey is missing its non-modifier key")
    if require_modifier and not modifiers:
        raise argparse.ArgumentTypeError("typing hotkey must include Ctrl, Alt, Shift, or Win")

    held.append(key_code)
    return Hotkey(modifiers, key_code, tuple(held), "+".join(normalized))


def get_clipboard_text(retries: int = 12) -> str:
    """Read Unicode text without changing the clipboard."""
    for attempt in range(retries):
        if user32.OpenClipboard(None):
            break
        time.sleep(0.025 * (attempt + 1))
    else:
        raise OSError("the clipboard is busy; try the hotkey again")

    try:
        if not user32.IsClipboardFormatAvailable(CF_UNICODETEXT):
            raise ValueError("the clipboard does not currently contain text")
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        address = kernel32.GlobalLock(handle)
        if not address:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            return ctypes.wstring_at(address)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def _send_inputs(events: list[INPUT]) -> None:
    array_type = INPUT * len(events)
    sent = user32.SendInput(len(events), array_type(*events), ctypes.sizeof(INPUT))
    if sent != len(events):
        raise ctypes.WinError(ctypes.get_last_error())


def _keyboard_event(*, virtual_key: int = 0, scan_code: int = 0, flags: int = 0) -> INPUT:
    return INPUT(
        type=INPUT_KEYBOARD,
        ki=KEYBDINPUT(
            wVk=virtual_key,
            wScan=scan_code,
            dwFlags=flags,
            time=0,
            dwExtraInfo=0,
        ),
    )


def send_virtual_key(virtual_key: int) -> None:
    _send_inputs(
        [
            _keyboard_event(virtual_key=virtual_key),
            _keyboard_event(virtual_key=virtual_key, flags=KEYEVENTF_KEYUP),
        ]
    )


def send_unicode(text: str) -> None:
    # SendInput accepts UTF-16 code units, including surrogate pairs for emoji.
    encoded = text.encode("utf-16-le", errors="surrogatepass")
    events: list[INPUT] = []
    for offset in range(0, len(encoded), 2):
        unit = int.from_bytes(encoded[offset : offset + 2], "little")
        events.append(_keyboard_event(scan_code=unit, flags=KEYEVENTF_UNICODE))
        events.append(
            _keyboard_event(scan_code=unit, flags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)
        )
    if events:
        _send_inputs(events)


def key_is_down(virtual_key: int) -> bool:
    return bool(user32.GetAsyncKeyState(virtual_key) & 0x8000)


def sleep_interruptibly(seconds: float, cancel_event: threading.Event) -> bool:
    """Sleep until the deadline; return False if cancellation was requested."""
    return not cancel_event.wait(max(0.0, seconds))


class HumanTyper:
    def __init__(self, settings: TypingSettings, cancel_event: threading.Event):
        self.settings = settings
        self.cancel_event = cancel_event
        self.rng = random.Random(settings.seed)
        # Calibrated below the textbook 12/WPM interval so context pauses and
        # visible typo repairs do not drag the overall result out of the
        # fast-typist range.
        # Different activations are a little faster or slower overall, just as
        # the same person varies with focus and familiarity.
        session_pace = min(1.65, max(0.62, self.rng.lognormvariate(-0.02, 0.28)))
        self.base_delay = (9.7 / settings.words_per_minute) * session_pace
        self.rhythm = 1.0
        self.rhythm_left = 0
        self.thinking_cooldown = self.rng.randint(18, 45)
        self._refresh_rhythm()

    def _sleep(self, seconds: float) -> bool:
        return sleep_interruptibly(seconds, self.cancel_event)

    def _emit_character(self, character: str) -> None:
        if character == "\n":
            send_virtual_key(VK_RETURN)
        elif character == "\t":
            send_virtual_key(VK_TAB)
        else:
            send_unicode(character)

    def _backspace(self, count: int = 1) -> bool:
        # Even a fast typist normally has a small recognition gap before the
        # first Backspace, then another reorientation gap before continuing.
        notice_roll = self.rng.random()
        if notice_roll < 0.50:
            notice_delay = self.rng.uniform(0.03, 0.13)
        elif notice_roll < 0.88:
            notice_delay = self.rng.uniform(0.13, 0.50)
        else:
            notice_delay = self.rng.uniform(0.50, 1.40)
        if not self._sleep(notice_delay):
            return False

        cadence_roll = self.rng.random()
        if cadence_roll < 0.35:
            cadence_low, cadence_high = 0.008, 0.035
        elif cadence_roll < 0.80:
            cadence_low, cadence_high = 0.035, 0.130
        else:
            cadence_low, cadence_high = 0.130, 0.320

        for _ in range(count):
            if self.cancel_event.is_set():
                return False
            send_virtual_key(VK_BACK)
            if count > 1 and not self._sleep(self.rng.uniform(cadence_low, cadence_high)):
                return False

        settle_roll = self.rng.random()
        if settle_roll < 0.62:
            settle_delay = self.rng.uniform(0.018, 0.10)
        elif settle_roll < 0.92:
            settle_delay = self.rng.uniform(0.10, 0.38)
        else:
            settle_delay = self.rng.uniform(0.38, 1.00)
        return self._sleep(settle_delay)

    def _refresh_rhythm(self) -> None:
        """Choose a distinct pace for the next short typing stretch."""
        roll = self.rng.random()
        if roll < 0.14:  # sudden sprint
            target = self.rng.uniform(0.18, 0.46)
            length = self.rng.randint(2, 10)
        elif roll < 0.36:  # quick run
            target = self.rng.uniform(0.42, 0.75)
            length = self.rng.randint(3, 16)
        elif roll < 0.65:  # broad normal range
            target = self.rng.uniform(0.75, 1.22)
            length = self.rng.randint(4, 20)
        elif roll < 0.90:  # deliberate slowdown
            target = self.rng.uniform(1.22, 2.15)
            length = self.rng.randint(3, 15)
        else:  # conspicuous hesitation, deliberately rare and brief
            target = self.rng.uniform(2.15, 4.00)
            length = self.rng.randint(1, 7)

        self.rhythm = 0.02 * self.rhythm + 0.98 * target
        self.rhythm_left = length

    def _thinking_delay(self, character: str) -> float:
        """Sometimes stop as if deciding what to say next."""
        if self.settings.thinking_pause_scale <= 0:
            return 0.0

        if self.thinking_cooldown > 0:
            self.thinking_cooldown -= 1
            return 0.0

        if character == "\n":
            chance = 0.22
        elif character in ".!?":
            chance = 0.13
        elif character in ",;:":
            chance = 0.035
        elif character == " ":
            chance = 0.008
        else:
            chance = 0.0002

        chance = min(0.90, chance * self.settings.thinking_pause_scale)
        if self.rng.random() >= chance:
            return 0.0

        # A mixture is more convincing than one uniform range: most pauses are
        # noticeable, some are long, and a few look like genuine deliberation.
        roll = self.rng.random()
        if character in ".!?\n":
            if roll < 0.62:
                delay = self.rng.uniform(0.60, 1.80)
            elif roll < 0.90:
                delay = self.rng.uniform(1.80, 3.80)
            elif roll < 0.985:
                delay = self.rng.uniform(3.80, 7.20)
            else:
                delay = self.rng.uniform(7.20, 10.5)
        else:
            if roll < 0.68:
                delay = self.rng.uniform(0.45, 1.25)
            elif roll < 0.93:
                delay = self.rng.uniform(1.25, 2.90)
            elif roll < 0.99:
                delay = self.rng.uniform(2.90, 5.50)
            else:
                delay = self.rng.uniform(5.50, 8.50)

        self.thinking_cooldown = self.rng.randint(24, 65)

        # People often resume with either a quick remembered phrase or a few
        # cautious keys, rather than returning to exactly the previous pace.
        if self.rng.random() < 0.70:
            self.rhythm = self.rng.uniform(0.40, 0.78)
            self.rhythm_left = self.rng.randint(3, 11)
        else:
            self.rhythm = self.rng.uniform(1.10, 1.62)
            self.rhythm_left = self.rng.randint(2, 7)
        return delay

    def _keyboard_look_delay(self, character: str, next_character: str | None) -> float:
        """Pause mainly when the next character requires holding Shift."""
        delay = 0.0
        next_uses_shift = requires_shift(next_character)
        current_uses_shift = requires_shift(character)

        if next_uses_shift:
            # Starting a Shift chord is the main keyboard-look event.  A run of
            # capitals or shifted symbols is smoother because Shift is already
            # conceptually held down.
            chance = 0.95 if next_character in HARD_SHIFT_SYMBOLS else 0.84
            if current_uses_shift:
                chance *= 0.38
            if self.rng.random() < chance:
                roll = self.rng.random()
                if roll < 0.58:
                    delay += self.rng.uniform(0.07, 0.26)
                elif roll < 0.91:
                    delay += self.rng.uniform(0.26, 0.68)
                else:
                    delay += self.rng.uniform(0.68, 1.30)
        elif (
            next_character is not None
            and next_character in KEYBOARD_LOOK_SYMBOLS
            and self.rng.random() < 0.10
        ):
            # Unshifted punctuation is usually touch-typed; retain only a tiny
            # chance of a short orientation check.
            delay += self.rng.uniform(0.025, 0.12)

        if current_uses_shift and self.rng.random() < 0.68:
            delay += self.rng.uniform(0.035, 0.18)
        return delay

    def _next_delay(self, character: str, next_character: str | None) -> float:
        self.rhythm_left -= 1
        if self.rhythm_left <= 0:
            self._refresh_rhythm()

        delay = self.base_delay * self.rhythm * self.rng.lognormvariate(-0.335, 0.82)

        if character == " ":
            delay *= self.rng.uniform(0.48, 0.92)
            if self.rng.random() < 0.02:
                delay += self.rng.uniform(0.06, 0.20)
        elif character in ",;":
            delay += self.rng.uniform(0.025, 0.12)
        elif character == ":":
            delay += self.rng.uniform(0.07, 0.24)
        elif character in ".!?":
            delay += self.rng.uniform(0.16, 0.52)
        elif character == "\n":
            delay += self.rng.uniform(0.22, 0.78)
        elif character == "\t":
            delay += self.rng.uniform(0.08, 0.25)

        # Familiar letter runs often come out in a quick burst.
        if character.isalpha() and next_character and next_character.isalpha():
            if self.rng.random() < 0.42:
                delay *= self.rng.uniform(0.35, 0.74)

        # Keep a tiny amount of free-floating variation, but most noticeable
        # pauses now have a concrete reason (error, boundary, or awkward key).
        if character not in "\r\n" and self.rng.random() < 0.0002:
            delay += self.rng.uniform(0.12, 0.62)

        delay += self._keyboard_look_delay(character, next_character)
        delay += self._thinking_delay(character)

        return min(11.5, max(0.008, delay))

    def _wrong_neighbor(self, character: str) -> str | None:
        lower = character.lower()
        choices = NEIGHBORS.get(lower)
        if not choices:
            return None
        wrong = self.rng.choice(choices)
        return wrong.upper() if character.isupper() else wrong

    def _retype_run(self, text: str, start: int, count: int) -> bool:
        """Retype a corrected run after backing up over a noticed mistake."""
        correction_roll = self.rng.random()
        if correction_roll < 0.34:
            correction_pace = self.rng.uniform(0.22, 0.50)
        elif correction_roll < 0.80:
            correction_pace = self.rng.uniform(0.52, 1.15)
        else:
            correction_pace = self.rng.uniform(1.15, 2.00)

        for offset in range(count):
            position = start + offset
            character = text[position]
            following = text[position + 1] if position + 1 < len(text) else None
            self._emit_character(character)
            scale = correction_pace * (0.72 if offset == 0 else self.rng.uniform(0.88, 1.12))
            if not self._sleep(self._next_delay(character, following) * scale):
                return False
        return True

    def type_text(self, text: str) -> bool:
        """Type text.  Return True if complete, False if cancelled."""
        # Avoid CRLF becoming two line breaks when Enter is used for newlines.
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        index = 0
        while index < len(text):
            if self.cancel_event.is_set():
                return False

            character = text[index]
            following = text[index + 1] if index + 1 < len(text) else None
            previous = text[index - 1] if index > 0 else None

            # Occasionally miss or double a space.  Space mistakes use a lower
            # rate than letter mistakes but add a very recognizable human slip.
            if character == " " and self.rng.random() < self.settings.typo_rate * 0.62:
                space_kind = self.rng.random()
                if (
                    space_kind < 0.72
                    and following is not None
                    and following.isascii()
                    and following not in "\r\n\t"
                ):
                    # Forget the space, continue for one or two characters,
                    # notice the joined words, back up, and insert it correctly.
                    lookahead = 1
                    if (
                        self.rng.random() < 0.42
                        and index + 2 < len(text)
                        and text[index + 2].isascii()
                        and text[index + 2] not in "\r\n\t"
                    ):
                        lookahead = 2
                    for offset in range(1, lookahead + 1):
                        self._emit_character(text[index + offset])
                        if not self._sleep(self.rng.uniform(0.018, 0.082)):
                            return False
                    if not self._sleep(self.rng.uniform(0.16, 0.72)):
                        return False
                    if not self._backspace(lookahead):
                        return False
                    if not self._sleep(self.rng.uniform(0.045, 0.22)):
                        return False
                    if not self._retype_run(text, index, lookahead + 1):
                        return False
                    index += lookahead + 1
                    continue

                # Hit the space bar twice, then remove the extra space.
                self._emit_character(" ")
                if not self._sleep(self.rng.uniform(0.018, 0.085)):
                    return False
                self._emit_character(" ")
                if not self._sleep(self.rng.uniform(0.08, 0.42)):
                    return False
                if not self._backspace():
                    return False
                if not self._sleep(self._next_delay(character, following)):
                    return False
                index += 1
                continue

            typo_eligible = character.lower() in NEIGHBORS or character in SHIFT_VARIANTS
            make_typo = typo_eligible and self.rng.random() < self.settings.typo_rate

            if make_typo:
                typo_kind = self.rng.random()
                wrong = self._wrong_neighbor(character)
                wrong_shift_state = SHIFT_VARIANTS.get(character)

                if wrong_shift_state is not None and typo_kind < 0.48:
                    # Miss Shift or hold it accidentally on the correct physical
                    # key: ':' becomes ';', '4' becomes '$', and so on.
                    self._emit_character(wrong_shift_state)
                    if not self._sleep(self.rng.uniform(0.07, 0.62)):
                        return False
                    if not self._backspace():
                        return False
                    if not self._sleep(self.rng.uniform(0.035, 0.24)):
                        return False
                    self._emit_character(character)
                    if not self._sleep(self._next_delay(character, following)):
                        return False
                    index += 1
                    continue

                if (
                    typo_kind < 0.11
                    and following is not None
                    and following.lower() in NEIGHBORS
                    and following.lower() != character.lower()
                ):
                    # Transpose two characters, notice it, erase both, and retry.
                    self._emit_character(following)
                    if not self._sleep(self.rng.uniform(0.025, 0.095)):
                        return False
                    self._emit_character(character)
                    if not self._sleep(self.rng.uniform(0.16, 0.58)):
                        return False
                    if not self._backspace(2):
                        return False
                    if not self._sleep(self.rng.uniform(0.07, 0.22)):
                        return False
                    if not self._retype_run(text, index, 2):
                        return False
                    index += 2
                    continue

                if (
                    typo_kind < 0.27
                    and wrong is not None
                    and following is not None
                    and following not in "\r\n\t"
                ):
                    # Keep going for one to three keys before noticing the
                    # earlier error, then back up and retype the whole run.
                    desired_lookahead = self.rng.randint(1, 3)
                    lookahead = 0
                    for offset in range(1, desired_lookahead + 1):
                        position = index + offset
                        if position >= len(text):
                            break
                        candidate = text[position]
                        if not candidate.isascii() or candidate in "\r\n\t":
                            break
                        lookahead += 1

                    self._emit_character(wrong)
                    for offset in range(1, lookahead + 1):
                        if not self._sleep(self.rng.uniform(0.014, 0.075)):
                            return False
                        self._emit_character(text[index + offset])
                    if not self._sleep(self.rng.uniform(0.16, 0.88)):
                        return False
                    run_length = lookahead + 1
                    if not self._backspace(run_length):
                        return False
                    if not self._sleep(self.rng.uniform(0.06, 0.25)):
                        return False
                    if not self._retype_run(text, index, run_length):
                        return False
                    index += run_length
                    continue

                if (
                    typo_kind < 0.36
                    and wrong is not None
                    and previous is not None
                    and previous.isascii()
                    and previous not in "\r\n\t"
                ):
                    # Backspace once too far while fixing the wrong key, then
                    # rebuild both the deleted good character and this one.
                    self._emit_character(wrong)
                    if not self._sleep(self.rng.uniform(0.10, 0.70)):
                        return False
                    if not self._backspace(2):
                        return False
                    if not self._sleep(self.rng.uniform(0.04, 0.26)):
                        return False
                    if not self._retype_run(text, index - 1, 2):
                        return False
                    index += 1
                    continue

                if (
                    typo_kind < 0.47
                    and following is not None
                    and following.isascii()
                    and following not in "\r\n\t"
                ):
                    # Omit the current key, type the next one, then notice and
                    # reconstruct both characters in the right order.
                    self._emit_character(following)
                    if not self._sleep(self.rng.uniform(0.12, 0.66)):
                        return False
                    if not self._backspace():
                        return False
                    if not self._sleep(self.rng.uniform(0.05, 0.23)):
                        return False
                    if not self._retype_run(text, index, 2):
                        return False
                    index += 2
                    continue

                if typo_kind < 0.59:
                    # An accidental doubled or tripled key, corrected after a
                    # variable reaction time.
                    extra_count = 2 if self.rng.random() < 0.22 else 1
                    self._emit_character(character)
                    for _ in range(extra_count):
                        if not self._sleep(self.rng.uniform(0.014, 0.085)):
                            return False
                        self._emit_character(character)
                    if not self._sleep(self.rng.uniform(0.09, 0.55)):
                        return False
                    if not self._backspace(extra_count):
                        return False
                elif typo_kind < 0.69 and wrong is not None:
                    # The intended key lands, but a neighboring key is brushed
                    # immediately afterward and then removed.
                    self._emit_character(character)
                    if not self._sleep(self.rng.uniform(0.012, 0.065)):
                        return False
                    self._emit_character(wrong)
                    if not self._sleep(self.rng.uniform(0.07, 0.48)):
                        return False
                    if not self._backspace():
                        return False
                elif typo_kind < 0.77 and character.isalpha():
                    # Brief capitalization slip, useful for sentence starts and
                    # proper nouns as well as accidental mid-word Shift presses.
                    self._emit_character(character.swapcase())
                    if not self._sleep(self.rng.uniform(0.08, 0.58)):
                        return False
                    if not self._backspace():
                        return False
                    if not self._sleep(self.rng.uniform(0.045, 0.24)):
                        return False
                    self._emit_character(character)
                elif (
                    typo_kind < 0.85
                    and previous is not None
                    and previous.isascii()
                    and previous not in "\r\n\t"
                    and previous != character
                ):
                    # A finger repeats the key it just left instead of reaching
                    # the intended one.
                    self._emit_character(previous)
                    if not self._sleep(self.rng.uniform(0.07, 0.56)):
                        return False
                    if not self._backspace():
                        return False
                    self._emit_character(character)
                elif (
                    typo_kind < 0.93
                    and character.isalpha()
                    and following is not None
                    and following.isalpha()
                ):
                    # Accidental thumb tap inserts a space in the middle of a
                    # word; the intended character remains in place.
                    self._emit_character(character)
                    if not self._sleep(self.rng.uniform(0.012, 0.075)):
                        return False
                    self._emit_character(" ")
                    if not self._sleep(self.rng.uniform(0.08, 0.58)):
                        return False
                    if not self._backspace():
                        return False
                elif wrong is not None:
                    self._emit_character(wrong)
                    if not self._sleep(self.rng.uniform(0.06, 0.68)):
                        return False
                    if not self._backspace():
                        return False
                    if not self._sleep(self.rng.uniform(0.04, 0.26)):
                        return False
                    self._emit_character(character)
                else:
                    self._emit_character(character)
            else:
                self._emit_character(character)

            if not self._sleep(self._next_delay(character, following)):
                return False
            index += 1

        return True


class HotkeyApp:
    def __init__(
        self,
        typing_hotkey: Hotkey,
        cancel_hotkey: Hotkey,
        settings: TypingSettings,
    ) -> None:
        self.typing_hotkey = typing_hotkey
        self.cancel_hotkey = cancel_hotkey
        self.settings = settings
        self.cancel_event = threading.Event()
        self.worker: threading.Thread | None = None
        self.worker_guard = threading.Lock()

    def _beep(self, frequency: int, duration_ms: int) -> None:
        if not self.settings.quiet:
            try:
                kernel32.Beep(frequency, duration_ms)
            except OSError:
                pass

    def _wait_for_trigger_release(self) -> bool:
        # Without this, Ctrl/Alt can still be held when the first letter arrives.
        deadline = time.monotonic() + 2.5
        while any(key_is_down(key) for key in self.typing_hotkey.held_key_codes):
            if self.cancel_event.wait(0.015):
                return False
            if time.monotonic() >= deadline:
                print("[cancelled] Release the typing-hotkey keys before typing starts.")
                return False
        return sleep_interruptibly(self.settings.start_delay, self.cancel_event)

    def _typing_worker(self) -> None:
        try:
            text = get_clipboard_text()
            if not text:
                raise ValueError("the clipboard text is empty")
            if not self._wait_for_trigger_release():
                return

            print(f"[typing] {len(text):,} clipboard characters (press {self.cancel_hotkey.display} to stop)")
            self._beep(880, 55)
            completed = HumanTyper(self.settings, self.cancel_event).type_text(text)
            if completed:
                print("[done] Clipboard text typed successfully.")
                self._beep(1047, 75)
            else:
                print("[cancelled] Typing stopped.")
                self._beep(440, 90)
        except (OSError, ValueError) as error:
            print(f"[error] {error}")
            self._beep(330, 140)
        finally:
            with self.worker_guard:
                self.worker = None

    def start_typing(self) -> None:
        with self.worker_guard:
            if self.worker is not None and self.worker.is_alive():
                print("[busy] Already typing; use the cancel hotkey first.")
                self._beep(520, 50)
                return
            self.cancel_event.clear()
            self.worker = threading.Thread(
                target=self._typing_worker,
                name="human-clipboard-typer",
                daemon=True,
            )
            self.worker.start()

    def cancel_typing(self) -> None:
        with self.worker_guard:
            active = self.worker is not None and self.worker.is_alive()
        if active:
            self.cancel_event.set()

    def run(self) -> None:
        if not user32.RegisterHotKey(
            None,
            HOTKEY_ID_TYPE,
            self.typing_hotkey.modifiers | MOD_NOREPEAT,
            self.typing_hotkey.key_code,
        ):
            raise OSError(
                f"could not register {self.typing_hotkey.display}; another app may already use it"
            )

        cancel_registered = False
        try:
            cancel_registered = bool(
                user32.RegisterHotKey(
                    None,
                    HOTKEY_ID_CANCEL,
                    self.cancel_hotkey.modifiers | MOD_NOREPEAT,
                    self.cancel_hotkey.key_code,
                )
            )
            if not cancel_registered:
                raise OSError(
                    f"could not register {self.cancel_hotkey.display}; another app may already use it"
                )

            print(
                f"[ready] Copy text, focus a text field, then press {self.typing_hotkey.display}."
            )
            print(f"        Press {self.cancel_hotkey.display} to cancel. Close this window to exit.")
            message = wintypes.MSG()
            while True:
                result = user32.GetMessageW(ctypes.byref(message), None, 0, 0)
                if result == 0:
                    break
                if result == -1:
                    raise ctypes.WinError(ctypes.get_last_error())
                if message.message == WM_HOTKEY:
                    if message.wParam == HOTKEY_ID_TYPE:
                        self.start_typing()
                    elif message.wParam == HOTKEY_ID_CANCEL:
                        self.cancel_typing()
        finally:
            self.cancel_event.set()
            user32.UnregisterHotKey(None, HOTKEY_ID_TYPE)
            if cancel_registered:
                user32.UnregisterHotKey(None, HOTKEY_ID_CANCEL)


def positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def probability(value: str) -> float:
    number = float(value)
    if not 0.0 <= number <= 1.0:
        raise argparse.ArgumentTypeError("must be between 0 and 1")
    return number


def nonnegative_float(value: str) -> float:
    number = float(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return number


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Type Windows clipboard text with variable human timing and corrected typos."
    )
    parser.add_argument(
        "--hotkey",
        default="ctrl+alt+v",
        help="global typing shortcut (default: ctrl+alt+v)",
    )
    parser.add_argument(
        "--cancel-hotkey",
        default="f8",
        help="global shortcut that stops active typing (default: f8)",
    )
    parser.add_argument(
        "--wpm",
        type=positive_float,
        default=90.0,
        help="active typing target before deliberate pauses (default: 90)",
    )
    parser.add_argument(
        "--typo-rate",
        type=probability,
        default=0.003,
        help="chance per eligible character of a corrected typo (default: 0.003)",
    )
    parser.add_argument(
        "--start-delay",
        type=positive_float,
        default=0.30,
        help="pause after releasing the trigger before typing (default: 0.30)",
    )
    parser.add_argument(
        "--thinking-pauses",
        type=nonnegative_float,
        default=1.0,
        help="frequency multiplier for long thinking pauses; 0 disables them (default: 1.0)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="fixed random seed for repeatable timing (default: fresh randomness)",
    )
    parser.add_argument("--quiet", action="store_true", help="disable start/finish beeps")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)
    try:
        typing_hotkey = parse_hotkey(args.hotkey, require_modifier=True)
        cancel_hotkey = parse_hotkey(args.cancel_hotkey, require_modifier=False)
    except argparse.ArgumentTypeError as error:
        parser.error(str(error))

    if (
        typing_hotkey.modifiers == cancel_hotkey.modifiers
        and typing_hotkey.key_code == cancel_hotkey.key_code
    ):
        parser.error("typing and cancel hotkeys must be different")

    settings = TypingSettings(
        words_per_minute=args.wpm,
        typo_rate=args.typo_rate,
        start_delay=args.start_delay,
        seed=args.seed,
        quiet=args.quiet,
        thinking_pause_scale=args.thinking_pauses,
    )
    try:
        HotkeyApp(typing_hotkey, cancel_hotkey, settings).run()
    except OSError as error:
        print(f"[error] {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n[stopped]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
