#!/usr/bin/env python3
"""Run one REA capture-browser-scenario and extract its artifacts.

Usage: python3 run-scenario.py <name> <scenario.json> <outdir>

Writes into <outdir>/<name>/:
  evidence.json      complete REA Evidence bundle (canonical, digest-addressed)
  steps.md           per-step status, URL, evidence id, accessibility text
  <step>.png         screenshots REA captured (sha256 verified against Evidence)
Appends one line to <outdir>/index.tsv.
"""
import base64, hashlib, json, os, subprocess, sys

name, scenario, outdir = sys.argv[1], os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
target = os.path.join(outdir, name)
os.makedirs(target, exist_ok=True)
evidence = os.path.join(target, 'evidence.json')
if os.path.exists(evidence):
    os.remove(evidence)
env = dict(os.environ, REA_BROWSER_NO_SANDBOX='true')
spec = json.load(open(scenario))
if spec['browser'].get('mode') == 'connect' and not spec['browser'].get('target_id'):
    # Connect mode: open a fresh tab in the operator-started, proxied Chromium
    # (loopback CDP) and hand REA that exact target. REA then navigates it to start_url.
    import urllib.request
    endpoint = spec['browser']['cdp_endpoint']
    req = urllib.request.Request(endpoint + '/json/new?' + spec['start_url']['url'], method='PUT')
    tab = json.load(urllib.request.urlopen(req))
    import time; time.sleep(4)
    spec['browser']['target_id'] = tab['id']
    scenario = os.path.join(target, 'scenario.json')
    json.dump(spec, open(scenario, 'w'), indent=1)
proc = subprocess.run(['rea', 'capture-browser-scenario', scenario, '--detail', 'summary',
                       '--evidence_output', evidence, '--format', 'json'],
                      capture_output=True, text=True, env=env)
if proc.returncode != 0 or not os.path.exists(evidence):
    print(proc.stdout[-3000:], proc.stderr[-2000:])
    sys.exit(1)

bundle = json.load(open(evidence))
record = bundle['records'][0]
result = record['normalized_result']
lines = [f"# REA scenario: {name}", '',
         f"- Evidence: `{record['evidence_id']}`",
         f"- Browser: {result['browser']['product']} {result['browser']['version']} ({result['browser']['mode']}, cleanup {result['browser']['cleanup']})",
         f"- Completeness: {result['completeness']['status']}", '']
for step in result['steps']:
    art = step.get('artifacts', {})
    lines.append(f"## {step['step_index']:02d} {step['step_id']} — {step['action']} — {step['status']}")
    lines.append(f"URL: {step['after_url'].get('url')}")
    if step.get('error'):
        lines.append(f"Error: {json.dumps(step['error'])[:600]}")
    shot = art.get('screenshot', {})
    if shot.get('state') == 'captured':
        raw = base64.b64decode(shot['value']['data_base64'])
        assert hashlib.sha256(raw).hexdigest() == shot['value']['sha256'], 'screenshot digest mismatch'
        png = f"{step['step_index']:02d}-{step['step_id']}.png"
        open(os.path.join(target, png), 'wb').write(raw)
        lines.append(f"Screenshot: `{png}` sha256 `{shot['value']['sha256'][:16]}…`")
    acc = art.get('accessibility', {})
    if acc.get('state') == 'captured':
        text = acc['value']['text']
        lines += ['```yaml', text[:6000] + ('\n…(truncated in this view; full text in evidence.json)' if len(text) > 6000 else ''), '```']
    lines.append('')
errors = [e for e in result['events']['items'] if e.get('kind') == 'page-error']
if errors:
    lines.append('## Page errors')
    lines += [f"- {e.get('text') or e.get('message')}" for e in errors[:20]]
open(os.path.join(target, 'steps.md'), 'w').write('\n'.join(lines))
ok = sum(1 for s in result['steps'] if s['status'] == 'completed')
with open(os.path.join(outdir, 'index.tsv'), 'a') as idx:
    idx.write(f"{name}\t{record['evidence_id']}\t{ok}/{len(result['steps'])} steps completed\t{result['steps'][-1]['after_url'].get('url')}\n")
print(f"{name}: {record['evidence_id']} {ok}/{len(result['steps'])} completed")
for s in result['steps']:
    if s['status'] != 'completed':
        print('  FAILED', s['step_id'], json.dumps(s.get('error'))[:400])
