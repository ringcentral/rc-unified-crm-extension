const fs = require('fs');
const path = require('path');

const projectPath = path.resolve(__dirname, '..', '..');
const sourceRoot = path.resolve(projectPath, 'src');
const outputRoot = path.resolve(projectPath, 'dist', 'src');

function copyJsonFiles(sourceDir: string) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      copyJsonFiles(sourcePath);
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name) !== '.json') {
      continue;
    }

    const relativePath = path.relative(sourceRoot, sourcePath);
    const outputPath = path.join(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(sourcePath, outputPath);
  }
}

copyJsonFiles(sourceRoot);
