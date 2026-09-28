// Preserve each command's exit code, full log and timing; pipe failures must not
// turn a failed validator into a successful workflow.
import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';

const [name, command, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]*$/.test(name || '') || !command) throw Error('Usage: ci-step.mjs <stage> <command> [arguments]');
await mkdir('artifacts/ci', {recursive: true});
const started = Date.now(), log = createWriteStream(`artifacts/ci/${name}.log`);
const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
child.stdout.on('data', data => { process.stdout.write(data); log.write(data); });
child.stderr.on('data', data => { process.stderr.write(data); log.write(data); });
child.on('error', error => { log.write(`${error.message}\n`); });
const code = await new Promise(resolve => child.on('close', (status, signal) => resolve(status ?? (signal ? 130 : 1))));
log.end();
await finished(log);
await writeFile(`artifacts/ci/${name}.json`, JSON.stringify({stage: name, code, seconds: (Date.now() - started) / 1000, log: `artifacts/ci/${name}.log`}, null, 2) + '\n');
if (code) console.error(`::error title=${name} failed::Exit ${code}; see artifacts/ci/${name}.log`);
process.exitCode = code;
