import { describe, expect, it } from '@jest/globals';
import { tmpdir } from 'os';
import { unlink, writeFile } from 'fs/promises';

import { fromFile, parse } from './parser.js';

describe('Parser', () => {
  it('should restrict to flowcharts', async () => {
    expect(
      parse(`
sequenceDiagram
  start->>finish: test
    `)
    ).rejects.toThrow('Only flowchart diagrams are supported.');
  });

  it('should parse a basic flowchart', async () => {
    const result = await parse(`
flowchart
  start([Start]) --> finish
    `);

    expect(result).toHaveProperty('starts', ['start']);
    expect(result).toHaveProperty('type', 'conversation');
    expect(result).toHaveProperty(
      'steps',
      expect.objectContaining({
        finish: expect.objectContaining({
          edges: {
            from: [expect.objectContaining({ end: 'finish', start: 'start' })],
            to: [],
          },
          id: 'finish',
        }),
        start: expect.objectContaining({
          edges: {
            from: [],
            to: [expect.objectContaining({ end: 'finish', start: 'start' })],
          },
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

    ['starts', 'steps', 'type'].map((key) =>
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
        steps: expect.objectContaining({
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
