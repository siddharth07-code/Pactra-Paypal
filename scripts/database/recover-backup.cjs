/* eslint-disable @typescript-eslint/no-require-imports -- Standalone recovery tools use CommonJS outside repository module resolution. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = __dirname;
const summary = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'));
const key = fs.readFileSync(summary.keyPath);
function decrypt(name) {
  const data = fs.readFileSync(path.join(directory, name + '.enc'));
  if (data.subarray(0, 8).toString() !== 'PACTRA01') throw new Error('Invalid archive header');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(8, 20));
  decipher.setAAD(data.subarray(0, 8));
  decipher.setAuthTag(data.subarray(20, 36));
  return Buffer.concat([decipher.update(data.subarray(36)), decipher.final()]);
}
const manifest = JSON.parse(decrypt('manifest.json'));
for (const [name, expected] of Object.entries(manifest.files)) {
  const hash = crypto.createHash('sha256').update(decrypt(name)).digest('hex');
  if (hash !== expected.sha256) throw new Error('Payload checksum failed');
}
if (process.argv[2] === 'verify') {
  console.log('AES-256-GCM authentication and all manifest SHA-256 checks passed.');
} else if (process.argv[2] === 'extract') {
  const destination = process.argv[3];
  if (!destination || !path.isAbsolute(destination) || !destination.startsWith('/private/tmp/')) throw new Error('Use a new absolute directory under /private/tmp for recovery plaintext.');
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const name of ['database.dump', 'roles.sql', 'manifest.json', 'database-configuration.json', 'archive-list.txt']) fs.writeFileSync(path.join(destination, name), decrypt(name), { mode: 0o600, flag: 'wx' });
  console.log('Recovery files extracted with owner-only permissions. Remove plaintext after the recovery session.');
} else {
  throw new Error('Use verify or extract /private/tmp/<new-directory>');
}
key.fill(0);
