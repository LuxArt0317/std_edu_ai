import fs from 'node:fs/promises';
import path from 'node:path';
import { documents, matches, restoreDocuments } from './lib/school-document-bundle.mjs';
const root = path.resolve('public/school-assets'), cache = path.resolve('node_modules/.cache/stu-school-assets');
const docs = await documents();
await fs.mkdir(root, { recursive: true });
const missing = [];
let verified = 0, restored = 0;
for (const a of docs) {
    if (await matches(path.join(root, path.basename(a.file)), a.checksum))
        verified++;
    else
        missing.push(a);
}
try {
    if (missing.length) {
        if (process.argv.includes('--check') || process.env.STU_MIRROR_OFFLINE === '1')
            throw Error(`${missing.length} verified local documents missing`);
        restored = await restoreDocuments(docs, missing, root, cache);
    }
    console.log(JSON.stringify({ verified, restored, total: docs.length, networkDownloads: 0, failures: [] }));
}
catch (e) {
    console.error(JSON.stringify({ verified, restored, total: docs.length, networkDownloads: 0, error: e.message }));
    process.exitCode = 1;
}
