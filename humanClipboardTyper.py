#!/usr/bin/env python3
"""Type clipboard text with natural, imperfect human timing on Windows.

Run this script, focus any text field, and press Ctrl+Alt+V. The current
clipboard text is typed one key at a time with realistic biomechanical timing,
proper Shift state events, hold durations, key rollover (negative flight time),
content-aware hesitations, realistic typos (including uncorrected ones), physical
key distance delays, and local backspace editing.

The script uses only the Python standard library. Try ``--help`` to change options.
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
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple


IS_WINDOWS = sys.platform == "win32"

if IS_WINDOWS:
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
else:
    user32 = None
    kernel32 = None

CF_UNICODETEXT = 13
WM_HOTKEY = 0x0312
INPUT_KEYBOARD = 1
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
MOD_NOREPEAT = 0x4000

# Virtual Key Codes
VK_BACK = 0x08
VK_TAB = 0x09
VK_RETURN = 0x0D
VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt
VK_SPACE = 0x20
VK_END = 0x23
VK_HOME = 0x24
VK_LEFT = 0x25
VK_UP = 0x26
VK_RIGHT = 0x27
VK_DOWN = 0x28
VK_DELETE = 0x2E

VK_LSHIFT = 0xA0
VK_RSHIFT = 0xA1
VK_LCONTROL = 0xA2
VK_RCONTROL = 0xA3

VK_NUMPAD0 = 0x60  # VK_NUMPAD0..VK_NUMPAD9 are 0x60..0x69

# Set-1 scan codes for the numeric keypad digits (used for Alt+numpad entry).
NUMPAD_SCAN = {
    0: 0x52, 1: 0x4F, 2: 0x50, 3: 0x51, 4: 0x4B,
    5: 0x4C, 6: 0x4D, 7: 0x47, 8: 0x48, 9: 0x49,
}

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


if IS_WINDOWS and user32 is not None and kernel32 is not None:
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
    user32.EmptyClipboard.argtypes = ()
    user32.EmptyClipboard.restype = wintypes.BOOL
    user32.IsClipboardFormatAvailable.argtypes = (wintypes.UINT,)
    user32.IsClipboardFormatAvailable.restype = wintypes.BOOL
    user32.GetClipboardData.argtypes = (wintypes.UINT,)
    user32.GetClipboardData.restype = wintypes.HANDLE
    user32.SetClipboardData.argtypes = (wintypes.UINT, wintypes.HANDLE)
    user32.SetClipboardData.restype = wintypes.HANDLE
    user32.VkKeyScanW.argtypes = (wintypes.WCHAR,)
    user32.VkKeyScanW.restype = wintypes.SHORT
    user32.MapVirtualKeyW.argtypes = (wintypes.UINT, wintypes.UINT)
    user32.MapVirtualKeyW.restype = wintypes.UINT
    kernel32.GlobalLock.argtypes = (wintypes.HGLOBAL,)
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = (wintypes.HGLOBAL,)
    kernel32.GlobalUnlock.restype = wintypes.BOOL
    kernel32.GlobalAlloc.argtypes = (wintypes.UINT, ctypes.c_size_t)
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL


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
    "space": VK_SPACE,
    "pageup": 0x21,
    "pagedown": 0x22,
    "end": VK_END,
    "home": VK_HOME,
    "left": VK_LEFT,
    "up": VK_UP,
    "right": VK_RIGHT,
    "down": VK_DOWN,
    "insert": 0x2D,
    "delete": VK_DELETE,
}

# Standard US QWERTY physical key mapping (VK, ScanCode, RequiresShift)
QWERTY_MAP: dict[str, tuple[int, int, bool]] = {
    "a": (0x41, 0x1E, False), "b": (0x42, 0x30, False), "c": (0x43, 0x2E, False),
    "d": (0x44, 0x20, False), "e": (0x45, 0x12, False), "f": (0x46, 0x21, False),
    "g": (0x47, 0x22, False), "h": (0x48, 0x23, False), "i": (0x49, 0x17, False),
    "j": (0x4A, 0x24, False), "k": (0x4B, 0x25, False), "l": (0x4C, 0x26, False),
    "m": (0x4D, 0x32, False), "n": (0x4E, 0x31, False), "o": (0x4F, 0x18, False),
    "p": (0x50, 0x19, False), "q": (0x51, 0x10, False), "r": (0x52, 0x13, False),
    "s": (0x53, 0x1F, False), "t": (0x54, 0x14, False), "u": (0x55, 0x16, False),
    "v": (0x56, 0x2F, False), "w": (0x57, 0x11, False), "x": (0x58, 0x2D, False),
    "y": (0x59, 0x15, False), "z": (0x5A, 0x2C, False),

    "A": (0x41, 0x1E, True), "B": (0x42, 0x30, True), "C": (0x43, 0x2E, True),
    "D": (0x44, 0x20, True), "E": (0x45, 0x12, True), "F": (0x46, 0x21, True),
    "G": (0x47, 0x22, True), "H": (0x48, 0x23, True), "I": (0x49, 0x17, True),
    "J": (0x4A, 0x24, True), "K": (0x4B, 0x25, True), "L": (0x4C, 0x26, True),
    "M": (0x4D, 0x32, True), "N": (0x4E, 0x31, True), "O": (0x4F, 0x18, True),
    "P": (0x50, 0x19, True), "Q": (0x51, 0x10, True), "R": (0x52, 0x13, True),
    "S": (0x53, 0x1F, True), "T": (0x54, 0x14, True), "U": (0x55, 0x16, True),
    "V": (0x56, 0x2F, True), "W": (0x57, 0x11, True), "X": (0x58, 0x2D, True),
    "Y": (0x59, 0x15, True), "Z": (0x5A, 0x2C, True),

    "1": (0x31, 0x02, False), "2": (0x32, 0x03, False), "3": (0x33, 0x04, False),
    "4": (0x34, 0x05, False), "5": (0x35, 0x06, False), "6": (0x36, 0x07, False),
    "7": (0x37, 0x08, False), "8": (0x38, 0x09, False), "9": (0x39, 0x0A, False),
    "0": (0x30, 0x0B, False),

    "!": (0x31, 0x02, True), "@": (0x32, 0x03, True), "#": (0x33, 0x04, True),
    "$": (0x34, 0x05, True), "%": (0x35, 0x06, True), "^": (0x36, 0x07, True),
    "&": (0x37, 0x08, True), "*": (0x38, 0x09, True), "(": (0x39, 0x0A, True),
    ")": (0x30, 0x0B, True),

    "`": (0xC0, 0x29, False), "~": (0xC0, 0x29, True),
    "-": (0xBD, 0x0C, False), "_": (0xBD, 0x0C, True),
    "=": (0xBB, 0x0D, False), "+": (0xBB, 0x0D, True),
    "[": (0xDB, 0x1A, False), "{": (0xDB, 0x1A, True),
    "]": (0xDD, 0x1B, False), "}": (0xDD, 0x1B, True),
    "\\": (0xDC, 0x2B, False), "|": (0xDC, 0x2B, True),
    ";": (0xBA, 0x27, False), ":": (0xBA, 0x27, True),
    "'": (0xDE, 0x28, False), '"': (0xDE, 0x28, True),
    ",": (0xBC, 0x33, False), "<": (0xBC, 0x33, True),
    ".": (0xBE, 0x34, False), ">": (0xBE, 0x34, True),
    "/": (0xBF, 0x35, False), "?": (0xBF, 0x35, True),

    " ": (VK_SPACE, 0x39, False),
    "\n": (VK_RETURN, 0x1C, False),
    "\t": (VK_TAB, 0x0F, False),
}

# 2D physical key coordinates on standard QWERTY keyboard (row, col)
KEY_POSITIONS: dict[str, tuple[float, float]] = {
    "`": (0.0, 0.0), "~": (0.0, 0.0),
    "1": (0.0, 1.0), "!": (0.0, 1.0),
    "2": (0.0, 2.0), "@": (0.0, 2.0),
    "3": (0.0, 3.0), "#": (0.0, 3.0),
    "4": (0.0, 4.0), "$": (0.0, 4.0),
    "5": (0.0, 5.0), "%": (0.0, 5.0),
    "6": (0.0, 6.0), "^": (0.0, 6.0),
    "7": (0.0, 7.0), "&": (0.0, 7.0),
    "8": (0.0, 8.0), "*": (0.0, 8.0),
    "9": (0.0, 9.0), "(": (0.0, 9.0),
    "0": (0.0, 10.0), ")": (0.0, 10.0),
    "-": (0.0, 11.0), "_": (0.0, 11.0),
    "=": (0.0, 12.0), "+": (0.0, 12.0),

    "q": (1.0, 1.5), "Q": (1.0, 1.5),
    "w": (1.0, 2.5), "W": (1.0, 2.5),
    "e": (1.0, 3.5), "E": (1.0, 3.5),
    "r": (1.0, 4.5), "R": (1.0, 4.5),
    "t": (1.0, 5.5), "T": (1.0, 5.5),
    "y": (1.0, 6.5), "Y": (1.0, 6.5),
    "u": (1.0, 7.5), "U": (1.0, 7.5),
    "i": (1.0, 8.5), "I": (1.0, 8.5),
    "o": (1.0, 9.5), "O": (1.0, 9.5),
    "p": (1.0, 10.5), "P": (1.0, 10.5),
    "[": (1.0, 11.5), "{": (1.0, 11.5),
    "]": (1.0, 12.5), "}": (1.0, 12.5),
    "\\": (1.0, 13.5), "|": (1.0, 13.5),

    "a": (2.0, 1.8), "A": (2.0, 1.8),
    "s": (2.0, 2.8), "S": (2.0, 2.8),
    "d": (2.0, 3.8), "D": (2.0, 3.8),
    "f": (2.0, 4.8), "F": (2.0, 4.8),
    "g": (2.0, 5.8), "G": (2.0, 5.8),
    "h": (2.0, 6.8), "H": (2.0, 6.8),
    "j": (2.0, 7.8), "J": (2.0, 7.8),
    "k": (2.0, 8.8), "K": (2.0, 8.8),
    "l": (2.0, 9.8), "L": (2.0, 9.8),
    ";": (2.0, 10.8), ":": (2.0, 10.8),
    "'": (2.0, 11.8), '"': (2.0, 11.8),
    "\n": (2.0, 12.8),

    "z": (3.0, 2.3), "Z": (3.0, 2.3),
    "x": (3.0, 3.3), "X": (3.0, 3.3),
    "c": (3.0, 4.3), "C": (3.0, 4.3),
    "v": (3.0, 5.3), "V": (3.0, 5.3),
    "b": (3.0, 6.3), "B": (3.0, 6.3),
    "n": (3.0, 7.3), "N": (3.0, 7.3),
    "m": (3.0, 8.3), "M": (3.0, 8.3),
    ",": (3.0, 9.3), "<": (3.0, 9.3),
    ".": (3.0, 10.3), ">": (3.0, 10.3),
    "/": (3.0, 11.3), "?": (3.0, 11.3),

    " ": (4.0, 6.0),
}

# Nearby physical neighbor keys on QWERTY
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

# Windows Alt+numpad decimal codes for common characters that have no physical
# key on a US layout. Typing these via the numeric keypad uses only real key
# events, so it emits no clipboard paste event and no Unicode/VK_PACKET keydown
# (both of which forensics tools flag). Codes are the leading-zero decimal form
# (Alt+0151 -> em dash), which resolves through the active code page / Unicode.
ALT_CODES: dict[str, str] = {
    "—": "0151",  # — em dash
    "–": "0150",  # – en dash
    "‘": "0145",  # ' left single quote
    "’": "0146",  # ' right single quote / apostrophe
    "“": "0147",  # " left double quote
    "”": "0148",  # " right double quote
    "…": "0133",  # … horizontal ellipsis
    "•": "0149",  # • bullet
    "©": "0169",  # © copyright
    "®": "0174",  # ® registered
    "™": "0153",  # ™ trademark
    "°": "0176",  # ° degree
    "½": "0189",  # ½
    "¼": "0188",  # ¼
    "¾": "0190",  # ¾
    "é": "0233",  # é
    "è": "0232",  # è
    "ê": "0234",  # ê
    "ñ": "0241",  # ñ
    "€": "0128",  # € euro
    "£": "0163",  # £ pound
    "¢": "0162",  # ¢ cent
}

# Biomechanical hand and finger assignments
FINGER_MAP: dict[str, tuple[str, int]] = {
    # Left hand
    "q": ("L", 1), "a": ("L", 1), "z": ("L", 1), "1": ("L", 1), "`": ("L", 1), "~": ("L", 1),
    "w": ("L", 2), "s": ("L", 2), "x": ("L", 2), "2": ("L", 2),
    "e": ("L", 3), "d": ("L", 3), "c": ("L", 3), "3": ("L", 3),
    "r": ("L", 4), "f": ("L", 4), "v": ("L", 4), "4": ("L", 4),
    "t": ("L", 4), "g": ("L", 4), "b": ("L", 4), "5": ("L", 4), "6": ("L", 4),
    " ": ("L", 5),

    # Right hand
    "y": ("R", 4), "h": ("R", 4), "n": ("R", 4), "7": ("R", 4),
    "u": ("R", 4), "j": ("R", 4), "m": ("R", 4), "8": ("R", 4),
    "i": ("R", 3), "k": ("R", 3), ",": ("R", 3), "<": ("R", 3), "9": ("R", 3),
    "o": ("R", 2), "l": ("R", 2), ".": ("R", 2), ">": ("R", 2), "0": ("R", 2),
    "p": ("R", 1), ";": ("R", 1), ":": ("R", 1), "'": ("R", 1), '"': ("R", 1),
    "/": ("R", 1), "?": ("R", 1), "[": ("R", 1), "{": ("R", 1), "]": ("R", 1),
    "}": ("R", 1), "-": ("R", 1), "_": ("R", 1), "=": ("R", 1), "+": ("R", 1),
    "\\": ("R", 1), "|": ("R", 1), "\n": ("R", 1),
}

COMMON_BIGRAMS = frozenset({
    "th", "he", "in", "er", "an", "re", "nd", "at", "on", "nt",
    "ha", "es", "st", "en", "ed", "to", "it", "ou", "ea", "hi",
    "is", "or", "ti", "as", "te", "et", "ng", "of", "al", "de",
    "se", "le", "sa", "si", "ar", "ve", "ra", "ld", "ur", "ch",
    "sh", "io", "le", "me", "ly", "co", "ro", "li", "pe", "ce",
})

RARE_BIGRAMS = frozenset({
    "qz", "jx", "zx", "qg", "vk", "qj", "xj", "fp", "qp", "vj",
    "zf", "zq", "jq", "qv", "jz", "wx", "fz", "vq", "fx", "bx",
})

TRANSITION_WORDS = frozenset({
    "however", "therefore", "nevertheless", "meanwhile", "consequently",
    "furthermore", "although", "because", "instead", "otherwise",
    "specifically", "additionally", "moreover", "in", "on", "for",
    "example", "instance", "besides", "despite", "whereas",
})


def get_key_mapping(character: str) -> tuple[int, int, bool] | None:
    """Return (virtual_key, scan_code, requires_shift) for character, or None if special."""
    if IS_WINDOWS and user32 is not None and hasattr(user32, "VkKeyScanW"):
        try:
            res = user32.VkKeyScanW(character)
            if res != -1 and (res & 0xFFFF) != 0xFFFF:
                vk = res & 0xFF
                shift_state = (res >> 8) & 0xFF
                if shift_state in (0, 1):
                    scan = 0
                    if hasattr(user32, "MapVirtualKeyW"):
                        scan = user32.MapVirtualKeyW(vk, 0)
                    if not scan and character in QWERTY_MAP:
                        scan = QWERTY_MAP[character][1]
                    return (vk, scan, bool(shift_state & 1))
        except Exception:
            pass
    return QWERTY_MAP.get(character)


def requires_shift_state(character: str | None) -> bool:
    if not character:
        return False
    mapping = get_key_mapping(character)
    if mapping:
        return mapping[2]
    return False


def get_key_distance(c1: str, c2: str) -> float:
    """Calculate 2D finger travel distance between c1 and c2. Alternate hands = 0."""
    f1 = FINGER_MAP.get(c1.lower())
    f2 = FINGER_MAP.get(c2.lower())
    if f1 and f2 and f1[0] != f2[0]:
        return 0.0  # Alternate hands requires 0 finger travel across hand

    pos1 = KEY_POSITIONS.get(c1)
    pos2 = KEY_POSITIONS.get(c2)
    if not pos1 or not pos2:
        return 0.0
    r1, c1_pos = pos1
    r2, c2_pos = pos2
    return math.sqrt((r2 - r1) ** 2 + (c2_pos - c1_pos) ** 2)


@dataclass(frozen=True)
class Hotkey:
    modifiers: int
    key_code: int
    held_key_codes: tuple[int, ...]
    display: str


@dataclass(frozen=True)
class TypingSettings:
    words_per_minute: float = 38.0
    typo_rate: float = 0.02
    uncorrected_typo_rate: float = 0.08
    start_delay: float = 0.30
    seed: int | None = None
    quiet: bool = False
    thinking_pause_scale: float = 1.0
    dry_run: bool = False
    unicode_mode: str = "altcode"
    pace_floor: float = 0.22


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
    if not IS_WINDOWS or user32 is None or kernel32 is None:
        return ""

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


def set_clipboard_text(text: str) -> None:
    """Set Unicode text on clipboard."""
    if not IS_WINDOWS or user32 is None or kernel32 is None:
        return
    if not user32.OpenClipboard(None):
        return
    try:
        user32.EmptyClipboard()
        encoded = text.encode("utf-16-le") + b"\x00\x00"
        h_mem = kernel32.GlobalAlloc(0x0002, len(encoded))
        if h_mem:
            ptr = kernel32.GlobalLock(h_mem)
            if ptr:
                ctypes.memmove(ptr, encoded, len(encoded))
                kernel32.GlobalUnlock(h_mem)
                user32.SetClipboardData(CF_UNICODETEXT, h_mem)
    finally:
        user32.CloseClipboard()


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


def sleep_interruptibly(seconds: float, cancel_event: threading.Event) -> bool:
    """Sleep until deadline; return False if cancelled."""
    if seconds <= 0:
        return not cancel_event.is_set()
    return not cancel_event.wait(seconds)


class HumanTyper:
    def __init__(self, settings: TypingSettings, cancel_event: threading.Event):
        self.settings = settings
        self.cancel_event = cancel_event
        self.rng = random.Random(settings.seed)
        self.shift_held = False
        self.event_log: list[dict[str, Any]] = []

        # Target WPM base delay calculation
        session_pace = self.rng.lognormvariate(0.0, 0.12)
        self.base_delay = (12.0 / settings.words_per_minute) * session_pace
        self.pace_drift = 1.0  # Cumulative non-stationary pace drift
        self.thinking_cooldown = self.rng.randint(15, 35)

        # Active held key state for key rollover tracking: tuple of (vk, scan, is_extended) or None
        self.pending_key_release: tuple[int, int, bool] | None = None

        # Monotonic timestamps of recent key-DOWN events (every key the OS/browser
        # would see, including Shift/Ctrl/numpad). Used by the pace guard to keep
        # the rolling inter-keydown gap mean above the no-rollover floor.
        self._down_times: list[float] = []

    def _sleep(self, seconds: float) -> bool:
        return sleep_interruptibly(seconds, self.cancel_event)

    def _send_input_events(self, events: list[INPUT]) -> None:
        # Record every key-DOWN's send time (keyups excluded): this is the
        # inter-keydown gap stream the forensics rollover check measures.
        for ev in events:
            if ev.type == INPUT_KEYBOARD and not (ev.ki.dwFlags & KEYEVENTF_KEYUP):
                self._down_times.append(time.monotonic())
                if len(self._down_times) > 64:
                    del self._down_times[:-64]

        if self.settings.dry_run or not IS_WINDOWS or user32 is None:
            for ev in events:
                self.event_log.append({
                    "vk": ev.ki.wVk,
                    "scan": ev.ki.wScan,
                    "flags": ev.ki.dwFlags,
                    "time": time.monotonic(),
                })
            return

        array_type = INPUT * len(events)
        sent = user32.SendInput(len(events), array_type(*events), ctypes.sizeof(INPUT))
        if sent != len(events):
            raise ctypes.WinError(ctypes.get_last_error())

    def _press_key_event(self, virtual_key: int, scan_code: int, flags: int = 0) -> None:
        self._send_input_events([_keyboard_event(virtual_key=virtual_key, scan_code=scan_code, flags=flags)])

    def _flush_pending_release(self) -> None:
        """Release any pending held key from key rollover."""
        if self.pending_key_release:
            vk, scan, is_ext = self.pending_key_release
            self.pending_key_release = None
            ext_flag = KEYEVENTF_EXTENDEDKEY if is_ext else 0
            self._press_key_event(vk, scan, ext_flag | KEYEVENTF_KEYUP)

    def _press_and_release_key(
        self,
        virtual_key: int,
        scan_code: int,
        is_extended: bool = False,
        next_is_rollover_candidate: bool = False,
    ) -> bool:
        ext_flag = KEYEVENTF_EXTENDEDKEY if is_extended else 0

        # Sample hold duration log-normally (mean ~38ms, bounded 18ms..85ms)
        hold_time = self.rng.lognormvariate(math.log(0.038), 0.22)
        hold_time = min(0.085, max(0.018, hold_time))

        self._press_key_event(virtual_key, scan_code, ext_flag)

        # Flush ANY previously pending key release AFTER pressing THIS key down!
        # This produces TRUE key rollover / negative flight time (Key N+1 down BEFORE Key N up)!
        self._flush_pending_release()

        # Decide key rollover (negative flight time): press next key down before releasing this key
        # Rollover occurs on ~50% of letter-to-letter transitions
        is_rollover = (
            next_is_rollover_candidate
            and not self.shift_held
            and self.rng.random() < 0.50
            and virtual_key not in (VK_SPACE, VK_RETURN, VK_TAB, VK_BACK)
        )

        if is_rollover:
            overlap_time = hold_time * self.rng.uniform(0.35, 0.65)
            if not self._sleep(overlap_time):
                self._press_key_event(virtual_key, scan_code, ext_flag | KEYEVENTF_KEYUP)
                return False
            # Defer key release until after next key's keydown!
            self.pending_key_release = (virtual_key, scan_code, is_extended)
            return True

        # Standard non-rollover key release
        try:
            if not self._sleep(hold_time):
                return False
        finally:
            self._press_key_event(virtual_key, scan_code, ext_flag | KEYEVENTF_KEYUP)
        return True

    def _send_unicode_key(self, character: str) -> bool:
        """Send non-keyboard character as Unicode keydown and keyup with hold time."""
        self._flush_pending_release()
        if not self._set_shift_state(False):
            return False

        code_unit = ord(character)
        hold_time = self.rng.lognormvariate(math.log(0.038), 0.22)
        hold_time = min(0.085, max(0.018, hold_time))

        self._send_input_events([_keyboard_event(scan_code=code_unit, flags=KEYEVENTF_UNICODE)])
        try:
            if not self._sleep(hold_time):
                return False
        finally:
            self._send_input_events([_keyboard_event(scan_code=code_unit, flags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)])
        return True

    def _send_alt_code(self, digits: str) -> bool:
        """Type an unmapped character via a Windows Alt+numpad code (e.g. Alt+0151
        -> em dash).

        This holds Left Alt, taps the decimal code on the numeric keypad, and
        releases Alt, which commits the character. Every event is a real key with
        a physical scan code, so -- unlike Ctrl+V paste or Unicode/VK_PACKET
        injection -- it fires no `paste` event and no empty-`code` keydown. The
        final digit -> Alt-release gap is kept short so the resulting insertText
        lands within the detector's 60 ms "text with no keystroke" window.
        """
        self._flush_pending_release()
        if not self._set_shift_state(False):
            return False

        alt_vk, alt_scan = VK_MENU, 0x38

        self._press_key_event(alt_vk, alt_scan, 0)  # Alt down, held for the code
        if not self._sleep(min(0.080, max(0.020, self.rng.lognormvariate(math.log(0.045), 0.25)))):
            self._press_key_event(alt_vk, alt_scan, KEYEVENTF_KEYUP)
            return False

        last = len(digits) - 1
        for i, ch in enumerate(digits):
            n = int(ch)
            vk = VK_NUMPAD0 + n
            scan = NUMPAD_SCAN[n]
            if i == last:
                hold = min(0.030, max(0.016, self.rng.lognormvariate(math.log(0.022), 0.20)))
            else:
                hold = min(0.070, max(0.020, self.rng.lognormvariate(math.log(0.040), 0.22)))

            self._press_key_event(vk, scan, 0)
            if not self._sleep(hold):
                self._press_key_event(vk, scan, KEYEVENTF_KEYUP)
                self._press_key_event(alt_vk, alt_scan, KEYEVENTF_KEYUP)
                return False
            self._press_key_event(vk, scan, KEYEVENTF_KEYUP)

            if i < last:
                gap = min(0.12, max(0.030, self.rng.lognormvariate(math.log(0.060), 0.30)))
                if not self._sleep(gap):
                    self._press_key_event(alt_vk, alt_scan, KEYEVENTF_KEYUP)
                    return False

        # tight pause then release Alt -> character is committed on this keyup
        if not self._sleep(self.rng.uniform(0.008, 0.018)):
            self._press_key_event(alt_vk, alt_scan, KEYEVENTF_KEYUP)
            return False
        self._press_key_event(alt_vk, alt_scan, KEYEVENTF_KEYUP)

        return self._sleep(min(0.20, max(0.030, self.rng.lognormvariate(math.log(0.080), 0.30))))

    def _set_shift_state(self, hold_shift: bool) -> bool:
        if self.shift_held == hold_shift:
            return True

        self._flush_pending_release()
        shift_vk = VK_LSHIFT
        shift_scan = 0x2A

        if hold_shift:
            self._press_key_event(shift_vk, shift_scan, 0)
            self.shift_held = True
            shift_delay = self.rng.lognormvariate(math.log(0.028), 0.22)
            return self._sleep(min(0.055, max(0.012, shift_delay)))
        else:
            self._press_key_event(shift_vk, shift_scan, KEYEVENTF_KEYUP)
            self.shift_held = False
            shift_delay = self.rng.lognormvariate(math.log(0.020), 0.22)
            return self._sleep(min(0.045, max(0.010, shift_delay)))

    def _paste_text(self, text: str) -> bool:
        """Paste unicode text via Ctrl+V for non-keyboard symbols."""
        self._flush_pending_release()
        if not self._set_shift_state(False):
            return False

        orig_clip = ""
        try:
            orig_clip = get_clipboard_text()
        except Exception:
            pass

        set_clipboard_text(text)

        ctrl_vk, ctrl_scan = VK_LCONTROL, 0x1D
        v_vk, v_scan = 0x56, 0x2F

        # Micro-hesitation before paste chord
        if not self._sleep(self.rng.lognormvariate(math.log(0.080), 0.30)):
            return False

        self._press_key_event(ctrl_vk, ctrl_scan, 0)
        try:
            if not self._sleep(self.rng.lognormvariate(math.log(0.032), 0.25)):
                return False

            if not self._press_and_release_key(v_vk, v_scan):
                return False
        finally:
            self._press_key_event(ctrl_vk, ctrl_scan, KEYEVENTF_KEYUP)

        if not self._sleep(self.rng.lognormvariate(math.log(0.060), 0.30)):
            return False

        if orig_clip:
            try:
                set_clipboard_text(orig_clip)
            except Exception:
                pass
        return True

    def _emit_character(self, character: str, next_character: str | None = None) -> bool:
        mapping = get_key_mapping(character)
        if mapping is None:
            self._flush_pending_release()
            mode = self.settings.unicode_mode
            if mode == "altcode" and character in ALT_CODES:
                return self._send_alt_code(ALT_CODES[character])
            if mode == "unicode":
                return self._send_unicode_key(character)
            # "paste", or "altcode" with no known code for this symbol
            return self._paste_text(character)

        vk, scan, req_shift = mapping

        # Check if next character is candidate for key rollover (both letters)
        next_is_letter = bool(next_character and next_character.isalpha())
        cur_is_letter = character.isalpha()
        rollover_candidate = cur_is_letter and next_is_letter

        if not self._set_shift_state(req_shift):
            return False

        is_ext = vk in (VK_LEFT, VK_RIGHT, VK_UP, VK_DOWN, VK_HOME, VK_END, VK_DELETE)
        res = self._press_and_release_key(
            vk, scan, is_extended=is_ext, next_is_rollover_candidate=rollover_candidate
        )

        # Release Shift immediately after character key press if next char does not require Shift
        if self.shift_held and not requires_shift_state(next_character):
            self._set_shift_state(False)

        return res

    def _backspace(self, count: int = 1) -> bool:
        self._flush_pending_release()
        notice_delay = self.rng.lognormvariate(math.log(0.18), 0.45)
        if not self._sleep(min(0.80, max(0.04, notice_delay))):
            return False

        for i in range(count):
            if self.cancel_event.is_set():
                return False
            if not self._press_and_release_key(VK_BACK, 0x0E):
                return False
            if i < count - 1:
                cadence = self.rng.lognormvariate(math.log(0.065), 0.35)
                if not self._sleep(min(0.25, max(0.02, cadence))):
                    return False

        settle_delay = self.rng.lognormvariate(math.log(0.12), 0.40)
        return self._sleep(min(0.60, max(0.03, settle_delay)))

    def _get_digraph_factor(self, c1: str, c2: str) -> float:
        """Biomechanical digraph delay multiplier based on physical key distance, hands, and fingers."""
        c1_low, c2_low = c1.lower(), c2.lower()

        if c1_low == c2_low and c1_low.isalpha():
            return 0.60  # Double letter fast repetition

        bigram = c1_low + c2_low
        if bigram in COMMON_BIGRAMS:
            return 0.68
        if bigram in RARE_BIGRAMS:
            return 1.50

        dist = get_key_distance(c1, c2)
        dist_factor = 0.40 + 0.35 * dist  # Direct linear scaling with finger travel distance

        f1 = FINGER_MAP.get(c1_low)
        f2 = FINGER_MAP.get(c2_low)

        if not f1 or not f2:
            return dist_factor

        hand1, finger1 = f1
        hand2, finger2 = f2

        if hand1 != hand2:
            return dist_factor * 0.65  # Alternate hands (fast)
        if finger1 != finger2:
            return dist_factor * 0.95  # Same hand, different fingers
        # Same hand, same finger (finger jump / stretch)
        return dist_factor * 1.60

    def _get_thinking_delay(self, text: str, word_index: int, words: list[str]) -> float:
        """Content-aware hesitation before typing a word or clause."""
        if self.settings.thinking_pause_scale <= 0:
            return 0.0

        if self.thinking_cooldown > 0:
            self.thinking_cooldown -= 1
            return 0.0

        word = words[word_index] if word_index < len(words) else ""
        clean_word = word.strip(".,!?:;\"'()[]{}—").lower()

        prob = 0.002
        mu_pause = math.log(0.8)

        if word_index == 0 or (word_index > 0 and words[word_index - 1].endswith((".", "!", "?", "\n"))):
            prob = 0.35
            mu_pause = math.log(1.8)
        elif word_index > 0 and words[word_index - 1].endswith((",", ";", ":", "—")):
            prob = 0.18
            mu_pause = math.log(1.1)
        elif clean_word in TRANSITION_WORDS:
            prob = 0.42
            mu_pause = math.log(1.5)
        elif len(clean_word) >= 9 or any(c.isdigit() for c in clean_word):
            prob = 0.22
            mu_pause = math.log(0.9)

        prob *= self.settings.thinking_pause_scale
        if self.rng.random() >= prob:
            return 0.0

        self.thinking_cooldown = self.rng.randint(20, 50)
        pause = self.rng.lognormvariate(mu_pause, 0.45)
        return min(8.0, max(0.20, pause))

    def _next_interkey_delay(self, current_char: str, next_char: str | None, progress: float = 0.0) -> float:
        """Compute smooth, right-skewed log-normal delay with non-stationary passage pace drift."""
        # Non-stationary cumulative passage-level pace drift + fatigue arc
        walk_step = self.rng.normalvariate(0.0, 0.03)
        self.pace_drift = max(0.50, min(2.50, self.pace_drift + walk_step))
        fatigue_arc = 1.50 - 0.80 * math.sin(math.pi * progress)
        effective_drift = self.pace_drift * fatigue_arc

        digraph_factor = 1.0
        if next_char:
            digraph_factor = self._get_digraph_factor(current_char, next_char)

        target_mean = self.base_delay * effective_drift * digraph_factor

        # Word-burst structure: Spaces and boundary punctuation have much larger gaps
        if current_char == " ":
            target_mean *= 2.80
            sigma = 0.35
        elif current_char in ",;—":
            target_mean *= 3.80
            sigma = 0.35
        elif current_char in ".!?":
            target_mean *= 5.20
            sigma = 0.40
        elif current_char in "\n\t":
            target_mean *= 5.50
            sigma = 0.40
        else:
            target_mean *= 0.42  # Fast mid-word letter gap
            sigma = 0.22  # Tight sigma for standard letters so physical key distance signal dominates

        mu = math.log(max(0.008, target_mean)) - (sigma ** 2) / 2.0
        delay = self.rng.lognormvariate(mu, sigma)

        delay = self._apply_pace_guard(delay)
        return min(4.0, max(0.010, delay))

    def _apply_pace_guard(self, delay: float) -> float:
        """Keep the rolling mean of recent inter-keydown gaps above a floor.

        The forensics 'no-rollover' detector trips whenever the mean of the last
        30 inter-keydown gaps falls below ~180 ms. (Its negative-flight test can
        never fire in a real-time event stream, so that rolling mean is all it
        actually checks.) Fast runs -- long words with no spaces, and the low
        points of the pace-drift / fatigue arc -- dip under that threshold.

        This stretches ONLY the gaps that would otherwise pull the 30-key window
        below the floor, by exactly enough to hold the window's mean at it. Every
        other gap keeps its natural value, so burst structure, drift, and timing
        spread are preserved. Set pace_floor to 0 to disable.
        """
        floor = self.settings.pace_floor
        if floor <= 0.0 or len(self._down_times) < 2:
            return delay

        times = self._down_times
        # the detector's window is the last 30 gaps; this sleep becomes the next
        # one, so look at up to the last 29 and require window-of-(k+1) mean >= floor
        recent = [times[i] - times[i - 1] for i in range(max(1, len(times) - 29), len(times))]
        k = len(recent)
        needed = floor * (k + 1) - sum(recent)
        if delay < needed:
            # a little jitter so the stretched gaps are not a constant value
            delay = needed * self.rng.uniform(1.00, 1.08)
        return delay

    def _wrong_neighbor(self, character: str) -> str | None:
        lower = character.lower()
        choices = NEIGHBORS.get(lower)
        if not choices:
            return None
        wrong = self.rng.choice(choices)
        return wrong.upper() if character.isupper() else wrong

    def type_text(self, text: str) -> bool:
        """Type full text with human dynamics. Return True if complete."""
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        words = text.split(" ")
        word_idx = 0
        char_in_word = 0

        index = 0
        total_len = len(text)
        while index < total_len:
            if self.cancel_event.is_set():
                self._flush_pending_release()
                if self.shift_held:
                    self._set_shift_state(False)
                return False

            progress = index / max(1, total_len)
            character = text[index]
            following = text[index + 1] if index + 1 < total_len else None

            # Thinking pause before word start
            if char_in_word == 0:
                think_pause = self._get_thinking_delay(text, word_idx, words)
                if think_pause > 0:
                    self._flush_pending_release()
                    if not self._sleep(think_pause):
                        return False

            if character == " ":
                word_idx += 1
                char_in_word = 0
            else:
                char_in_word += 1

            typo_eligible = (character.lower() in NEIGHBORS or character in SHIFT_VARIANTS) and character not in "\r\n\t"
            make_typo = typo_eligible and (self.rng.random() < self.settings.typo_rate)

            if make_typo:
                self._flush_pending_release()
                leave_uncorrected = self.rng.random() < self.settings.uncorrected_typo_rate
                wrong = self._wrong_neighbor(character)

                if leave_uncorrected:
                    # Uncorrected typo: type wrong key or swap and do NOT fix it
                    wrong_char = wrong if wrong else character.swapcase()
                    if not self._emit_character(wrong_char, following):
                        return False
                else:
                    # Corrected typo options: strictly local 1-3 backspaces
                    typo_kind = self.rng.random()
                    if typo_kind < 0.35 and wrong and following and following not in "\r\n\t":
                        # Deferred notice (1-2 characters typed after wrong key, max backspace = 3)
                        lookahead = 1 if self.rng.random() < 0.60 or index + 2 >= total_len else 2
                        if not self._emit_character(wrong, text[index + 1] if index + 1 < total_len else None):
                            return False
                        for offset in range(1, lookahead + 1):
                            if not self._sleep(self.rng.lognormvariate(math.log(0.05), 0.30)):
                                return False
                            next_ch = text[index + offset + 1] if index + offset + 1 < total_len else None
                            if not self._emit_character(text[index + offset], next_ch):
                                return False

                        if not self._backspace(lookahead + 1):
                            return False

                        for offset in range(0, lookahead + 1):
                            pos = index + offset
                            ch = text[pos]
                            nxt = text[pos + 1] if pos + 1 < total_len else None
                            if not self._emit_character(ch, nxt):
                                return False
                            if offset < lookahead:
                                if not self._sleep(self._next_interkey_delay(ch, nxt, progress)):
                                    return False
                        index += lookahead + 1
                        continue
                    else:
                        # Immediate local backspace
                        wrong_char = wrong if wrong else character.swapcase()
                        if not self._emit_character(wrong_char, character):
                            return False
                        if not self._backspace(1):
                            return False
                        if not self._emit_character(character, following):
                            return False
            else:
                if not self._emit_character(character, following):
                    return False

            if not self._sleep(self._next_interkey_delay(character, following, progress)):
                return False

            index += 1

        self._flush_pending_release()
        if self.shift_held:
            self._set_shift_state(False)

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
        if not self.settings.quiet and IS_WINDOWS and kernel32 is not None:
            try:
                kernel32.Beep(frequency, duration_ms)
            except OSError:
                pass

    def _wait_for_trigger_release(self) -> bool:
        if not IS_WINDOWS or user32 is None:
            return sleep_interruptibly(self.settings.start_delay, self.cancel_event)

        deadline = time.monotonic() + 2.5
        while any(user32.GetAsyncKeyState(key) & 0x8000 for key in self.typing_hotkey.held_key_codes):
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
        if not IS_WINDOWS or user32 is None:
            print("[notice] Hotkey registration requires Windows.")
            return

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
        default=38.0,
        help="active typing target WPM before pauses (default: 38)",
    )
    parser.add_argument(
        "--typo-rate",
        type=probability,
        default=0.02,
        help="chance per eligible character of a typo (default: 0.02)",
    )
    parser.add_argument(
        "--uncorrected-typo-rate",
        type=probability,
        default=0.08,
        help="fraction of typos left uncorrected (default: 0.08)",
    )
    parser.add_argument(
        "--start-delay",
        type=positive_float,
        default=0.30,
        help="pause after releasing trigger before typing (default: 0.30)",
    )
    parser.add_argument(
        "--thinking-pauses",
        type=nonnegative_float,
        default=1.0,
        help="frequency multiplier for thinking pauses; 0 disables (default: 1.0)",
    )
    parser.add_argument(
        "--unicode-mode",
        choices=["altcode", "paste", "unicode"],
        default="altcode",
        help="how non-keyboard symbols are typed: 'altcode' via Alt+numpad (real keys, no "
             "paste/VK_PACKET tell; falls back to paste for symbols with no known code), "
             "'paste' via Ctrl+V, or 'unicode' via SendInput (default: altcode)",
    )
    parser.add_argument(
        "--pace-floor",
        type=nonnegative_float,
        default=0.22,
        help="minimum rolling mean (seconds) for the last 30 inter-keydown gaps; holds "
             "fast runs above the no-rollover detector floor. 0 disables (default: 0.22)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="fixed random seed for repeatable timing (default: fresh randomness)",
    )
    parser.add_argument("--quiet", action="store_true", help="disable start/finish beeps")
    parser.add_argument("--dry-run", action="store_true", help="simulate typing without emitting win32 events")
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
        uncorrected_typo_rate=args.uncorrected_typo_rate,
        start_delay=args.start_delay,
        seed=args.seed,
        quiet=args.quiet,
        thinking_pause_scale=args.thinking_pauses,
        dry_run=args.dry_run,
        unicode_mode=args.unicode_mode,
        pace_floor=args.pace_floor,
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
