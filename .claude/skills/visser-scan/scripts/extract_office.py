#!/usr/bin/env python3
"""Extract text from VisserLabs .xlsx / .docx files using only the Python stdlib.

Usage:
    python3 extract_office.py <file.xlsx|file.docx> [max_rows_per_sheet]

xlsx -> tab-separated rows per sheet, with `===== SHEET: <name> =====` headers.
docx -> markdown-ish text (headings, paragraphs, tables as pipe-rows).

No third-party dependencies (no openpyxl/pandoc), so it runs on a bare macOS
python3. Intended to be called by the /visser-scan skill.
"""
import sys, zipfile, re
from xml.etree import ElementTree as ET

WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


# ---------- docx ----------

def docx_para_text(p):
    return ''.join(t.text or '' for t in p.iter(f'{{{WORD_NS}}}t'))


def docx_style(p):
    s = p.find(f'{{{WORD_NS}}}pPr/{{{WORD_NS}}}pStyle')
    return s.get(f'{{{WORD_NS}}}val') if s is not None else ''


def extract_docx(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(f'{{{WORD_NS}}}body')
    for child in body:
        tag = child.tag.split('}')[1]
        if tag == 'p':
            txt = docx_para_text(child).strip()
            if not txt:
                continue
            st = docx_style(child)
            if st.startswith('Heading'):
                lvl = re.sub(r'\D', '', st) or '1'
                print('#' * int(lvl) + ' ' + txt)
            elif st == 'Title':
                print('# ' + txt)
            else:
                print(txt)
        elif tag == 'tbl':
            for row in child.findall(f'{{{WORD_NS}}}tr'):
                cells = [docx_para_text(c).strip().replace('\n', ' ')
                         for c in row.findall(f'{{{WORD_NS}}}tc')]
                print('| ' + ' | '.join(cells) + ' |')
            print()


# ---------- xlsx ----------

def xlsx_cell_text(c, shared):
    t = c.get('t')
    v = c.find(f'{{{SHEET_NS}}}v')
    if t == 'inlineStr':
        is_el = c.find(f'{{{SHEET_NS}}}is')
        if is_el is None:
            return ''
        return ''.join(x.text or '' for x in is_el.iter(f'{{{SHEET_NS}}}t'))
    if v is None:
        return ''
    if t == 's':
        return shared[int(v.text)]
    return v.text or ''


def col_idx(ref):
    n = 0
    for ch in re.match(r'([A-Z]+)', ref).group(1):
        n = n * 26 + ord(ch) - 64
    return n - 1


def extract_xlsx(path, max_rows):
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall(f'{{{SHEET_NS}}}si'):
                shared.append(''.join(t.text or '' for t in si.iter(f'{{{SHEET_NS}}}t')))
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        relmap = {rel.get('Id'): rel.get('Target') for rel in rels}
        for sheet in wb.iter(f'{{{SHEET_NS}}}sheet'):
            target = relmap[sheet.get(f'{{{REL_NS}}}id')].lstrip('/')
            if not target.startswith('xl/'):
                target = 'xl/' + target
            print(f'===== SHEET: {sheet.get("name")} =====')
            ws = ET.fromstring(z.read(target))
            count = 0
            for row in ws.iter(f'{{{SHEET_NS}}}row'):
                cells = {}
                for c in row.findall(f'{{{SHEET_NS}}}c'):
                    txt = xlsx_cell_text(c, shared).strip()
                    if txt:
                        cells[col_idx(c.get('r'))] = txt
                if not cells:
                    continue
                width = max(cells) + 1
                print('\t'.join(cells.get(i, '') for i in range(width)))
                count += 1
                if count >= max_rows:
                    print(f'... (truncated at {max_rows} rows)')
                    break
            print()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    max_rows = int(sys.argv[2]) if len(sys.argv) > 2 else 10 ** 9
    if path.lower().endswith('.docx'):
        extract_docx(path)
    elif path.lower().endswith('.xlsx'):
        extract_xlsx(path, max_rows)
    else:
        sys.exit(f'Unsupported file type: {path}')


if __name__ == '__main__':
    main()
