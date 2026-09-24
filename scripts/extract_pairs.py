"""Extract Romanian masculine/feminine occupation lemma pairs from EnRoGend.

EnRoGend surfaces carry the enclitic definite article and vary by case
(nominative-accusative vs genitive-dative), so a raw token vote splits one
occupation across several forms. We therefore normalise every candidate
token to a lemma FIRST, then majority-vote over lemmas.
"""
import csv, re, json
from collections import defaultdict, Counter

TAG = re.compile(r"<tg([MF])>(.+?)</tg[MF]>")
WORD = re.compile(r"[^\W\d_]+", re.UNICODE)

def lemma_m(w):
    for suf, rep in (("ului", ""), ("ul", ""), ("lui", ""), ("le", "e")):
        if w.endswith(suf):
            return w[: -len(suf)] + rep
    return w

def lemma_f(w):
    if w.endswith("ei"):  return w[:-2] + "ă"   # ambiguous (-ă / -e stems); vote resolves it
    if w.endswith("ea"):  return w[:-2] + "e"
    if w.endswith("a"):   return w[:-1] + "ă"
    return w

rows = list(csv.DictReader(open("data/raw/EnRoGend.csv", encoding="utf-8")))
tagged = [(m.group(1), m.group(2).lower(), r["romanian"])
          for r in rows if (m := TAG.search(r["english"] or ""))]

pairs, pending = [], defaultdict(list)
for gender, occ, ro in tagged:
    if gender == "M":
        pending[occ].append(ro)
    elif pending[occ]:
        pairs.append((occ, pending[occ].pop(0), ro))

votes = defaultdict(lambda: (Counter(), Counter()))
for occ, ro_m, ro_f in pairs:
    tm, tf = WORD.findall(ro_m), WORD.findall(ro_f)
    if len(tm) != len(tf):
        continue                      # clitic word-order change; skip in this pass
    vm, vf = votes[occ]
    for a, b in zip(tm, tf):
        if a.lower() != b.lower():
            vm[lemma_m(a.lower())] += 1
            vf[lemma_f(b.lower())] += 1

table = {}
for occ, (vm, vf) in votes.items():
    if not vm or not vf:
        continue
    (m, mn), (f, fn) = vm.most_common(1)[0], vf.most_common(1)[0]
    table[occ] = {"m": m, "f": f, "m_support": mn, "f_support": fn,
                  "m_total": sum(vm.values()), "f_total": sum(vf.values())}

json.dump(table, open("data/raw/occupation_pairs.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1, sort_keys=True)
print(f"rows {len(rows)} | pairs {len(pairs)} | occupations {len(table)}")
weak = [o for o, e in table.items() if e["f_support"] < 4]
print(f"low-confidence extractions (<4 votes): {weak or 'none'}")

# --- also emit every attested surface form per occupation, for engine validation ---
attested = defaultdict(lambda: {"m": set(), "f": set()})
for gender, occ, ro in tagged:
    key = "m" if gender == "M" else "f"
    for w in WORD.findall(ro):
        attested[occ][key].add(w.lower())
json.dump({o: {k: sorted(v) for k, v in d.items()} for o, d in attested.items()},
          open("data/raw/attested_forms.json", "w", encoding="utf-8"),
          ensure_ascii=False)
print(f"attested-form sets written for {len(attested)} occupations")
