import { describe, expect, it } from '@jest/globals';
import { tmpdir } from 'os';
import { unlink, writeFile } from 'fs/promises';

import { fromFile, parse } from './parser.js';

describe('Parser', () => {
  it('should parse a basic flowchart', async () => {
    const result = await parse(`
flowchart
  start --> finish
    `);

    expect(result).toHaveProperty('edges', [
      expect.objectContaining({
        end: 'finish',
        start: 'start',
      }),
    ]);
    expect(result).toHaveProperty('type', expect.stringContaining('flowchart'));
    expect(result).toHaveProperty(
      'vertices',
      expect.objectContaining({
        finish: expect.objectContaining({
          id: 'finish',
        }),
        start: expect.objectContaining({
          id: 'start',
        }),
      })
    );
  });

  it('should parse an UML file', async () => {
    const path = `${tmpdir()}/test.uml`;
    const uml = `
flowchart
  start([Start]) --> mid[[Mid]]
  mid --> sub[[Subroutine]]
  sub --> END
  click mid './something'
`;

    await writeFile(path, uml, 'utf8');

    const output = await fromFile(path);

    ['edges', 'type', 'vertices'].map((key) =>
      expect(output).toHaveProperty(key)
    );

    await unlink(path);
  });

  it('should parse an UML file, but change the destination directory', async () => {
    const dir = `${tmpdir()}/testing`;
    const path = `${tmpdir()}/test-dir.uml`;
    const uml = `
flowchart
  start([Start]) --> mid
  mid --> sub[[Subroutine]]
  sub --> END
  click sub "./something"
`;

    await writeFile(path, uml, 'utf8');

    const output = await fromFile(path, dir);

    expect(output).toEqual(
      expect.objectContaining({
        vertices: expect.objectContaining({
          sub: expect.objectContaining({
            props: expect.objectContaining({
              src: expect.stringContaining(dir),
            }),
          }),
        }),
      })
    );
  });
});
