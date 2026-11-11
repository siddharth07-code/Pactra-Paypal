#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { enginesVersion } = require('@prisma/engines-version');
export const engineTarget = process.arch === 'arm64' ? 'linux-musl-arm64-openssl-3.0.x' : 'linux-musl-openssl-3.0.x';
export const engineDirectory = path.join(os.homedir(), '.cache/pactra/prisma', enginesVersion);
// Only the TLS/engine process runs; this image never starts a PostgreSQL server.
export const engineImage = 'postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685';

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const prisma = fileURLToPath(new URL('../../prisma', import.meta.url));
  const child = spawn('docker', ['run', '--rm', '-i', '--log-driver=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--user', '65534:65534', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--workdir', prisma,
    '--env', 'DATABASE_URL', '--env', 'DIRECT_URL',
    '--mount', `type=bind,src=${prisma},dst=${prisma},readonly`,
    '--mount', `type=bind,src=${engineDirectory},dst=/engine,readonly`,
    '--entrypoint', `/engine/schema-engine-${engineTarget}`, engineImage, ...process.argv.slice(2)], { stdio: 'inherit' });
  child.on('error', () => { console.error('Linux Prisma engine could not start. Start the trusted local Docker daemon.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
