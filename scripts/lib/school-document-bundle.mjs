import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const bundleRoot = 'vendor/school-documents';
export const sha = b => createHash('sha256').update(b).digest('hex');
export async function fileSha(file) { const h = createHash('sha256'); for await (const b of createReadStream(file))
    h.update(b); return h.digest('hex'); }
export async function documents() {
    const assets = JSON.parse(await fs.readFile('src/features/public/mirror/assets.json', 'utf8'));
    const unique = new Map();
    for (const a of assets.filter(a => /\.(pdf|docx?|xlsx?|pptx?|zip|rar)$/.test(a.file))) {
        if (!/^\/school-assets\/[a-f\d]{20}\.[a-z\d]+$/.test(a.file) || !/^[a-f\d]{64}$/.test(a.checksum) || !Number.isSafeInteger(a.bytes) || a.bytes <= 0)
            throw Error('Invalid document manifest');
        if (unique.has(a.file) && unique.get(a.file).checksum !== a.checksum)
            throw Error('Conflicting document checksum');
        unique.set(a.file, a);
    }
    return [...unique.values()].sort((a, b) => a.file.localeCompare(b.file));
}
export const documentKey = docs => sha(JSON.stringify(docs.map(({ file, checksum, bytes }) => ({ file, checksum, bytes }))));
export async function matches(file, checksum) { try {
    return await fileSha(file) === checksum;
}
catch {
    return false;
} }
export async function restoreDocuments(docs, missing, target, cache, {bundleDirectory=bundleRoot}={}) {
    const manifest = JSON.parse(await fs.readFile(path.join(bundleDirectory, 'manifest.json'), 'utf8'));
    const supplemental=manifest.supplementalDocuments??[];
    if(!Array.isArray(supplemental))throw Error('Invalid supplemental document manifest');
    const extras=new Map();
    for(const descriptor of supplemental){
        if(!descriptor||!/^\/school-assets\/[a-f\d]{20}\.[a-z\d]+$/.test(descriptor.file)||!/^[a-f\d]{64}$/.test(descriptor.checksum)||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<=0||extras.has(descriptor.file))throw Error('Invalid supplemental document descriptor');
        const reviewed=docs.filter(document=>document.file===descriptor.file);
        if(reviewed.length!==1||reviewed[0].checksum!==descriptor.checksum||reviewed[0].bytes!==descriptor.bytes)throw Error('Supplemental document does not match reviewed assets');
        const physical=path.join(target,path.basename(descriptor.file));
        const stat=await fs.lstat(physical).catch(()=>null);
        if(!stat?.isFile()||stat.isSymbolicLink()||stat.size!==descriptor.bytes||!await matches(physical,descriptor.checksum))throw Error('Missing or corrupt supplemental document: '+descriptor.file);
        extras.set(descriptor.file,descriptor);
    }
    const bundled=docs.filter(document=>!extras.has(document.file));
    if(missing.some(document=>extras.has(document.file)))throw Error('Supplemental documents must be supplied intact, not restored from the old archive');
    if (manifest.version !== 1 || manifest.documents !== bundled.length || manifest.documentKey !== documentKey(bundled) || !/^[a-f\d]{64}$/.test(manifest.archiveChecksum) || !Array.isArray(manifest.parts) || !manifest.parts.length)
        throw Error('Document bundle does not match the reviewed asset manifest');
    await fs.mkdir(cache, { recursive: true });
    const archive = path.join(cache, manifest.archiveChecksum + '.' + process.pid + '.tar.gz');
    try {
        if (!await matches(archive, manifest.archiveChecksum)) {
            const partial = archive + '.' + process.pid + '.partial';
            const output = await fs.open(partial, 'w');
            const full = createHash('sha256');
            let bytes = 0;
            try {
                for (const [index, part] of manifest.parts.entries()) {
                    if (part.file !== `part-${String(index).padStart(3, '0')}.bin` || !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || part.bytes > 32 * 1024 * 1024 || !/^[a-f\d]{64}$/.test(part.checksum))
                        throw Error('Invalid document bundle part');
                    const b = await fs.readFile(path.join(bundleDirectory, part.file));
                    if (b.length !== part.bytes || sha(b) !== part.checksum)
                        throw Error(`Document bundle integrity failure: ${part.file}`);
                    full.update(b);
                    bytes += b.length;
                    await output.writeFile(b);
                }
                if (full.digest('hex') !== manifest.archiveChecksum || bytes !== manifest.archiveBytes)
                    throw Error('Document archive integrity failure');
                await output.close();
                await fs.rename(partial, archive);
            }
            catch (e) {
                await output.close().catch(() => { });
                await fs.rm(partial, { force: true });
                throw e;
            }
        }
        const options = { maxBuffer: 1024 * 1024, timeout: 120000 };
        const names = (await exec('tar', ['-tzf', archive], options)).stdout.trim().split('\n');
        const detail = (await exec('tar', ['-tvzf', archive], options)).stdout.trim().split('\n');
        const expected = new Set(bundled.map(a => path.basename(a.file)));
        if (names.length !== bundled.length || new Set(names).size !== bundled.length || names.some(n => !expected.has(n) || !/^[a-f\d]{20}\.[a-z\d]+$/.test(n)) || detail.length !== bundled.length || detail.some(line => !line.startsWith('-')))
            throw Error('Unsafe or unexpected document archive entries');
        const temp = await fs.mkdtemp(path.join(cache, 'extract-'));
        try {
            await exec('tar', ['--no-same-owner', '-xzf', archive, '-C', temp], options);
            for (const a of bundled)
                if (!await matches(path.join(temp, path.basename(a.file)), a.checksum))
                    throw Error(`Document checksum failure: ${a.file}`);
            for (const a of missing) {
                const dest = path.join(target, path.basename(a.file)), partial = dest + '.' + process.pid + '.partial';
                try {
                    await fs.copyFile(path.join(temp, path.basename(a.file)), partial, fs.constants.COPYFILE_FICLONE);
                    await fs.rename(partial, dest);
                }
                finally {
                    await fs.rm(partial, { force: true });
                }
            }
        }
        finally {
            await fs.rm(temp, { recursive: true, force: true });
        }
        return missing.length;
    }
    finally {
        await fs.rm(archive, { force: true });
    }
}
