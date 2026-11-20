"""Generate the public example and 40 x 40 synthetic LimeSurvey activation fixtures."""
import csv
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

LANG = ["pl", "en", "de"]


def labels(pl, en, de):
    return dict(zip(LANG, (pl, en, de)))


def packed(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def option(code, kind, label, **flags):
    return dict(code=code, type=kind, label=label, **flags)


def definition(kind, source, options, rules=()):
    cfg = dict(version=1, kind=kind, source=source, options=options, rules=list(rules))
    cfg["revision"] = hashlib.sha256(packed(cfg).encode()).hexdigest()[:16]
    return cfg


def write_lss(out, stress=False, empty=False):
    sid = 817301 if not stress else (817303 if empty else 817302)
    root = ET.Element("document")
    ET.SubElement(root, "LimeSurveyDocType").text = "Survey"
    ET.SubElement(root, "DBVersion").text = "636"
    languages = ET.SubElement(root, "languages")
    for language in LANG:
        ET.SubElement(languages, "language").text = language
    def table(name, records):
        if not records:
            return
        tab = ET.SubElement(root, name)
        fields = ET.SubElement(tab, "fields")
        for key in records[0]:
            ET.SubElement(fields, "fieldname").text = key
        rows = ET.SubElement(tab, "rows")
        for record in records:
            row = ET.SubElement(rows, "row")
            for key, value in record.items():
                ET.SubElement(row, key).text = str(value)

    title = labels("Prace terenowe", "Fieldwork", "Feldarbeit")
    cities = labels("Wybierz lokalizacje", "Choose locations", "Standorte auswählen")
    measurements = labels("Pomiar", "Measurement", "Messung")
    service = labels("Serwis", "Service", "Wartung")
    blocks = [
        ("CITIES", "M", "", cities, None),
        ("WORK", "U", "LcJsonChoice", labels("Jakie prace wykonano?", "Which tasks were performed?", "Welche Arbeiten wurden durchgeführt?"), definition("choice", "CITIES",
          [option("MEASURE", "multi", measurements), option("SERVICE", "multi", service)])),
        ("TIME", "U", "LcJsonMatrix", labels("Ile godzin zajęły prace?", "How many hours did each task take?", "Wie viele Stunden wurden benötigt?"), definition("matrix", "WORK",
          [option("HOURS", "number", labels("Liczba godzin", "Hours", "Stunden"), required=True)])),
        ("REASON", "U", "LcJsonFollowup", labels("Dlaczego prace trwały ponad osiem godzin?", "Why did the task take more than eight hours?", "Warum dauerte die Arbeit über acht Stunden?"), definition("followup", "TIME",
          [option("OTHER", "multi", labels("Inne", "Other", "Sonstiges"), comment=True)],
          [dict(effect="show",target="*",when=dict(field="source.HOURS",op="gt",value=8))])),
    ]
    choices = [("LODZ", labels("Łódź","Łódź","Łódź")), ("GDYNIA", labels("Gdynia","Gdynia","Gdynia"))]
    if stress:
        choices = [(f"R{i:02d}", labels(*([f"Row {i:02d}"]*3))) for i in range(1,41)]
        columns = [option(f"C{i:02d}", "number", labels(*([f"Column {i:02d}"]*3)), required=True) for i in range(1,41)]
        blocks = [blocks[0]]
        if not empty:
            blocks.append(("GRID","U","LcJsonMatrix",labels("Macierz","Grid","Matrix"),definition("matrix","CITIES",columns)))
    groups, grouptext, questions, texts, subs, attributes = [], [], [], [], [], []
    for group, (code, typ, theme, label, config) in enumerate(blocks,1):
        qid = group * 100
        groups.append(dict(gid=group,sid=sid,group_order=group-1,randomization_group="",grelevance="1"))
        for language in LANG:
            grouptext.append(dict(gid=group,language=language,group_name=label[language],description=""))
        base = dict(qid=qid,parent_qid=0,sid=sid,gid=group,type=typ,title=code,preg="",other="N",mandatory="N",encrypted="N",question_order=0,
                    scale_id=0,same_default=0,relevance="1",question_theme_name=theme,modulename="",same_script=0)
        questions.append(base)
        for language in LANG:
            texts.append(dict(qid=qid,language=language,question=label[language],help="",script=""))
        if typ == "M":
            for seq,(key,tr) in enumerate(choices,1):
                subs.append(dict(base,qid=qid+seq,parent_qid=qid,type="T",title=key,question_order=seq-1))
                for lang in LANG:
                    texts.append(dict(qid=qid+seq,language=lang,question=tr[lang],help="",script=""))
        if config:
            for attr,val in [("lcjq_definition",packed(config)),("em_validation_q",f'lcjqValid(this.NAOK, "{code}", SID)')]:
                attributes.append(dict(qid=qid,attribute=attr,value=val,language=""))
    table("groups",groups)
    table("group_l10ns",grouptext)
    table("questions",questions)
    table("subquestions",subs)
    table("question_l10ns",texts)
    table("question_attributes",attributes)
    table("surveys",[dict(sid=sid,gsid=1,admin="",adminemail="",anonymized="Y",format="G",template="fruity_twentythree",language="pl",additional_languages="en de",
                          allowsave="Y",allowprev="Y",showwelcome="N",showgroupinfo="X",showxquestions="N",showqnumcode="X",showprogress="Y",active="N",listpublic="N")])
    table("surveys_languagesettings",[dict(surveyls_survey_id=sid,surveyls_language=lang,surveyls_title=title[lang],surveyls_description="",surveyls_welcometext="",
                                           surveyls_endtext=labels("Dziękujemy.", "Thank you.", "Vielen Dank.")[lang],surveyls_dateformat=1,surveyls_numberformat=0) for lang in LANG])
    ET.indent(root,space=" ")
    ET.ElementTree(root).write(out,encoding="utf-8",xml_declaration=True)
    return {b[0]:b[-1] for b in blocks if b[-1]}


def write_examples():
    folder = Path(__file__).resolve().parents[2] / "examples"
    cfg = write_lss(folder / "fieldwork.lss")
    selected = [
        ("WORK", ["LODZ"], "MEASURE", "multi", "true", ""),
        ("WORK", ["GDYNIA"], "SERVICE", "multi", "true", ""),
        ("TIME", ["LODZ","MEASURE"], "HOURS", "number", "9", ""),
        ("TIME", ["GDYNIA","SERVICE"], "HOURS", "number", "0", ""),
        ("REASON", ["LODZ","MEASURE"], "OTHER", "multi", "true", "Powtórzenie pomiaru"),
    ]
    with (folder / "fieldwork-expected.csv").open("w",encoding="utf-8",newline="") as fp:
        writer = csv.writer(fp,lineterminator="\n")
        writer.writerow(["response_id","question_code","revision","path","column","type","value","comment"])
        for code,path,col,kind,val,comment in selected:
            writer.writerow([1,code,cfg[code]["revision"],packed(path),col,kind,val,comment])


if __name__ == "__main__":
    write_examples()
