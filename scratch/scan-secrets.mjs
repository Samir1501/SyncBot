import fs from 'node:fs';
import path from 'node:path';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.gemini', 'scratch', 'data']);
const IGNORE_FILES = new Set(['package-lock.json', 'package.json']);

const SECRET_PATTERNS = [
  /client[_-]?secret\s*[:=]\s*['"][^'"]{10,}['"]/i,
  /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/i,
  /bot[_-]?token\s*[:=]\s*['"][^'"]{10,}['"]/i,
  /ghp_[a-zA-Z0-9]{30,}/,
  /steam[_-]?api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/i
];

const found = [];

function scan(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory() && !IGNORE_DIRS.has(f.name)) {
      scan(path.join(dir, f.name));
    } else if (f.isFile() && !IGNORE_FILES.has(f.name) && !f.name.endsWith('.png') && !f.name.endsWith('.jpg') && !f.name.endsWith('.ico')) {
      const p = path.join(dir, f.name);
      if (f.name === '.env') continue;
      const text = fs.readFileSync(p, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        for (const pat of SECRET_PATTERNS) {
          if (pat.test(line)) {
            found.push({ file: path.relative(process.cwd(), p), line: i + 1, content: line.trim() });
          }
        }
      });
    }
  }
}

scan(process.cwd());
console.log('ŞÜPHELİ GİZLİ ANAHTAR SAYISI:', found.length);
found.forEach(r => console.log(r.file + ':' + r.line + ' -> ' + r.content));
