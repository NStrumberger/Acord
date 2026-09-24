"""Pull real paradigms and feminine equivalents from kaikki.org for our lemmas.

Two outputs:
  - full 8-cell paradigms, so plurals are ATTESTED rather than derived
    (Romanian plural stem alternation is only ~70% predictable -- see R0)
  - kaikki's own 'feminine' equivalent, an INDEPENDENT second source to
    cross-check the feminines we derived from EnRoGend
"""
import json
from collections import defaultdict

lex = json.load(open("src/ro/lexicon.occupations.json", encoding="utf-8"))["entries"]
wanted = {e["m"] for e in lex} | {e["f"] for e in lex}
# canonical contested cases the status feature exists for (not in EnRoGend)
wanted |= {"ministru", "medic", "inginer", "soldat", "filolog", "primar", "sofer"}

CASE = {("nominative", "accusative"): "na", ("dative", "genitive"): "gd"}

def cells(forms):
    out = {}
    for f in forms or []:
        t = set(f.get("tags") or [])
        num = "sg" if "singular" in t else "pl" if "plural" in t else None
        cas = "na" if {"nominative", "accusative"} & t else "gd" if {"genitive", "dative"} & t else None
        dfn = "indef" if "indefinite" in t else "def" if "definite" in t else None
        if num and cas and dfn:
            out[f"{num}.{cas}.{dfn}"] = f["form"]
    return out

found = {}
for line in open("data/raw/ro-nouns.jsonl", encoding="utf-8"):
    d = json.loads(line)
    w = d.get("word")
    if w not in wanted or w in found:
        continue
    forms = d.get("forms") or []
    tmpl = next((f["form"] for f in forms if "inflection-template" in (f.get("tags") or [])), "")
    gender = "m" if tmpl.endswith("-m") else "f" if tmpl.endswith("-f") else "n" if tmpl.endswith("-n") else None
    fem = next((f["form"].replace("equivalent ", "").strip()
                for f in forms if "feminine" in (f.get("tags") or [])), None)
    plural = next((f["form"] for f in forms if (f.get("tags") or []) == ["plural"]), None)
    c = cells(forms)
    if len(c) == 8:
        found[w] = {"gender": gender, "plural": plural, "feminine": fem, "forms": c}

json.dump(found, open("data/raw/kaikki_paradigms.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1, sort_keys=True)
print(f"wanted {len(wanted)} lemmas | complete paradigms found {len(found)}")
missing = sorted(wanted - set(found))
print(f"missing ({len(missing)}): {', '.join(missing[:20])}{' ...' if len(missing)>20 else ''}")
