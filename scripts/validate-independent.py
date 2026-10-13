"""Independent source checks using only Python's standard library, not application logic."""
import csv, hashlib, json
from pathlib import Path
from collections import Counter
from decimal import Decimal
root=Path(__file__).resolve().parents[1]
raw=(root/'data/reports.csv').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='bee8b5a451167aab11add9c6c2fc959f37d0c93b6ebc2560a93254849c8f4d50', 'Source bytes changed'
rows=list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
assert len(rows)==2000
counts=Counter(r['report_id'] for r in rows)
assert len(counts)==100 and set(counts.values())=={20}
assert sum(not ('@' in r['owner_email'] and '.' in r['owner_email'].split('@')[-1]) for r in rows)==245
assert sum(Decimal(r['snowflake_credits_consumed'])<0 for r in rows)==24
assert sum(Decimal(r['avg_load_time_sec'])>15 for r in rows)==1490
assert Counter(r['last_refresh_status'] for r in rows)=={'SUCCESS':1336,'FAILED':382,'TIMED_OUT':182,'UNKNOWN':100}
seen=Counter();sets={i:[] for i in range(1,21)}
for row in rows:
    seen[row['report_id']]+=1;sets[seen[row['report_id']]].append(row)
results=[]
for i,group in sets.items():
    assert len(group)==100
    valid=[r for r in group if Decimal(r['snowflake_credits_consumed'])>=0]
    total=sum((Decimal(r['snowflake_credits_consumed'])*3+Decimal(r['aws_hosting_cost_usd']) for r in valid),Decimal(0))
    views=sum(int(r['monthly_active_views']) for r in valid)
    results.append({'set':i,'complete_cost_reports':len(valid),'matched_views':views,'combined_usd':str(total),'cost_per_view':str(total/views) if views else None})
assert results[0]['combined_usd']=='188417.87'
assert results[0]['matched_views']==78239
assert results[0]['complete_cost_reports']==99
print(json.dumps({'source_sha256':hashlib.sha256(raw).hexdigest(),'independent_source_checks':'PASS','sets':results},indent=2))
