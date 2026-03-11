/**
 * Scan a directory for unstructured text sources.
 * Returns an array of { path, name, ext, content } objects.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, basename, relative } from 'node:path';
import { execSync } from 'node:child_process';

const SUPPORTED_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.text',
  '.markdown',
  '.org',
  '.rst',
  '.adoc',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.obsidian',
  '.trash',
  '.DS_Store',
  '__pycache__',
]);

const MAX_FILE_SIZE = 512 * 1024; // 512 KB per file

/**
 * Recursively scan a directory for text files.
 *
 * @param {string} dir - Absolute path to scan
 * @param {object} [opts]
 * @param {Set<string>} [opts.extensions] - Override supported extensions
 * @param {number} [opts.maxFileSize] - Max bytes per file (default 512KB)
 * @param {number} [opts.maxFiles] - Max files to return (default unlimited)
 * @returns {Promise<Array<{ path: string, relativePath: string, name: string, ext: string, size: number, content: string }>>}
 */
export async function scanDirectory(dir, opts = {}) {
  const extensions = opts.extensions || SUPPORTED_EXTENSIONS;
  const maxFileSize = opts.maxFileSize || MAX_FILE_SIZE;
  const maxFiles = opts.maxFiles || Infinity;
  const results = [];

  // Try Node.js readdir first; if blocked by macOS TCC, fall back to shell
  let useShellFallback = false;
  try {
    await readdir(dir);
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      useShellFallback = true;
    } else {
      throw new Error(`Cannot read directory: ${dir} (${err.code || err.message})`);
    }
  }

  if (useShellFallback) {
    // Shell commands inherit the launching terminal's TCC grant.
    // This works when run from Terminal.app / iTerm with Full Disk Access,
    // but will still fail from VS Code's integrated terminal unless VS Code has FDA.
    try {
      await walkShell(dir, extensions, maxFileSize, maxFiles, results);
    } catch {
      throw new Error(
        `Permission denied: ${dir}\n` +
          `  macOS blocks access to protected folders (iCloud, Documents, Desktop).\n` +
          `  Fix: grant Full Disk Access to your terminal app:\n` +
          `    System Settings → Privacy & Security → Full Disk Access\n` +
          `    → add Terminal.app, iTerm2, or Visual Studio Code\n` +
          `  Then restart the app and retry.`,
      );
    }
  } else {
    await walk(dir, dir, extensions, maxFileSize, maxFiles, results);
  }

  // Sort by path for deterministic output
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

async function walk(rootDir, currentDir, extensions, maxFileSize, maxFiles, results) {
  if (results.length >= maxFiles) return;

  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    if (results.length >= maxFiles) break;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      await walk(rootDir, join(currentDir, entry.name), extensions, maxFileSize, maxFiles, results);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!extensions.has(ext)) continue;

      const filePath = join(currentDir, entry.name);

      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        continue;
      }

      if (fileStat.size > maxFileSize || fileStat.size === 0) continue;

      let content;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      results.push({
        path: filePath,
        relativePath: relative(rootDir, filePath),
        name: basename(entry.name, ext),
        ext,
        size: fileStat.size,
        content,
      });
    }
  }
}

/**
 * Shell-based fallback for macOS TCC-protected directories.
 * When Node.js readdir is blocked (e.g. ~/Library/Mobile Documents/),
 * the user's shell still has access. We spawn `find` to discover files
 * and `cat` to read them, since shell commands inherit the terminal's
 * TCC permissions that Node.js direct I/O does not.
 */
