import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanDirectory, buildDocument, buildBatches, summarizeScan } from './scan.js';

describe('scanDirectory', () => {
  let tempDir;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'paperize-test-'));

    // Create test files
    await writeFile(join(tempDir, 'notes.md'), '# My Notes\n\nSome ideas here.');
    await writeFile(join(tempDir, 'ideas.txt'), 'Build a better mousetrap.');
    await writeFile(join(tempDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47])); // unsupported
    await writeFile(join(tempDir, 'empty.md'), ''); // empty, should be skipped

    // Nested directory
    await mkdir(join(tempDir, 'sub'));
    await writeFile(join(tempDir, 'sub', 'deep.md'), 'Deep thoughts.');

    // Skipped directory
    await mkdir(join(tempDir, '.hidden'));
    await writeFile(join(tempDir, '.hidden', 'secret.md'), 'Should not appear.');

    await mkdir(join(tempDir, 'node_modules'));
    await writeFile(join(tempDir, 'node_modules', 'lib.md'), 'Should not appear.');
  });

  after(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('finds supported files recursively', async () => {
    const files = await scanDirectory(tempDir);
    const names = files.map((f) => f.relativePath);

    assert.ok(names.includes('notes.md'));
    assert.ok(names.includes('ideas.txt'));
    assert.ok(names.includes(join('sub', 'deep.md')));
  });

  it('skips unsupported extensions', async () => {
    const files = await scanDirectory(tempDir);
    const names = files.map((f) => f.relativePath);

    assert.ok(!names.includes('image.png'));
  });

  it('skips empty files', async () => {
    const files = await scanDirectory(tempDir);
    const names = files.map((f) => f.relativePath);

    assert.ok(!names.includes('empty.md'));
  });

  it('skips hidden and node_modules directories', async () => {
    const files = await scanDirectory(tempDir);
    const paths = files.map((f) => f.path);

    assert.ok(!paths.some((p) => p.includes('.hidden')));
    assert.ok(!paths.some((p) => p.includes('node_modules')));
  });

  it('reads file content', async () => {
    const files = await scanDirectory(tempDir);
    const notes = files.find((f) => f.name === 'notes');

    assert.ok(notes);
    assert.ok(notes.content.includes('My Notes'));
  });

  it('respects maxFiles option', async () => {
    const files = await scanDirectory(tempDir, { maxFiles: 1 });
    assert.equal(files.length, 1);
  });
});

describe('buildDocument', () => {
  it('combines files with delimiters', () => {
    const files = [
      { relativePath: 'a.md', content: 'Alpha' },
      { relativePath: 'b.md', content: 'Beta' },
    ];
    const { document, included, truncated } = buildDocument(files);

    assert.ok(document.includes('--- a.md ---'));
    assert.ok(document.includes('Alpha'));
    assert.ok(document.includes('--- b.md ---'));
    assert.ok(document.includes('Beta'));
    assert.equal(included, 2);
    assert.equal(truncated, false);
  });

  it('truncates when exceeding maxChars', () => {
    const files = [
      { relativePath: 'a.md', content: 'A'.repeat(100) },
      { relativePath: 'b.md', content: 'B'.repeat(100) },
    ];
    const { included, truncated } = buildDocument(files, 150);

    assert.equal(included, 1);
    assert.equal(truncated, true);
  });
});

describe('buildBatches', () => {
  it('creates batches within character budget', () => {
    const files = [
      { relativePath: 'a.md', content: 'A'.repeat(50) },
      { relativePath: 'b.md', content: 'B'.repeat(50) },
      { relativePath: 'c.md', content: 'C'.repeat(50) },
    ];
    const batches = buildBatches(files, 150);

    // Each file section is ~65 chars (delimiter + content + newlines)
    // So 2 files per batch at 150 char budget
    assert.ok(batches.length >= 2);
    const totalFiles = batches.reduce((sum, b) => sum + b.fileCount, 0);
    assert.equal(totalFiles, 3);
  });

  it('puts oversized files in their own batch', () => {
    const files = [
      { relativePath: 'small.md', content: 'tiny' },
      { relativePath: 'big.md', content: 'X'.repeat(200) },
      { relativePath: 'small2.md', content: 'also tiny' },
    ];
    const batches = buildBatches(files, 100);

    // big.md should get its own batch (truncated)
    const bigBatch = batches.find((b) => b.files.some((f) => f.relativePath === 'big.md'));
    assert.ok(bigBatch);
    assert.equal(bigBatch.fileCount, 1);
    assert.ok(bigBatch.document.length <= 100);
  });

  it('returns single batch for small inputs', () => {
    const files = [
      { relativePath: 'a.md', content: 'Alpha' },
      { relativePath: 'b.md', content: 'Beta' },
    ];
    const batches = buildBatches(files, 100_000);

    assert.equal(batches.length, 1);
    assert.equal(batches[0].fileCount, 2);
  });
});

describe('summarizeScan', () => {
  it('counts files by extension and chars', () => {
    const files = [
      { ext: '.md', size: 100, content: 'hello' },
      { ext: '.md', size: 200, content: 'world!' },
      { ext: '.txt', size: 50, content: 'hi' },
    ];
    const summary = summarizeScan(files);

    assert.equal(summary.totalFiles, 3);
    assert.equal(summary.totalSize, 350);
    assert.equal(summary.totalChars, 13);
    assert.equal(summary.byExtension['.md'], 2);
    assert.equal(summary.byExtension['.txt'], 1);
  });
});
