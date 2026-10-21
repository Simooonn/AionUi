import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const windows = () =>
  JSON.parse(
    execFileSync(
      'osascript',
      [
        '-l',
        'JavaScript',
        '-e',
        'ObjC.import("Cocoa"); ObjC.import("CoreGraphics"); JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1,0))).filter(x=>x.kCGWindowLayer===0).map(x=>({owner:x.kCGWindowOwnerName,pid:x.kCGWindowOwnerPID})));',
      ],
      { encoding: 'utf8' }
    )
  );
const cwdPids = () => {
  const out = execFileSync('lsof', ['-a', '-d', 'cwd', '-Fpn'], { encoding: 'utf8' });
  let pid;
  const ids = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    if (line.startsWith('n') && line.endsWith('/aionui/live-verify')) ids.push(pid);
  }
  return ids;
};
const ancestors = (pid) => {
  const result = [];
  for (let i = 0; pid > 1 && i < 9; i++) {
    const row = execFileSync('ps', ['-o', 'pid=,ppid=,comm=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    result.push(row);
    pid = Number(row.split(/\s+/)[1]);
  }
  return result;
};
import { createHash } from 'node:crypto';
const dir = decodeURIComponent(new URL('.', import.meta.url).pathname);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes('5173'));
// Pass a trusted local scenario module exporting default async (context) => {}.
try {
  if (!process.argv[2]) throw new Error('Usage: node live-driver.mjs <scenario.mjs>');
  const scenario = await import(pathToFileURL(resolve(process.argv[2])).href);
  await scenario.default({ browser, page, fs, windows, cwdPids, ancestors, createHash, dir });
} finally {
  await browser.close();
}
