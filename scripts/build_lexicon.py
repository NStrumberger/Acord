"""Build the curated Romanian occupation lexicon from two independent sources.

Status is assigned from EVIDENCE, not opinion:
  normative  - EnRoGend and kaikki independently agree
  variant    - they disagree along the known o->oa breaking alternation,
               which is exactly what DOOM3 admits two spellings for
  attested   - only one source has it
  contested  - documented dispute in the literature (added by hand below)

Paradigms come from kaikki where complete, so plurals are attested rather
than derived (Romanian plural alternation is only ~70% predictable, see R0).
"""
import json

# Read the extracted pairs, NOT our own output -- otherwise the hand-curated
# EXTRA entries below are appended again on every run.
_pairs = json.load(open("data/raw/occupation_pairs.json", encoding="utf-8"))
lex = [{"en": en, "m": v["m"], "f": v["f"]} for en, v in sorted(_pairs.items())]
kk = json.load(open("data/raw/kaikki_paradigms.json", encoding="utf-8"))

# Verb paraphrase is the strongest gender-neutral strategy in Romanian:
# the 1sg present carries no gender at all. Only confident pairs listed.
# 1st and 2nd person singular present. Both are needed: "avoid gender" has to
# work for the person being addressed as well as the speaker.
NEUTRAL_VERB = {
    "teacher": ("predau", "predai"), "singer": ("cânt", "cânți"),
    "painter": ("pictez", "pictezi"), "dancer": ("dansez", "dansezi"),
    "chef": ("gătesc", "gătești"), "driver": ("conduc", "conduci"),
    "translator": ("traduc", "traduci"), "photographer": ("fotografiez", "fotografiezi"),
    "programmer": ("programez", "programezi"), "composer": ("compun", "compui"),
    "editor": ("editez", "editezi"),
}
# Epicene / neuter role nouns -- gender-free by construction.
NEUTRAL_NOUN = {"teacher": ("cadru didactic", "n")}

# Known source defects: not Romanian formations, so kaikki is disregarded.
SOURCE_DEFECT = {"arhivarka"}


# Documented disputes. Corpora record FORMS, not disagreement about them, so
# neither source can produce this status -- it is curated from the literature
# and must be reviewed by a speaker. Each carries its evidence.
CONTESTED = {
    "engineer": "both corpora record 'ingineră', but 'doamna inginer' remains "
                "widespread in address; usage is split",
}

# Canonical cases the status vocabulary exists for, absent from EnRoGend.
EXTRA = [
    {"en": "physician", "m": "medic", "f": "medică", "status": "contested",
     "note": "kaikki records 'medică'; 'doamna doctor' competes in usage"},
    {"en": "philologist", "m": "filolog", "f": "filologă", "fAlt": "filoloagă",
     "status": "variant",
     "note": "DOOM3 (2021) admits both spellings -- the canonical o->oa case"},
    {"en": "minister", "m": "ministru", "f": "ministră", "status": "contested",
     "note": "Wiktionary records no feminine; 'doamna ministru' still standard "
             "in official address"},
]

def breaking_pair(a, b):
    """True if the two forms differ only by the o->oa vowel breaking."""
    return a.replace("oa", "o") == b.replace("oa", "o") and a != b

entries = []
for e in lex:
    k = kk.get(e["m"]) or {}
    kf = k.get("feminine")
    f, f_alt, status, note = e["f"], None, "attested", None

    if kf and kf in SOURCE_DEFECT:
        note = f"kaikki gives '{kf}', which is not a Romanian formation; disregarded"
    elif kf == e["f"]:
        status = "normative"
        note = "EnRoGend and kaikki agree"
    elif kf and breaking_pair(e["f"], kf):
        status, f_alt = "variant", kf
        note = "sources differ by the o->oa breaking; DOOM3 admits both spellings"
    elif kf:
        status, f_alt = "variant", kf
        note = "sources disagree"

    if e["en"] in CONTESTED:
        status, note = "contested", CONTESTED[e["en"]]

    # Verb paraphrase is preferred over an epicene noun: a present-tense verb
    # carries no gender at all, whereas an epicene noun still has a lexical
    # gender that any adjective in the clause would have to agree with.
    neutral = {"kind": "none"}
    if e["en"] in NEUTRAL_VERB:
        v1, v2 = NEUTRAL_VERB[e["en"]]
        neutral = {"kind": "verb_paraphrase", "verb1sg": v1, "verb2sg": v2}
    elif e["en"] in NEUTRAL_NOUN:
        form, g = NEUTRAL_NOUN[e["en"]]
        neutral = {"kind": "epicene_noun", "form": form, "gender": g}

    entries.append({
        "en": e["en"], "m": e["m"], "f": f, "fAlt": f_alt,
        "status": status, "note": note,
        "gender": k.get("gender") or "m",
        "pluralM": k.get("plural"),
        "pluralF": (kk.get(f) or {}).get("plural"),
        "formsM": k.get("forms"),
        "formsF": (kk.get(f) or {}).get("forms"),
        "neutral": neutral,
        "sources": [s for s, ok in (("EnRoGend", True), ("kaikki", bool(k))) if ok],
        "reviewed": False,
    })

for x in EXTRA:
    k = kk.get(x["m"]) or {}
    entries.append({
        "en": x["en"], "m": x["m"], "f": x["f"], "fAlt": x.get("fAlt"),
        "status": x["status"], "note": x["note"],
        "gender": k.get("gender") or "m",
        "pluralM": k.get("plural"), "pluralF": (kk.get(x["f"]) or {}).get("plural"),
        "formsM": k.get("forms"), "formsF": (kk.get(x["f"]) or {}).get("forms"),
        "neutral": {"kind": "none"},
        "sources": ["curated"] + (["kaikki"] if k else []),
        "reviewed": False,
    })
entries.sort(key=lambda x: x["en"])

out = {
    "_license": "Derived from EnRoGend (CC BY 4.0) and kaikki.org Wiktionary "
                "extracts (CC BY-SA 4.0). ShareAlike attaches. Attribution required.",
    "_status": "normative=two sources agree | variant=sources differ, both current "
               "| attested=single source | contested=documented dispute",
    "entries": entries,
}
json.dump(out, open("src/ro/lexicon.occupations.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

from collections import Counter
c = Counter(x["status"] for x in entries)
print(f"entries {len(entries)} | status {dict(c)}")
print(f"with full masculine paradigm : {sum(1 for x in entries if x['formsM'])}")
print(f"with full feminine paradigm  : {sum(1 for x in entries if x['formsF'])}")
print(f"with a neutral strategy      : {sum(1 for x in entries if x['neutral']['kind']!='none')}")
