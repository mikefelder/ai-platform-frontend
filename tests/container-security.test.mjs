import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

const engine = process.env.CONTAINER_ENGINE || 'docker';
const id = `uaip-security-${randomBytes(6).toString('hex')}`;
const image = `localhost/${id}:test`;
const containers = [];
const password = randomBytes(24).toString('hex');
const key = randomBytes(16).toString('hex');
const authorization = `Basic ${Buffer.from(`reviewer:${password}`).toString('base64')}`;
let directory;
let networkCreated = false;
let imageCreated = false;
let baseUrl;

function run(args, options = {}) {
  return execFileSync(engine, args, { encoding: 'utf8', timeout: 240_000, ...options }).trim();
}

function logs(name) {
  const result = spawnSync(engine, ['logs', name], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout + result.stderr;
}

function start(name, args) {
  containers.push(name);
  return run(['run', '-d', '--name', name, ...args]);
}

async function frontend(suffix, port, mountedPassword = true) {
  const config = readFileSync('nginx.conf', 'utf8')
    .replace('https://192.168.4.4/', `https://upstream:${port}/`)
    .replace('/etc/ssl/certs/ca-certificates.crt', '/fixtures/trusted.pem');
  const configPath = join(directory, `nginx-${suffix}.template`);
  writeFileSync(configPath, config);
  const name = `${id}-${suffix}`;
  const auth = mountedPassword
    ? ['-v', `${join(directory, 'htpasswd')}:/run/secrets/frontend/htpasswd:ro`]
    : ['-e', `FRONTEND_HTPASSWD=${readFileSync(join(directory, 'htpasswd'), 'utf8')}`];
  start(name, [
    '--network', id, '-p', '127.0.0.1::8080',
    '-e', `APIM_SUBSCRIPTION_KEY=${key}`,
    '-v', `${configPath}:/etc/nginx/templates/default.conf.template:ro`,
    '-v', `${directory}:/fixtures:ro`, ...auth, image,
  ]);
  const address = run(['port', name, '8080/tcp']).split('\n')[0];
  const url = `http://${address}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === 401) return url;
    } catch (error) {
      if (attempt === 59) throw error;
    }
    await setTimeout(250);
  }
  throw new Error(`Frontend did not become ready: ${logs(name)}`);
}

before(async () => {
  run(['info']);
  directory = mkdtempSync(join(process.cwd(), '.container-security-'));
  const hash = execFileSync('openssl', ['passwd', '-apr1', '-stdin'], {
    input: password, encoding: 'utf8',
  }).trim();
  writeFileSync(join(directory, 'htpasswd'), `reviewer:${hash}\n`, { mode: 0o644 });
  mkdirSync(join(directory, 'empty-auth'));
  for (const [name, hostname] of [
    ['valid', 'ai-alz-apim-i40e.azure-api.net'],
    ['untrusted', 'ai-alz-apim-i40e.azure-api.net'],
    ['wrong', 'wrong.example.test'],
  ]) {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', `/CN=${hostname}`, '-addext', `subjectAltName=DNS:${hostname}`,
      '-keyout', join(directory, `${name}.key`), '-out', join(directory, `${name}.pem`),
    ], { stdio: 'ignore' });
  }
  writeFileSync(join(directory, 'trusted.pem'),
    readFileSync(join(directory, 'valid.pem')) + readFileSync(join(directory, 'wrong.pem')));
  const upstream = `
    const https = require('node:https');
    const fs = require('node:fs');
    for (const [name, port] of [['valid', 8443], ['untrusted', 8444], ['wrong', 8445]]) {
      https.createServer({
        key: fs.readFileSync('/fixtures/' + name + '.key'),
        cert: fs.readFileSync('/fixtures/' + name + '.pem'),
      }, (req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ url: req.url, headers: req.headers, body }));
        });
      }).listen(port);
    }
  `;
  writeFileSync(join(directory, 'upstream.cjs'), upstream);
  run(['build', '-t', image, '.'], { stdio: 'pipe' });
  imageCreated = true;
  run(['network', 'create', id]);
  networkCreated = true;
  start(`${id}-upstream`, [
    '--network', id, '--network-alias', 'upstream',
    '-v', `${directory}:/fixtures:ro`, 'docker.io/library/node:26-alpine',
    'node', '/fixtures/upstream.cjs',
  ]);
  baseUrl = await frontend('valid', 8443);
}, { timeout: 300_000 });

after(() => {
  const failures = [];
  for (const name of containers.reverse()) {
    const result = spawnSync(engine, ['rm', '-f', name], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(result.stderr);
  }
  if (networkCreated) {
    const result = spawnSync(engine, ['network', 'rm', id], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(result.stderr);
  }
  if (imageCreated) {
    const result = spawnSync(engine, ['image', 'rm', image], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(result.stderr);
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
  assert.deepEqual(failures, [], 'Container test cleanup failed');
});

function post(url, headers = {}) {
  return fetch(`${url}/api/uc2/responses`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ input: 'test query' }),
    signal: AbortSignal.timeout(15_000),
  });
}

test('startup fails closed for missing or unsafe secrets', () => {
  for (const args of [
    [],
    ['-e', `APIM_SUBSCRIPTION_KEY=${key}`],
    ['-e', `APIM_SUBSCRIPTION_KEY=${key}`, '-v', `${join(directory, 'empty-auth')}:/run/secrets/frontend:ro`],
    ['-e', 'APIM_SUBSCRIPTION_KEY=invalid";injection'],
  ]) {
    const result = spawnSync(engine, ['run', '--rm', ...args, image], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout + result.stderr, /APIM_SUBSCRIPTION_KEY|password file/);
    assert.ok(!(result.stdout + result.stderr).includes(key));
  }
});

test('SPA and API require valid Basic authentication', async () => {
  assert.equal((await fetch(baseUrl)).status, 401);
  assert.equal((await fetch(baseUrl, { headers: { authorization: 'Basic invalid' } })).status, 401);
  const response = await fetch(`${baseUrl}/flow`, { headers: { authorization } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html/);
  assert.equal((await post(baseUrl, { authorization: '' })).status, 401);
});

test('verified upstream receives only the runtime subscription key, never the Basic credentials', async () => {
  const response = await post(baseUrl, { 'Ocp-Apim-Subscription-Key': 'client-spoof' });
  assert.equal(response.status, 200);
  const received = await response.json();
  assert.equal(received.url, '/uc2/responses');
  assert.equal(received.headers['ocp-apim-subscription-key'], key);
  assert.equal(received.headers.authorization, undefined);
  assert.equal(received.headers.host, 'ai-alz-apim-i40e.azure-api.net');
  assert.deepEqual(JSON.parse(received.body), { input: 'test query' });
});

test('cross-site requests and form submissions cannot use the authenticated relay', async () => {
  assert.equal((await post(baseUrl, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post(baseUrl, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await fetch(`${baseUrl}/api/uc2/responses`, { headers: { authorization } })).status, 403);
});

test('untrusted upstream certificate is rejected', async () => {
  const url = await frontend('untrusted', 8444, false);
  assert.equal((await post(url)).status, 502);
  assert.match(logs(`${id}-untrusted`), /upstream SSL certificate verify error/);
});

test('trusted certificate for the wrong hostname is rejected', async () => {
  const url = await frontend('wrong', 8445);
  assert.equal((await post(url)).status, 502);
  assert.match(logs(`${id}-wrong`), /upstream SSL certificate does not match/);
});
