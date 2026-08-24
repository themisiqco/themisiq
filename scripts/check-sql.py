#!/usr/bin/env python3
"""
check-sql.py - parse a migration with the real PostgreSQL grammar, before it is
hand-run in the Supabase SQL editor.

Written 24 Aug 2026, after 20260854_materiality_determination_axis.sql aborted on
install with `ERROR: 42601 syntax error at or near "returns"`. A function body had
been copied out of an earlier migration by line range, the range started one line
below the `create or replace function ...` line, and the file carried a 43-line
fragment with no CREATE in front of it. Every statement in that file is inside
begin/commit, so nothing applied. Nothing in the repo could have caught it: a .sql
file is not compiled, not linted and not imported, so the SQL editor was the parser.
That is what this replaces.

  usage:  python3 scripts/check-sql.py supabase/migrations/2026xxxx_whatever.sql [...]
          python3 scripts/check-sql.py supabase/migrations/*.sql

  exit 0  every file parsed
  exit 1  a file failed - do not run it
  exit 2  the checker could not run (see REQUIREMENTS); nothing was checked

Validated against every migration in supabase/migrations/ (125 files, 24 Aug 2026):
all pass, no false positives. That sweep is the acceptance test for any change to
this file - a checker that cries wolf on a correct migration gets ignored, and then
the next 42601 reaches the SQL editor exactly as this one did. Re-run it:

    .venv-sql/bin/python scripts/check-sql.py supabase/migrations/*.sql

=============================================================================
REQUIREMENTS - and this file refuses rather than passing when they are absent
=============================================================================
Needs `pglast`, the Python binding for libpg_query - the actual PostgreSQL
parser, extracted from the server source as a library:

    python3 -m venv .venv-sql
    .venv-sql/bin/pip install pglast
    .venv-sql/bin/python scripts/check-sql.py supabase/migrations/whatever.sql

There is deliberately no fallback to a regex "checker" if the import fails, and
no `try: ... except ImportError: pass`. A syntax checker that quietly downgrades
to something weaker reports PASS on a file it never parsed, which is worse than
having no checker at all - the whole point of this file is to be the thing that
is trusted instead of the SQL editor. Missing pglast exits 2 with the install
command above, and 2 is not 0.

A local PostgreSQL SERVER is not required and cannot be used on the current dev
machine: /opt/homebrew/bin has libpq client tools only (psql, initdb, pg_ctl)
with no `postgres` binary, so `initdb` fails with "program postgres is needed by
initdb but was not found". Do not spend time trying to stand up a cluster.

=============================================================================
TWO LIMITS. BOTH ARE LOAD-BEARING. READ THEM BEFORE TRUSTING A PASS.
=============================================================================

(1) THIS IS A SYNTAX CHECK. IT IS NOT A CORRECTNESS CHECK, AND A STALE
    `ON CONFLICT` TARGET PASSES IT.

    PL/pgSQL does not plan the SQL inside a function body at CREATE time - it
    stores the body and plans each statement at first execution. So a function
    whose `on conflict (assessment_id, subtopic_code, direction)` no longer
    matches any unique constraint is accepted by CREATE OR REPLACE without
    complaint, by this checker, and by the server, and then raises SQLSTATE
    42P10 - "there is no unique or exclusion constraint matching the ON CONFLICT
    specification" - at the first call. Loud, never silent, but LATE, and at a
    customer rather than at the install.

    A PASS here means the file will not abort on a syntax error. It says nothing
    about whether the objects a body references exist or still have the shape the
    body assumes. The grep-for-every-affected-call-site sections that migrations
    like 20260854 §6 carry are NOT made redundant by this script and must still
    be written and still be run by hand.

(2) A `returns trigger` FUNCTION MAKES pglast RAISE. IT IS NOT A PARSE FAILURE,
    AND TREATING IT AS ONE MARKS EVERY TRIGGER FUNCTION IN THE REPO BROKEN.

    parse_plpgsql_json() on a trigger function raises ValueError / JSONDecodeError,
    typically "Expecting ',' delimiter". That is pglast's AST-to-JSON serializer
    choking on the implicit TG_ datums - it emits literal `{}}` where those
    records should be. The PL/pgSQL parse has already SUCCEEDED at that point;
    the error happens on the way out, decoding the AST that the parse produced.

    Verified by injecting real defects into a trigger function - an unterminated
    IF, a DECLARE missing its semicolon - and confirming both raise ParseError
    ("syntax error at end of input" / "syntax error at or near \"begin\"")
    rather than the ValueError. So the two are cleanly separable:

        ParseError  -> the body is malformed. FAIL.
        ValueError  -> the body parsed; the serializer failed. PASS.

    check_plpgsql() below encodes exactly that, and nothing else should be added
    to the ValueError arm - widening it would start swallowing real failures.

One more reading note: ParseError's reported index points at the START OF THE
STATEMENT being parsed, which in these heavily-commented migrations is the
comment block above the offending SQL, not the offending token. Trust the token
the message names; treat the offset as a rough locator only. This file reports
both, labelled, so neither gets mistaken for the other.
"""

