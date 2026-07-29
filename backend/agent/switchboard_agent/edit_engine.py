"""Fuzzy edit chain — Python port of OpenCode's `tool/edit.ts` replacer ladder.

A model almost never reproduces `old_text` byte-for-byte: it re-indents, collapses
whitespace, escapes newlines, or drops a line from the middle of a block. Exact
find/replace fails on all of those and burns a turn. Instead we run a ladder of
replacers, each looser than the last, and take the FIRST candidate that actually
occurs in the file:

  1. simple                 — exact string
  2. line_trimmed           — per-line compare ignoring leading/trailing whitespace
  3. block_anchor           — >=3 lines: match first+last line, score the middle by
                              Levenshtein similarity (accept >= 0.65)
  4. whitespace_normalized  — collapse runs of whitespace to a single space
  5. indentation_flexible   — strip the common minimum indent from both sides
  6. escape_normalized      — unescape \\n \\t \\' etc. the model over-escaped
  7. trimmed_boundary       — trim the block's outer boundary
  8. context_aware          — first/last anchors + >=50% of middle lines matching
  9. multi_occurrence       — every exact occurrence (used for replace_all)

Two guards are what keep the fuzz safe, and they matter more than the ladder:

  * uniqueness — a candidate matching more than once is skipped, so a loose match
    can never silently pick the wrong one of several similar blocks.
  * proportionality — a candidate spanning far more than `old_text` is refused
    outright. Without it, `block_anchor` on a common first/last line ("}" … "}")
    can swallow half the file.

Which replacers run is chosen by the caller's fuzz level, which comes from the
model's capability profile: frontier models emit near-exact text and need little
correction, small local models need the whole ladder.

Pure stdlib — this module ships to the user's machine inside the agent tarball.
"""

import re
from typing import Callable, Iterator

# Block-anchor accepts a candidate when the middle lines are at least this similar.
SIMILARITY_THRESHOLD = 0.65

# Levenshtein is O(n*m); lines this long are pathological input, not code.
MAX_LEVENSHTEIN_LEN = 1000


class EditError(Exception):
    """Raised when no candidate can be applied safely. The message is fed back to
    the model verbatim, so it must say what to do next, not just what went wrong."""


def levenshtein(a: str, b: str) -> int:
    if not a or not b:
        return max(len(a), len(b))
    a = a[:MAX_LEVENSHTEIN_LEN]
    b = b[:MAX_LEVENSHTEIN_LEN]
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        ai = a[i - 1]
        for j in range(1, len(b) + 1):
            cost = 0 if ai == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[len(b)]


def _span(lines: list[str], start: int, end: int) -> tuple[int, int]:
    """Character offsets of lines[start..end] inclusive within "\n".join(lines)."""
    begin = sum(len(lines[k]) + 1 for k in range(start))
    stop = begin + sum(len(lines[k]) for k in range(start, end + 1)) + (end - start)
    return begin, stop


# ---------- replacers ----------

def simple_replacer(content: str, find: str) -> Iterator[str]:
    yield find


def line_trimmed_replacer(content: str, find: str) -> Iterator[str]:
    original = content.split("\n")
    search = find.split("\n")
    if search and search[-1] == "":
        search.pop()
    if not search:
        return

    for i in range(len(original) - len(search) + 1):
        if all(original[i + j].strip() == search[j].strip() for j in range(len(search))):
            begin, stop = _span(original, i, i + len(search) - 1)
            yield content[begin:stop]


