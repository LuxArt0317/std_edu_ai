import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile), repo = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'stu-document-bundle-'));
const manifestDir = path.join(temp, 'src/features/public/mirror');
const command = () => exec(process.execPath, [path.join(repo, 'scripts/prepare-school-assets.mjs')], { cwd: temp, env: { ...process.env, STU_MIRROR_OFFLINE: '0' }, timeout: 300000, maxBuffer: 1024 * 1024 });
try {
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.symlink(path.join(repo, 'src/features/public/mirror/assets.json'), path.join(manifestDir, 'assets.json'));
    await fs.symlink(path.join(repo, 'vendor'), path.join(temp, 'vendor'));
    const result = JSON.parse((await command()).stdout.trim());
    assert.equal(result.networkDownloads, 0);
    assert.equal(result.restored, result.total);
    assert.ok(result.total > 0);
    const target = path.join(temp, 'public/school-assets');
    assert.equal((await fs.readdir(target)).length, result.total);
    const bundle = JSON.parse(await fs.readFile(path.join(repo, 'vendor/school-documents/manifest.json'), 'utf8'));
    await fs.rm(path.join(target, (await fs.readdir(target))[0]));
    await fs.rm(path.join(temp, 'node_modules/.cache/stu-school-assets'), { recursive: true, force: true });
    await fs.unlink(path.join(temp, 'vendor'));
    const fixture = path.join(temp, 'vendor/school-documents');
    await fs.mkdir(fixture, { recursive: true });
    for (const part of bundle.parts)
        await fs.symlink(path.join(repo, 'vendor/school-documents', part.file), path.join(fixture, part.file));
    await fs.writeFile(path.join(fixture, 'manifest.json'), JSON.stringify(bundle));
    const first = path.join(fixture, bundle.parts[0].file);
    await fs.unlink(first);
    const damaged = await fs.readFile(path.join(repo, 'vendor/school-documents', bundle.parts[0].file));
    damaged[0] ^= 1;
    await fs.writeFile(first, damaged);
    await assert.rejects(command(), e => e.code === 1 && e.stderr.includes('integrity failure'));
    bundle.parts[0].file = '../unexpected.bin';
    await fs.writeFile(path.join(fixture, 'manifest.json'), JSON.stringify(bundle));
    await assert.rejects(command(), e => e.code === 1 && e.stderr.includes('Invalid document bundle part'));
    console.log(JSON.stringify({ status: 'passed', documents: result.total, networkDownloads: 0, corruptPartRejected: true, pathTraversalRejected: true }));
}
finally {
    await fs.rm(temp, { recursive: true, force: true });
}