import io
import re
import sys

# ---------------------------------------------------------------------------
# Requirement gate. Exits 2 - see REQUIREMENTS above on why there is no fallback.
# ---------------------------------------------------------------------------
try:
    from pglast import parse_sql
    from pglast.parser import ParseError, parse_plpgsql_json
except ImportError:
    sys.stderr.write(
        "check-sql.py: pglast is not installed, so NOTHING WAS CHECKED.\n"
        "  This is not a pass. Install it and re-run:\n\n"
        "    python3 -m venv .venv-sql\n"
        "    .venv-sql/bin/pip install pglast\n"
        "    .venv-sql/bin/python scripts/check-sql.py <file.sql>\n\n"
        "  pglast wraps libpg_query, the real PostgreSQL parser. There is no\n"
        "  regex substitute - a weaker checker that reports PASS is worse than\n"
        "  no checker, because the SQL editor stops being the backstop.\n"
    )
    raise SystemExit(2)


CREATE_FN = re.compile(r'^\s*create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)', re.I)
DOLLAR_TAG = re.compile(r'\$(?:[A-Za-z_]\w*)?\$')


def split_statements(src):
    """Yield (statement_text, start_offset, end_offset).

    Splits on `;` while skipping over the four things that can legally contain
    one: line comments, block comments, single-quoted literals (with '' escapes)
    and dollar-quoted bodies. Naive splitting on ';' cuts every function in half.
    Tags are matched by their exact text, so $$ and $function$ both work and a
    body containing the other tag is not truncated.
    """
    out, buf, i, n, start = [], [], 0, len(src), 0
    while i < n:
        c = src[i]
        if src.startswith('--', i):
            j = src.find('\n', i)
            j = n if j < 0 else j + 1
            buf.append(src[i:j]); i = j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i)
            j = n if j < 0 else j + 2
            buf.append(src[i:j]); i = j; continue
        if c == "'":
            j = i + 1
            while j < n:
                if src[j] == "'":
                    if src.startswith("''", j):
                        j += 2; continue
                    j += 1; break
                j += 1
            buf.append(src[i:j]); i = j; continue
        m = DOLLAR_TAG.match(src, i)
        if m:
            tag = m.group(0)
            j = src.find(tag, i + len(tag))
            j = n if j < 0 else j + len(tag)
            buf.append(src[i:j]); i = j; continue
        if c == ';':
            buf.append(c)
            out.append((''.join(buf), start, i))
            buf = []; i += 1; start = i; continue
        buf.append(c); i += 1
    if ''.join(buf).strip():
        out.append((''.join(buf), start, n))
    return out


def function_statements(src):
    """(name, statement, start_line, end_line) for each CREATE FUNCTION.

    The leading-comment strip matters: it is what makes the CREATE have to be the
    first real token of the statement. A fragment that begins at `returns trigger`
    is therefore not counted as a function at all - which is the second, independent
    signal that catches the defect this script was written for. The broken file
    reported four functions where the author believed there were five.
    """
    for stmt, so, eo in split_statements(src):
        body = re.sub(r'(?m)^\s*--.*$', '', stmt).strip()
        m = CREATE_FN.match(body)
        if not m:
            continue
        head = re.search(r'(?im)^[ \t]*create\s+(?:or\s+replace\s+)?function.*$', stmt)
        sl = line_of(src, so + (head.start() if head else 0))
        yield m.group(1), stmt, sl, line_of(src, eo)


def line_of(src, off):
    return src.count('\n', 0, max(0, off)) + 1


def strip_noise(stmt):
    """Blank out line comments, block comments and single-quoted literals,
    preserving length and newlines so offsets stay meaningful.

    Needed because a migration header may DISCUSS its own dollar tags in prose -
    20260618_ghg_location_allowance.sql narrates normalising `$function$` to `$$` -
    and a tag scan that counts those mentions reports a mismatch on a correct file.
    Dollar-quoted bodies are deliberately left intact; they are what is being checked.
    """
    out, i, n = list(stmt), 0, len(stmt)
    def blank(a, b):
        for k in range(a, min(b, n)):
            if out[k] != '\n':
                out[k] = ' '
    while i < n:
        if stmt.startswith('--', i):
            j = stmt.find('\n', i); j = n if j < 0 else j
            blank(i, j); i = j + 1; continue
        if stmt.startswith('/*', i):
            j = stmt.find('*/', i); j = n if j < 0 else j + 2
            blank(i, j); i = j; continue
        if stmt[i] == "'":
            j = i + 1
            while j < n:
                if stmt[j] == "'":
                    if stmt.startswith("''", j):
                        j += 2; continue
                    j += 1; break
                j += 1
            blank(i, j); i = j; continue
        m = DOLLAR_TAG.match(stmt, i)
        if m:
            tag = m.group(0)
            j = stmt.find(tag, i + len(tag))
            i = n if j < 0 else j + len(tag)
            continue
        i += 1
    return ''.join(out)


