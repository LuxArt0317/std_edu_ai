import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { bundleRoot, documents, documentKey, matches, sha } from './lib/school-document-bundle.mjs';
const docs = await documents(), root = path.resolve('public/school-assets');
for (const a of docs)
    if (!await matches(path.join(root, path.basename(a.file)), a.checksum))
        throw Error(`Cannot package unverified document: ${a.file}`);
await fs.mkdir(path.dirname(bundleRoot), { recursive: true });
const temp = await fs.mkdtemp(path.resolve('vendor/.school-documents-'));
const parts = [], hash = createHash('sha256');
let buffers = [], bufferBytes = 0, total = 0;
async function flush() { if (!bufferBytes)
    return; const b = Buffer.concat(buffers, bufferBytes), file = `part-${String(parts.length).padStart(3, '0')}.bin`; await fs.writeFile(path.join(temp, file), b); parts.push({ file, bytes: b.length, checksum: sha(b) }); buffers = []; bufferBytes = 0; }
const tar = spawn('tar', ['--format=ustar', '-czf', '-', '-C', root, ...docs.map(a => path.basename(a.file))], { env: { ...process.env, COPYFILE_DISABLE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
tar.stderr.on('data', b => stderr += b.toString().slice(0, 1000));
const completed = new Promise((resolve, reject) => { tar.once('error', reject); tar.once('close', code => code === 0 ? resolve() : reject(Error(`tar packaging failed: ${stderr}`))); });
completed.catch(() => { });
try {
    await pipeline(tar.stdout, new Writable({ write(chunk, _encoding, callback) { (async () => { hash.update(chunk); total += chunk.length; let offset = 0; while (offset < chunk.length) {
            const size = Math.min(chunk.length - offset, 32 * 1024 * 1024 - bufferBytes);
            buffers.push(chunk.subarray(offset, offset + size));
            bufferBytes += size;
            offset += size;
            if (bufferBytes === 32 * 1024 * 1024)
                await flush();
        } })().then(() => callback(), callback); } }));
    await completed;
    await flush();
    const manifest = { version: 1, documents: docs.length, documentKey: documentKey(docs), archiveBytes: total, archiveChecksum: hash.digest('hex'), parts };
    await fs.writeFile(path.join(temp, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await fs.mkdir(bundleRoot, { recursive: true });
    for (const f of await fs.readdir(temp))
        await fs.rename(path.join(temp, f), path.join(bundleRoot, f));
    for (const f of await fs.readdir(bundleRoot))
        if (/^part-\d+\.bin$/.test(f) && !parts.some(p => p.file === f))
            await fs.rm(path.join(bundleRoot, f));
    console.log(JSON.stringify({ documents: docs.length, parts: parts.length, compressedBytes: total, archiveChecksum: manifest.archiveChecksum }));
}
catch (e) {
    tar.kill();
    throw e;
}
finally {
    await fs.rm(temp, { recursive: true, force: true });
}
