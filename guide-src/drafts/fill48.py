"""Fills drafts/48.md with the tested sources and the captured sessions -> chapters/48-project-api.md"""
import re
from pathlib import Path

D = Path('/home/user/guide-src/drafts')
S = Path('/opt/rs/scratch')
V1 = S / 'shortener'

def read(p):
    return Path(p).read_text().rstrip("\n")

def split(path, *needles):
    """Splits a file before the lines that start with the given texts. Returns the parts, without the blank separators."""
    lines = read(path).split("\n")
    cuts = []
    for n in needles:
        idx = next(i for i, l in enumerate(lines) if l.startswith(n))
        # include preceding doc comments / attributes
        while idx > 0 and lines[idx - 1].startswith(("///", "#[")):
            idx -= 1
        cuts.append(idx)
    assert cuts == sorted(cuts), cuts
    parts, prev = [], 0
    for c in cuts + [len(lines)]:
        parts.append("\n".join(lines[prev:c]).strip("\n"))
        prev = c
    # the parts joined with one blank line must give the file back
    assert "\n\n".join(parts) == "\n".join(lines), path
    return parts

def item(path, needle, dedent=True):
    """One item (function, struct, enum, test) with its doc comments and attributes."""
    lines = read(path).split("\n")
    hits = [i for i, l in enumerate(lines) if needle in l]
    assert len(hits) == 1, (path, needle, len(hits))
    idx = hits[0]
    indent = len(lines[idx]) - len(lines[idx].lstrip())
    start = idx
    while start > 0 and lines[start - 1].strip().startswith(("///", "#[")):
        start -= 1
    end = idx
    if not lines[idx].rstrip().endswith(";"):
        while lines[end] != " " * indent + "}":
            end += 1
    out = lines[start:end + 1]
    if dedent:
        out = [l[indent:] if l.strip() else "" for l in out]
    return "\n".join(out)

def region(path, start_needle, end_needle):
    """From the line containing start_needle up to and including the item that contains end_needle."""
    lines = read(path).split("\n")
    a = next(i for i, l in enumerate(lines) if start_needle in l)
    b = next(i for i, l in enumerate(lines) if end_needle in l and i >= a)
    while lines[b] != "}":
        b += 1
    return "\n".join(lines[a:b + 1])

def session(path, picks=None):
    entries = [e.strip("\n") for e in read(path).split("@@@") if e.strip()]
    if picks is not None:
        entries = [entries[i] for i in picks]
    return "\n\n".join(e.rstrip() for e in entries)

test_out = read(D / '48_test.txt')
test_out = re.sub(r"\(/opt/rs/target/debug/build/[^)]*/out/([^)]+)\)", r"(target/debug/…/\1)", test_out)
test_out = re.sub(r"target\(s\) in [0-9.]+s", "target(s) in 0.07s", test_out)
test_out = "\n".join(l.rstrip() for l in test_out.split("\n")).strip("\n")

validate = split(V1 / 'src/validate.rs', "#[cfg(test)]")
store = split(V1 / 'src/store.rs', "/// The questions that the service asks", "#[cfg(test)]")
routes = split(V1 / 'src/routes.rs', "/// Builds the whole application.", "async fn health(", "/// Middleware:")
tests = split(V1 / 'tests/api.rs', "async fn the_health_check_answers(")

A, B, C = S / 'shortener_a', S / 'shortener_b', S / 'shortener_c'
fills = {
    "CARGO_TOML": read(V1 / 'Cargo.toml'),
    "MIGRATION": read(V1 / 'migrations/20261114120000_create_links.sql'),
    "BUILD_RS": read(V1 / 'build.rs'),
    "ERROR_RS": read(V1 / 'src/error.rs'),
    "VALIDATE_1": validate[0], "VALIDATE_2": validate[1],
    "STORE_1": store[0], "STORE_2": store[1], "STORE_3": store[2],
    "ROUTES_1": routes[0], "ROUTES_2": routes[1], "ROUTES_3": routes[2], "ROUTES_4": routes[3],
    "LIB_RS": read(V1 / 'src/lib.rs'),
    "CONFIG_RS": read(V1 / 'src/config.rs'),
    "MAIN_RS": read(V1 / 'src/main.rs'),
    "TESTS_1": tests[0], "TESTS_2": tests[1],
    "SESSION_INTRO": session(D / '48_session.txt', [0, 1, 2]),
    "SESSION_FULL": session(D / '48_session.txt'),
    "LOG": read(D / '48_log.txt'),
    "TEST_OUT": test_out,
    # exercise 1
    "A_STORE_UPDATE": item(A / 'src/store.rs', "pub async fn update_url"),
    "A_URLCHANGE": item(A / 'src/routes.rs', "struct UrlChange"),
    "A_HANDLER": item(A / 'src/routes.rs', "async fn change_link("),
    "A_TEST": item(A / 'tests/api.rs', "async fn the_address_of_a_link_can_be_changed"),
    # exercise 2
    "B_MIGRATION": read(B / 'migrations/20261115090000_add_last_visited.sql'),
    "B_LINK": item(B / 'src/store.rs', "pub struct Link {"),
    "B_VISIT": item(B / 'src/store.rs', "pub async fn visit"),
    "B_TEST": item(B / 'tests/api.rs', "async fn the_last_visit_is_recorded"),
    "B_SESSION": session(D / '48_b_session.txt'),
    # exercise 3
    "C_MIGRATION": read(C / 'migrations/20261116090000_add_expires_at.sql'),
    "C_TTL": item(C / 'src/validate.rs', "pub fn check_ttl"),
    "C_VISIT_ENUM": item(C / 'src/store.rs', "pub enum Visit"),
    "C_INSERT": item(C / 'src/store.rs', "pub async fn insert"),
    "C_VISIT": item(C / 'src/store.rs', "pub async fn visit"),
    "C_CLOCK": region(C / 'src/routes.rs', "/// A source of the current time", "pub struct AppState"),
    "C_CREATE": item(C / 'src/routes.rs', "async fn create_link("),
    "C_RANDOM": item(C / 'src/routes.rs', "async fn insert_with_random_code("),
    "C_FOLLOW": item(C / 'src/routes.rs', "async fn follow("),
    "C_TESTAPP": region(C / 'tests/api.rs', "/// A complete application on a fresh", "async fn test_app() -> Router"),
    "C_TEST": item(C / 'tests/api.rs', "async fn links_can_expire"),
}

text = (D / '48.md').read_text()
for key, value in fills.items():
    marker = f"@@{key}@@"
    assert text.count(marker) == 1, (key, text.count(marker))
    text = text.replace(marker, value)
left = re.findall(r"@@[A-Z0-9_]+@@", text)
assert not left, left
Path('/home/user/guide-src/chapters/48-project-api.md').write_text(text)
print("written", len(text.split("\n")), "lines")
