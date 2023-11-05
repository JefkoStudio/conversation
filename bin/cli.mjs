#!/usr/bin/env node

import { program } from 'commander';
import { writeFile } from 'fs/promises';
import { format, parse as pathParse, resolve } from 'path';

import { fromFile } from '../dist/parser.js';
import { version } from '../package.json' assert { type: 'json' };

program
  .name('uml2json')
  .version(version, '-v, --version')
  .arguments('<source...> [destination]')
  .action(async (files, dir) => {
    for (const src in files) {
      const file = resolve(src);
      const dest = format({
        ...pathParse(file),
        base: '',
        ext: '.json',
        ...(dir && { dir: resolve(dir) }),
      });
      const output = await fromFile(src, dir);

      await writeFile(dest, JSON.stringify(output), 'utf8');
    }
  })
  .parse(process.argv);
