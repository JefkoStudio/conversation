/**
 * A module for transcoding UML to JSON
 *
 * @author Daniel Jeffery
 * @type module
 */

import type { Flow } from './index.js';

import { readFile } from 'fs/promises';
import mermaid from 'mermaid';
import { format, parse as pathParse, resolve } from 'path';

mermaid.initialize({
  startOnLoad: false,
});

/**
 * Create JSON of a UML flowchart from a file.
 *
 * @param {string} src
 * @param {string} [dir]
 * @returns
 * @export
 */
export async function fromFile(src: string, dir?: string) {
  const file = resolve(src);
  const uml = await readFile(file, 'utf8');
  const output = await parse(uml);

  for (const index in output.vertices) {
    const vertex = output.vertices[index];

    if (vertex.type !== 'subroutine') continue;

    if (!vertex.link) {
      console.warn('No source found for subroutine.', vertex);
      continue;
    }

    vertex.props = {
      ...vertex.props,
      src: format({
        ...pathParse(vertex.link),
        base: '',
        ext: '.json',
        ...(dir && { dir }),
      }),
    };
  }

  return output;
}

/**
 * Parse a given UML string, and return the data as JSON.
 *
 * @param {string} uml
 * @returns {Promise<Flow>}
 * @export
 */
export async function parse(uml: string): Promise<Flow> {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(uml);
  const db = (diagram.getParser() as any).yy; // eslint-disable-line @typescript-eslint/no-explicit-any

  return {
    acc: {
      description: db.getAccDescription(),
      title: db.getAccTitle,
    },
    edges: db.getEdges(),
    title: db.getDiagramTitle(),
    type: diagram.type,
    vertices: db.getVertices(),
  };
}
