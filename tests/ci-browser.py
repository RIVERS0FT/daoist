"""Run independent UI suites in two processes; performance runs separately."""
import argparse
import concurrent.futures
import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def run_suite(name, output, timeout):
    directory = output / name
    directory.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with (directory / 'stdout.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen([sys.executable, 'tests/browser-smoke.py', '--suite', name], cwd=ROOT,
                                   env={**os.environ, 'DAOIST_BROWSER_OUTPUT': str(directory), 'PYTHONIOENCODING': 'utf-8'},
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=os.name != 'nt')
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            else:
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            code = 124
            log.write(f'\nSuite timed out after {timeout}s.\n')
    report = directory / 'browser-tests.json'
    # The supervisor starts in a fresh output directory; a killed process never
    # inherits a success report from an earlier run.
    data = json.loads(report.read_text(encoding='utf-8')) if report.exists() else {'tests': [], 'passed': 0, 'failed': 1}
    if code == 0 and (data.get('failed') or not data.get('passed')):
        code = 1
    result = {**data, 'suite': name, 'code': code, 'seconds': round(time.monotonic() - started, 3), 'report': str(report)}
    print(f"{name}: {'PASS' if code == 0 else 'FAIL'} ({result['passed']} checks, {result['seconds']}s)", flush=True)
    if code:
        print('\n'.join((directory / 'stdout.log').read_text(encoding='utf-8').splitlines()[-70:]), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, choices=[1, 2], default=2)
    parser.add_argument('--suite-timeout', type=int, default=900)
    args = parser.parse_args()
    suites = json.loads(subprocess.check_output([sys.executable, 'tests/browser-smoke.py', '--list-suites'], cwd=ROOT, text=True))
    output = ROOT / 'artifacts' / 'browser-suites' / str(time.time_ns())
    output.mkdir(parents=True)
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_suite, name, output, args.suite_timeout) for name in suites]
        results = [future.result() for future in futures]
    report = {
        'mode': 'independent Chromium suites; full coverage; performance is not concurrent',
        'workers': args.workers, 'seconds': round(time.monotonic() - started, 3),
        'passed': sum(result['passed'] for result in results),
        'failed': sum(result['code'] != 0 for result in results),
        'tests': [test for result in results for test in result['tests']],
        'receipt_reload_modes': [mode for result in results for mode in result.get('receipt_reload_modes', [])],
        'suites': [{key: value for key, value in result.items() if key not in ('tests', 'receipt_reload_modes')} for result in results],
    }
    (ROOT / 'artifacts' / 'browser-tests.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"{report['passed']} browser checks; {report['failed']} failed suites; {report['seconds']}s")
    return 1 if report['failed'] else 0


if __name__ == '__main__':
    sys.exit(main())
