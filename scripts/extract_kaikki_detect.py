"""Word lists for reading gender out of Romanian (src/ro/detect.ts).

Two outputs, both from kaikki.org's Wiktionary extracts (CC BY-SA 4.0):
  - src/ro/adjectives.json: adjectives and participles in their four
    nominative forms, taken from the HEADWORD line editors write ("obosit m or
    n, feminine singular obosită, ..."), never from the generated tables and
    never guessed from an ending. A form that reads two ways (roșii is both
    plurals) is left out: it shows nothing.
  - src/ro/detect.names.json: given names, so "Ioana" at the start of a
    sentence is known as a person after the English turned her into "Joan".
    Which gender a name usually has is deliberately NOT kept: a name is no
    evidence (Alex, Sam, Andrea).

Inputs (gitignored, public downloads):
  https://kaikki.org/dictionary/Romanian/pos-adj/kaikki.org-dictionary-Romanian-by-pos-adj.jsonl
  https://kaikki.org/dictionary/Romanian/pos-name/kaikki.org-dictionary-Romanian-by-pos-name.jsonl

  py -I scripts/extract_kaikki_detect.py data/raw/kaikki/ro-adj.jsonl data/raw/kaikki/ro-name.jsonl
"""
import json
import sys
from collections import defaultdict

SOURCE = "kaikki.org Wiktionary extract (https://kaikki.org/dictionary/Romanian/), CC BY-SA 4.0"


def head_forms(entry):
    """The forms on the headword line, by tag set."""
    out = {}
    for f in entry.get("forms") or []:
        tags = frozenset(f.get("tags") or [])
        if tags & {"error-unrecognized-form", "inflection-template", "table-tags", "alternative", "canonical"}:
            continue
        out.setdefault(tags, f["form"].strip())
    return out


def adjectives(path):
    rows = {}
    for line in open(path, encoding="utf-8"):
        d = json.loads(line)
        msg = d.get("word", "")
        forms = head_forms(d)
        fsg = forms.get(frozenset({"feminine", "singular"}))
        both = forms.get(frozenset({"plural"}))
        mpl = forms.get(frozenset({"masculine", "plural"}), both)
        fpl = forms.get(frozenset({"feminine", "neuter", "plural"}), both)
        if not msg or not fsg or " " in msg or not msg.islower():
            continue
        row = (msg, fsg, mpl, fpl)
        if rows.setdefault(msg, row) != row:
            rows[msg] = None   # homographs that inflect differently: no single reading
    rows = [r for r in rows.values() if r]

    # The gender of every form, so forms that read as both can be dropped.
    # Number may be ambiguous: "răbdătoare" is feminine singular and plural,
    # and is a woman's word either way.
    genders = defaultdict(set)
    for msg, fsg, mpl, fpl in rows:
        for form, gender in ((msg, "M"), (fsg, "F"), (mpl, "M"), (fpl, "F")):
            if form:
                genders[form].add(gender)
    clear = lambda form: form if form and len(genders[form]) == 1 else None

    out = []
    for msg, fsg, mpl, fpl in sorted(rows):
        sg = (clear(msg), clear(fsg))
        pl = (clear(mpl), clear(fpl)) if mpl != fpl else (None, None)
        if all(sg) or all(pl):
            out.append([sg[0] if all(sg) else None, sg[1] if all(sg) else None,
                        pl[0] if all(pl) else None, pl[1] if all(pl) else None])
    return out


def given_names(path):
    names = set()
    for line in open(path, encoding="utf-8"):
        d = json.loads(line)
        word = d.get("word", "")
        if not word[:1].isupper() or " " in word:
            continue
        if any("given name" in g for s in d.get("senses", []) for g in s.get("glosses", [])):
            names.add(word)
    return sorted(names)


def main():
    adj_path, name_path = sys.argv[1], sys.argv[2]
    rows = adjectives(adj_path)
    json.dump({"_source": SOURCE, "_format": "[masculine sg, feminine sg, masculine pl, feminine pl]; null where a form reads two ways",
               "adjectives": rows},
              open("src/ro/adjectives.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    names = given_names(name_path)
    json.dump({"_source": SOURCE, "names": names},
              open("src/ro/detect.names.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"adjectives {len(rows)} | given names {len(names)}")


if __name__ == "__main__":
    main()
