"""Build the public 2022 census attribute cache, keyed by the official sector code.

Usage: python scripts/prepare-census.py /path/to/BR_setores_CD2022.csv
Download: https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/setores/csv/BR_setores_CD2022.csv
No interpolation or invented values. Non-numeric/suppressed values remain null.
"""
import csv
import hashlib
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(__file__).resolve().parents[1] / 'shared' / 'census'
target.mkdir(parents=True, exist_ok=True)
states = {}
count = 0

def integer(raw):
    return int(raw) if raw.isdigit() else None

with source.open(encoding='utf-8-sig', newline='') as file:
    for row in csv.DictReader(file):
        sector = row['CD_SETOR']
        if not sector.isdigit() or len(sector) != 15:
            raise ValueError('Unexpected sector code: ' + sector)
        municipality = sector[:7]
        values = states.setdefault(sector[:2], {}).setdefault(municipality, {})
        if sector[7:] in values:
            raise ValueError('Duplicated sector: ' + sector)
        values[sector[7:]] = [integer(row['v0001']), integer(row['v0002'])]
        count += 1

for code, municipalities in states.items():
    (target / (code + '.json')).write_text(json.dumps(municipalities, separators=(',', ':')))
manifest = {
    'provider': 'IBGE', 'reference': '2022', 'release': '2024-11-13',
    'source_url': 'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/setores/csv/BR_setores_CD2022.csv',
    'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sectors': count,
    'variables': {'v0001': 'Total de pessoas', 'v0002': 'Total de domicílios, inclusive vagos e de uso ocasional'},
    'states': sorted(states), 'note': 'Valores originais. Ausências preservadas como null. Associação à malha definitiva por CD_SETOR.'
}
(target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'sectors': count, 'states': len(states), 'bytes': sum(p.stat().st_size for p in target.glob('*.json'))}))