def body_tags(stmt):
    """(open_tag, closes) for a CREATE FUNCTION statement.

    Postgres does NOT require the body to be the last thing in the statement -
    `AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = ...;` is
    valid and is the shape 20260618 uses. So this looks for the tag introduced by
    AS and for that same tag closing later, and says nothing about what follows.
    """
    clean = strip_noise(stmt)
    m = re.search(r'\bas\s+(\$(?:[A-Za-z_]\w*)?\$)', clean, re.I)
    if not m:
        return None, False
    tag = m.group(1)
    return tag, stmt.find(tag, m.end()) != -1


def check_plpgsql(stmt):
    """(ok, note). See LIMIT (2) in the module docstring - do not widen the
    ValueError arm."""
    try:
        parse_plpgsql_json(stmt)
        return True, ''
    except ParseError as e:
        return False, str(e)
    except ValueError:
        # pglast AST-to-JSON serializer bug on trigger-function TG_ datums.
        # The parse succeeded; only the decode failed.
        return True, 'parse accepted; pglast serializer bug on trigger datums'


def check_file(path):
    src = io.open(path, encoding='utf-8').read()
    failures = []
    print(f'\n=== {path} ({src.count(chr(10)) + 1} lines) ===')

    # -- statement-level: the 42601 layer, the one that aborts an install ------
    try:
        stmts = parse_sql(src)
        print(f'  [grammar]    PASS  {len(stmts)} top-level statements')
    except ParseError as e:
        idx = getattr(e, 'location', None)
        where = f' (statement starting near line {line_of(src, idx)})' if idx else ''
        print(f'  [grammar]    FAIL  {e}{where}')
        print('               ^ the TOKEN named above is the reliable part; the')
        print('                 offset points at the start of the statement.')
        failures.append('grammar')

    # -- PL/pgSQL bodies -------------------------------------------------------
    fns = list(function_statements(src))
    for name, stmt, sl, el in fns:
        ok, note = check_plpgsql(stmt)
        tail = f'   [{note}]' if (ok and note) else (f': {note}' if note else '')
        print(f'  [plpgsql]    {"PASS" if ok else "FAIL"}  {name}()  lines {sl}-{el}{tail}')
        if not ok:
            failures.append(name)

    # -- structural: complete CREATE, body opens and closes on the same tag ---
    for name, stmt, sl, el in fns:
        tag, closes = body_tags(stmt)
        ok = tag is not None and closes
        print(f'  [structure]  {"PASS" if ok else "FAIL"}  {name}()  '
              f'body={tag or "(no AS <tag>)"} {"closed" if closes else "UNCLOSED"}')
        if not ok:
            failures.append(name + ':structure')

    # -- dangling fragment: a body keyword with no CREATE above it -------------
    # Redundant with [grammar] for a plain file, and deliberately kept: it names
    # the LINE, which the grammar layer does not, and it survives a file whose
    # first error is somewhere else entirely.
    lines = src.split('\n')
    dangling = 0
    for i, ln in enumerate(lines, start=1):
        if not re.match(r'(?i)^\s*(returns\s+\w|language\s+plpgsql\b)', ln):
            continue
        j = i - 2
        prev = ''
        while j >= 0:
            p = lines[j].strip()
            if p and not p.startswith('--'):
                prev = p
                break
            j -= 1
        looks_attached = re.search(
            r'(?i)(create\s+(or\s+replace\s+)?function|returns\b|[(,]\s*$|\)\s*$|'
            r'\b(uuid|text|jsonb|boolean|int|integer|numeric|timestamptz|trigger|void)\b)', prev)
        if not looks_attached:
            print(f'  [dangling]   FAIL  line {i}: {ln.strip()!r}')
            print(f'                     preceded by: {prev[:70]!r}')
            print('                     ^ a function body with no CREATE in front of it.')
            dangling += 1
    if dangling:
        failures.append('dangling')
    else:
        print(f'  [dangling]   PASS  no orphaned function bodies '
              f'({len(fns)} CREATE FUNCTION statements seen)')

    return failures


def main(argv):
    paths = argv[1:]
    if not paths:
        sys.stderr.write(__doc__.split('=====', 1)[0].strip() + '\n')
        return 2
    bad = {}
    for p in paths:
        try:
            f = check_file(p)
        except OSError as e:
            print(f'\n=== {p} ===\n  [read]       FAIL  {e}')
            f = ['unreadable']
        if f:
            bad[p] = f
    print()
    if bad:
        for p, f in bad.items():
            print(f'FAIL  {p}: {", ".join(f)}')
        print('\nDo not run these. Every statement is inside begin/commit, so a syntax')
        print('error applies nothing - but only after the editor has been the parser.')
        return 1
    print(f'PASS  {len(paths)} file(s) parsed.')
    print('Syntax only. A stale ON CONFLICT target still passes - see LIMIT (1) in')
    print('the header, and run the migration\'s own call-site greps by hand.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
