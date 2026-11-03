import fs from 'node:fs';
import path from 'node:path';

// Archive captures may be present locally without belonging to this release.
// Publish only manifest-owned mirror files, never everything in the raw asset directory.
export function copyPublicAssets(root, output) {
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(output, { recursive: true });
  for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
    if (['school-assets', 'school-pages'].includes(entry.name)) continue;
    fs.cpSync(path.join(publicDir, entry.name), path.join(output, entry.name), { recursive: true });
  }
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'src/features/public/mirror', name), 'utf8'));
  const files = new Set([...read('assets.json'), ...read('pages.json')].map(item => item.file));
  files.add('/school-pages/search.json');
  for (const file of files) {
    if (file !== '/school-pages/search.json' && !/^\/(?:school-assets|school-pages)\/[a-f0-9]{20}\.[a-z0-9]+$/.test(file))
      throw new Error('Invalid release asset path');
    const source = path.join(publicDir, file.slice(1)), destination = path.join(output, file.slice(1));
    if (!fs.lstatSync(source).isFile()) throw new Error('Release asset must be a regular file');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    try { fs.linkSync(source, destination); }
    catch (error) {
      if (!['EXDEV','EPERM','ENOTSUP','EACCES'].includes(error.code)) throw error;
      fs.copyFileSync(source, destination);
    }
  }
  return files.size;
}
