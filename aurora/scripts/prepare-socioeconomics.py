"""Rebuild national sector attributes from the two official IBGE ZIPs.

Usage: python scripts/prepare-socioeconomics.py basico.zip renda.zip
No geocoding, interpolation, inflation adjustment or suppressed-value imputation.
"""
import csv
import hashlib
import io
import json
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'shared' / 'census'
BASIC_URL = 'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/Agregados_por_Setor_csv/Agregados_por_setores_basico_BR_20260520.zip'
INCOME_URL = 'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel/Agregados_por_setores_renda_responsavel_BR_20260508_csv.zip'

def rows(path):
    with zipfile.ZipFile(path) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith('.csv')]
        if len(names) != 1:
            raise ValueError('Expected exactly one CSV')
        with io.TextIOWrapper(archive.open(names[0]), encoding='latin1', newline='') as file:
            yield from csv.DictReader(file, delimiter=';')

def value(text):
    try:
        x = float(text.replace(',', '.'))
        return int(x) if x.is_integer() and x >= 0 else x if x >= 0 and x < float('inf') else None
    except (ValueError, AttributeError):
        return None

basic, income = map(pathlib.Path, sys.argv[1:3])
states, seen = {}, set()
for row in rows(basic):
    code = row['CD_SETOR']
    if not code.isdigit() or len(code) != 15 or code in seen:
        raise ValueError('Invalid/duplicate sector ' + code)
    seen.add(code)
    states.setdefault(code[:2], {}).setdefault(code[:7], {})[code[7:]] = [value(row[k]) for k in ['v0001', 'v0002', 'v0007', 'v0009', 'v0008']] + [None, None]
income_seen = set()
matched = 0
for row in rows(income):
    code = row['CD_SETOR']
    if not code.isdigit() or len(code) != 15 or code in income_seen:
        raise ValueError('Invalid/duplicate income sector ' + code)
    income_seen.add(code)
    record = states.get(code[:2], {}).get(code[:7], {}).get(code[7:])
    if record is not None:
        record[5:7] = [value(row['V06004']), value(row['V06001'])]
        matched += 1
ROOT.mkdir(exist_ok=True)
for state, data in states.items():
    (ROOT / (state + '.json')).write_text(json.dumps(data, separators=(',', ':')))
manifest = dict(provider='IBGE', reference='2022', release='2026-05-20', income_release='2026-05-08',
    source_url=BASIC_URL, income_url=INCOME_URL, sha256=hashlib.sha256(basic.read_bytes()).hexdigest(),
    income_sha256=hashlib.sha256(income.read_bytes()).hexdigest(), sectors=len(seen), income_matched=matched,
    states=sorted(states), fields=['population', 'households', 'occupied', 'vacant', 'occasional', 'income', 'responsible'],
    variables={'v0001':'Pessoas', 'v0002':'Domicílios totais', 'v0007':'Domicílios particulares ocupados',
       'v0009':'Domicílios particulares permanentes vagos', 'v0008':'Domicílios particulares de uso ocasional',
       'V06004':'Rendimento nominal médio mensal das pessoas responsáveis com rendimentos por domicílios particulares permanentes ocupados',
       'V06001':'Pessoas responsáveis em domicílios particulares permanentes ocupados'},
    note='Associação exata por CD_SETOR. Valores suprimidos preservados como null. Renda nominal de 2022; não é renda familiar nem capacidade de compra.')
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'sectors':len(seen), 'income_matched':matched, 'states':len(states)}))
