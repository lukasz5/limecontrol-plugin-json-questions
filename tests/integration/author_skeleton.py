"""Produce the author's starting point: a native multiple choice and three unconfigured U questions."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

from fixture import write_lss


def write_author_skeleton(path):
    write_lss(path)
    doc = ET.parse(path)
    root = doc.getroot()
    for node in root.findall(".//sid") + root.findall(".//surveyls_survey_id"):
        node.text = "819501"
    root.remove(root.find("question_attributes"))
    for question in root.findall("questions/rows/row"):
        question.find("question_theme_name").text = ""
        if question.findtext("title") in ("WORK", "TIME"):
            # The two JSON blocks share the second page. Earlier native choices are on page one.
            question.find("gid").text = "2"
            question.find("question_order").text = "0" if question.findtext("title") == "WORK" else "1"
    for table in ("groups", "group_l10ns"):
        rows = root.find(table + "/rows")
        for row in list(rows):
            if row.findtext("gid") == "3":
                rows.remove(row)
    for node in root.findall("surveys_languagesettings/rows/row/surveyls_title"):
        node.text = "LimeControl editor acceptance"
    ET.indent(root, space=" ")
    doc.write(path, encoding="utf-8", xml_declaration=True)


if __name__ == "__main__":
    write_author_skeleton(Path(sys.argv[1]))