async function walkShell(rootDir, extensions, maxFileSize, maxFiles, results) {
  // Build find command: exclude skip dirs, match supported extensions
  const q = (s) => `'${s.replace(/'/g, "'\\''")}'`;

  const skipArgs = [...SKIP_DIRS]
    .flatMap((d) => ['-not', '-path', q(`*/${d}/*`)])
    .concat(['-not', '-name', q('.*')]);

  const extArgs = [...extensions].flatMap((ext, i) => {
    const clause = ['-name', q(`*${ext}`)];
    return i === 0 ? clause : ['-o', ...clause];
  });

  const findCmd = [
    'find',
    q(rootDir),
    '-type', 'f',
    ...skipArgs,
    '\\(',
    ...extArgs,
    '\\)',
    '-size', `-${maxFileSize}c`,
    '-size', '+0c',
  ].join(' ');

  let output;
  try {
    output = execSync(findCmd, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10 MB for file list
      shell: true,
      timeout: 30_000,
    });
  } catch (err) {
    throw new Error(
      `Cannot scan directory: ${rootDir}\n` +
        `  Shell fallback also failed: ${err.message}\n` +
        `  Try granting Full Disk Access to your terminal in System Settings → Privacy & Security`,
    );
  }

  const filePaths = output.trim().split('\n').filter(Boolean);

  for (const filePath of filePaths) {
    if (results.length >= maxFiles) break;

    const ext = extname(filePath).toLowerCase();
    if (!extensions.has(ext)) continue;

    let content;
    try {
      // Use shell cat to read, since Node.js readFile may also be blocked
      content = execSync(`cat ${q(filePath)}`, {
        encoding: 'utf-8',
        maxBuffer: maxFileSize + 1024,
        shell: true,
        timeout: 10_000,
      });
    } catch {
      continue; // Skip unreadable files
    }

    if (!content || content.length === 0) continue;

    const size = Buffer.byteLength(content, 'utf-8');

    results.push({
      path: filePath,
      relativePath: relative(rootDir, filePath),
      name: basename(filePath, ext),
      ext,
      size,
      content,
    });
  }
}

/**
 * Build a combined document from scanned files for AI ingestion.
 * Each file is wrapped in a clear delimiter with its relative path.
 *
 * @param {Array} files - Output from scanDirectory()
 * @param {number} [maxChars] - Max total characters (default 150_000 ~37k tokens)
 * @returns {{ document: string, included: number, truncated: boolean }}
 */
export function buildDocument(files, maxChars = 150_000) {
  const parts = [];
  let totalChars = 0;
  let included = 0;

  for (const file of files) {
    const section = `--- ${file.relativePath} ---\n${file.content.trim()}\n\n`;
    if (totalChars + section.length > maxChars) {
      return { document: parts.join(''), included, truncated: true };
    }
    parts.push(section);
    totalChars += section.length;
    included++;
  }

  return { document: parts.join(''), included, truncated: false };
}

/**
 * Split files into batches that each fit within a character budget.
 * Used by the map-reduce pipeline for large sources.
 *
 * @param {Array} files - Output from scanDirectory()
 * @param {number} [batchMaxChars] - Max chars per batch (default 100_000 ~25k tokens)
 * @returns {Array<{ document: string, fileCount: number, files: Array }>}
 */
export function buildBatches(files, batchMaxChars = 100_000) {
  const batches = [];
  let currentParts = [];
  let currentChars = 0;
  let currentFiles = [];

  for (const file of files) {
    const section = `--- ${file.relativePath} ---\n${file.content.trim()}\n\n`;

    // If this single file exceeds the budget, give it its own batch (truncated)
    if (section.length > batchMaxChars) {
      if (currentParts.length > 0) {
        batches.push({
          document: currentParts.join(''),
          fileCount: currentFiles.length,
          files: currentFiles,
        });
        currentParts = [];
        currentChars = 0;
        currentFiles = [];
      }
      batches.push({
        document: section.slice(0, batchMaxChars),
        fileCount: 1,
        files: [file],
      });
      continue;
    }

    // Start new batch if adding this file would overflow
    if (currentChars + section.length > batchMaxChars && currentParts.length > 0) {
      batches.push({
        document: currentParts.join(''),
        fileCount: currentFiles.length,
        files: currentFiles,
      });
      currentParts = [];
      currentChars = 0;
      currentFiles = [];
    }

    currentParts.push(section);
    currentChars += section.length;
    currentFiles.push(file);
  }

  // Flush remaining
  if (currentParts.length > 0) {
    batches.push({
      document: currentParts.join(''),
      fileCount: currentFiles.length,
      files: currentFiles,
    });
  }

  return batches;
}

/**
 * Summarize scan results for display.
 *
 * @param {Array} files - Output from scanDirectory()
 * @returns {{ totalFiles: number, totalSize: number, totalChars: number, byExtension: Record<string, number> }}
 */
export function summarizeScan(files) {
  const byExtension = {};
  let totalSize = 0;
  let totalChars = 0;

  for (const file of files) {
    byExtension[file.ext] = (byExtension[file.ext] || 0) + 1;
    totalSize += file.size;
    totalChars += file.content.length;
  }

  return {
    totalFiles: files.length,
    totalSize,
    totalChars,
    byExtension,
  };
}
