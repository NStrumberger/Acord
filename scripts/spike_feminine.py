"""R0 spike: how much of Romanian feminine derivation is rule-derivable?

Decides the rules-vs-curated-table split for the Romanian lexicon.
Rules are ordered most-specific-first; each is credited so we can see
which ones earn their keep.
"""
import json
from collections import Counter

pairs = json.load(open("data/raw/occupation_pairs.json", encoding="utf-8"))
VOWELS = "aeiouăâî"

def derive(m):
    if m.endswith("eț"):              return m[:-2] + "eață", "-eț -> -eață"
    if m.endswith(("ător", "itor")):  return m[:-2] + "oare", "-ător/-itor -> -toare"
    if m.endswith("or"):              return m[:-2] + "oare", "-or -> -oare"
    # vowel breaking: stressed o in an open-ish final syllable -> oa  (geolog -> geoloagă)
    if len(m) > 2 and m[-2] == "o" and m[-1] not in VOWELS:
        return m[:-2] + "oa" + m[-1] + "ă", "o -> oa + ă"
    if m.endswith("e"):               return m[:-1] + "ă",    "-e -> -ă"
    if m[-1] in VOWELS:               return m,               "unchanged"
    return m + "ă",                                           "C -> C+ă"

def main():
    ok, bad, fired, earned = [], [], Counter(), Counter()
    for occ, e in sorted(pairs.items()):
        got, rule = derive(e["m"])
        fired[rule] += 1
        if got == e["f"]:
            ok.append(occ); earned[rule] += 1
        else:
            bad.append((occ, e["m"], e["f"], got, rule))

    n = len(pairs)
    print(f"occupations: {n}")
    print(f"rule-derived correctly: {len(ok)}  ({100*len(ok)/n:.0f}%)")
    print(f"must be lexicalised:    {len(bad)}  ({100*len(bad)/n:.0f}%)\n")
    print(f"{'rule':<26}{'fired':>6}{'correct':>9}")
    for r, c in fired.most_common():
        print(f"  {r:<24}{c:>6}{earned[r]:>9}")
    print("\n=== FAILURES (curated table) ===")
    for occ, m, f, got, rule in bad:
        print(f"  {occ:<14} {m:<13} actual {f:<15} rule gave {got:<15} [{rule}]")
    suf = Counter(m[-3:] for _, m, _, _, _ in bad)
    print("\nfailure endings:", dict(suf.most_common(6)))

if __name__ == "__main__":
    main()