def block_anchor_replacer(content: str, find: str) -> Iterator[str]:
    original = content.split("\n")
    search = find.split("\n")
    if len(search) < 3:
        return
    if search[-1] == "":
        search.pop()

    first_line = search[0].strip()
    last_line = search[-1].strip()
    block_size = len(search)
    max_delta = max(1, block_size // 4)

    candidates: list[tuple[int, int]] = []
    for i in range(len(original)):
        if original[i].strip() != first_line:
            continue
        for j in range(i + 2, len(original)):
            if original[j].strip() == last_line:
                if abs((j - i + 1) - block_size) <= max_delta:
                    candidates.append((i, j))
                break  # only the first occurrence of the last line
    if not candidates:
        return

    def similarity(start: int, end: int) -> float:
        actual = end - start + 1
        to_check = min(block_size - 2, actual - 2)
        if to_check <= 0:
            return 1.0  # no middle lines — the anchors alone decide
        total = 0.0
        for j in range(1, min(block_size, actual) - 1):
            o = original[start + j].strip()
            s = search[j].strip()
            longest = max(len(o), len(s))
            if longest == 0:
                continue
            total += 1 - levenshtein(o, s) / longest
        return total / to_check

    best = max(candidates, key=lambda c: similarity(*c))
    if similarity(*best) >= SIMILARITY_THRESHOLD:
        begin, stop = _span(original, best[0], best[1])
        yield content[begin:stop]


def whitespace_normalized_replacer(content: str, find: str) -> Iterator[str]:
    def norm(text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()

    target = norm(find)
    lines = content.split("\n")

    for line in lines:
        if norm(line) == target:
            yield line
        elif target and target in norm(line):
            # Rebuild the model's words as a whitespace-flexible pattern so we can
            # recover the exact substring as it appears in the file.
            words = [w for w in find.strip().split() if w]
            if words:
                pattern = r"\s+".join(re.escape(w) for w in words)
                m = re.search(pattern, line)
                if m:
                    yield m.group(0)

    find_lines = find.split("\n")
    if len(find_lines) > 1:
        for i in range(len(lines) - len(find_lines) + 1):
            block = "\n".join(lines[i:i + len(find_lines)])
            if norm(block) == target:
                yield block


def indentation_flexible_replacer(content: str, find: str) -> Iterator[str]:
    def dedent(text: str) -> str:
        lines = text.split("\n")
        body = [ln for ln in lines if ln.strip()]
        if not body:
            return text
        indent = min(len(ln) - len(ln.lstrip()) for ln in body)
        return "\n".join(ln if not ln.strip() else ln[indent:] for ln in lines)

    target = dedent(find)
    lines = content.split("\n")
    span = len(find.split("\n"))
    for i in range(len(lines) - span + 1):
        block = "\n".join(lines[i:i + span])
        if dedent(block) == target:
            yield block


_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "'": "'", '"': '"',
            "`": "`", "\\": "\\", "\n": "\n", "$": "$"}


def _unescape(text: str) -> str:
    return re.sub(r"\\(n|t|r|'|\"|`|\\|\n|\$)", lambda m: _ESCAPES[m.group(1)], text)


def escape_normalized_replacer(content: str, find: str) -> Iterator[str]:
    target = _unescape(find)
    if target in content:
        yield target

    lines = content.split("\n")
    span = len(target.split("\n"))
    for i in range(len(lines) - span + 1):
        block = "\n".join(lines[i:i + span])
        if _unescape(block) == target:
            yield block


def trimmed_boundary_replacer(content: str, find: str) -> Iterator[str]:
    target = find.strip()
    if target == find:
        return  # already trimmed — simple_replacer already covered this
    if target in content:
        yield target

    lines = content.split("\n")
    span = len(find.split("\n"))
    for i in range(len(lines) - span + 1):
        block = "\n".join(lines[i:i + span])
        if block.strip() == target:
            yield block


def context_aware_replacer(content: str, find: str) -> Iterator[str]:
    find_lines = find.split("\n")
    if len(find_lines) < 3:
        return
    if find_lines[-1] == "":
        find_lines.pop()

    lines = content.split("\n")
    first_line = find_lines[0].strip()
    last_line = find_lines[-1].strip()

    for i in range(len(lines)):
        if lines[i].strip() != first_line:
            continue
        for j in range(i + 2, len(lines)):
            if lines[j].strip() != last_line:
                continue
            block_lines = lines[i:j + 1]
            if len(block_lines) == len(find_lines):
                matching = 0
                non_empty = 0
                for k in range(1, len(block_lines) - 1):
                    b = block_lines[k].strip()
                    f = find_lines[k].strip()
                    if b or f:
                        non_empty += 1
                        if b == f:
                            matching += 1
                if non_empty == 0 or matching / non_empty >= 0.5:
                    yield "\n".join(block_lines)
            break  # only consider the first closing anchor after this opener


def multi_occurrence_replacer(content: str, find: str) -> Iterator[str]:
    start = 0
    while True:
        idx = content.find(find, start)
        if idx == -1:
            return
        yield find
        start = idx + len(find)


Replacer = Callable[[str, str], Iterator[str]]

_ALL: list[Replacer] = [
    simple_replacer,
    line_trimmed_replacer,
    block_anchor_replacer,
    whitespace_normalized_replacer,
    indentation_flexible_replacer,
    escape_normalized_replacer,
    trimmed_boundary_replacer,
    context_aware_replacer,
    multi_occurrence_replacer,
]

# How much correction a model gets. Resolved from its capability profile on the
# backend and sent down with the tool call — a frontier model that already emits
# exact text gains nothing from the loose replacers and only risks a wrong match.
FUZZ_LEVELS: dict[str, list[Replacer]] = {
    "off": [simple_replacer],
    "low": [simple_replacer, line_trimmed_replacer, multi_occurrence_replacer],
    "medium": [r for r in _ALL if r is not context_aware_replacer],
    "high": _ALL,
}


def _reindent(matched: str, old_string: str, new_string: str) -> str:
    """Put `new_string` back at the indentation the matched span actually had.

    A deliberate addition to the upstream ladder. Several replacers match while
    ignoring leading whitespace but hand back the real span *including* its
    indentation — so replacing it with text the model wrote flush-left silently
    de-indents the block. In Python that doesn't just look wrong, it changes what
    the code means or stops it parsing.

    The correction is narrow on purpose: it only fires when the model's old_text
    had no leading indentation and the text it actually matched did. If the model
    supplied indentation, we trust it and change nothing.
    """
    old_first = old_string.split("\n", 1)[0]
    if old_first[:1] in (" ", "\t"):
        return new_string  # model gave indentation — don't second-guess it
    matched_first = matched.split("\n", 1)[0]
    indent = matched_first[:len(matched_first) - len(matched_first.lstrip())]
    if not indent:
        return new_string
    return "\n".join(indent + ln if ln.strip() else ln for ln in new_string.split("\n"))


def is_disproportionate_match(search: str, old_string: str) -> bool:
    """True when the candidate spans far more than the model asked to replace.

    This is the guard that makes the loose replacers safe to run at all: an anchor
    match on lines as generic as a closing brace or a bare `return` can otherwise
    span most of the file, and the edit would silently delete everything between.
    """
    old_lines = old_string.count("\n") + 1
    search_lines = search.count("\n") + 1
    if search_lines >= max(old_lines + 3, old_lines * 2):
        return True
    if old_lines == 1:
        return False
    return len(search.strip()) > max(len(old_string.strip()) + 500, len(old_string.strip()) * 4)


def replace(content: str, old_string: str, new_string: str,
            replace_all: bool = False, fuzz: str = "medium") -> str:
    """Apply old_string → new_string, escalating through the fuzz ladder.

    Raises EditError with model-actionable guidance when nothing safe applies.
    """
    if old_string == new_string:
        raise EditError("No changes to apply: old_text and new_text are identical.")
    if old_string == "":
        raise EditError(
            "old_text cannot be empty when editing an existing file. Provide the exact "
            "text to replace, or use write_file for an intentional full-file replacement."
        )

    found = False
    for replacer in FUZZ_LEVELS.get(fuzz, FUZZ_LEVELS["medium"]):
        for search in replacer(content, old_string):
            index = content.find(search)
            if index == -1:
                continue
            found = True
            if is_disproportionate_match(search, old_string):
                raise EditError(
                    "Refusing the replacement: the matched span is much larger than "
                    "old_text, so applying it would delete code you did not intend to "
                    "touch. Re-read the file and pass the full exact old_text."
                )
            replacement = _reindent(search, old_string, new_string)
            if replace_all:
                return content.replace(search, replacement)
            if index != content.rfind(search):
                continue  # ambiguous — keep looking for a unique candidate
            return content[:index] + replacement + content[index + len(search):]

    if found:
        raise EditError(
            "Found multiple matches for old_text. Include more surrounding context "
            "(2-3 lines above and below) to make it unique, or pass replace_all=true "
            "to change every occurrence."
        )
    raise EditError(
        "Could not find old_text in the file. Read the file first and copy the exact "
        "text, including whitespace and indentation. Do NOT guess the contents, and do "
        "NOT fall back to write_file — that would destroy the rest of the file."
    )
