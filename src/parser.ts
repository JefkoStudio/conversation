/**
 * A module for transcoding UML to JSON
 *
 * @author Daniel Jeffery
 * @type module
 */

import { readFile } from 'fs/promises';
import mermaid from 'mermaid';
import { format, parse as pathParse, resolve } from 'path';

export type Accessibility = {
  description?: string;
  title?: string;
};

export type Edge = {
  end: string;
  labelType: string;
  length: number;
  start: string;
  stroke: string;
  text: string;
  type: string;
};

export type Flow = Omit<Flowchart, 'edges' | 'vertices'> & {
  starts: string[];
  steps: Record<string, FlowStep>;
};

export type Vertex = {
  classes: string[];
  domId: string;
  id: string;
  labelType: string;
  link?: string;
  linkTarget?: string;
  props: Record<string, unknown> & {
    module?: unknown;
    key?: string;
    src?: string;
  };
  styles: string[];
  text: string;
  type?: string;
};

export type Flowchart = {
  acc?: Accessibility;
  description?: string;
  edges?: Edge[];
  title?: string;
  type: string;
  vertices: Record<string, Vertex>;
};

export type FlowStep = Vertex & {
  edges: { from: Edge[]; to: Edge[] };
};

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

  for (const id in output.steps) {
    const vertex = output.steps[id];

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

  if (!diagram.type.includes('flowchart'))
    throw new Error('Only flowchart diagrams are supported.');

  const db = (diagram.getParser() as any).yy; // eslint-disable-line @typescript-eslint/no-explicit-any
  const edges = db.getEdges();
  const starts: string[] = [];
  const steps: Flow['steps'] = {};
  const vertices = db.getVertices();

  for (const id in vertices) {
    const step = (steps[id] = vertices[id]);

    step.edges = edges.reduce(
      (acc: FlowStep['edges'], cur: Edge) => {
        if (cur.end === id) {
          acc.from.push(cur);
        }

        if (cur.start === id) {
          acc.to.push(cur);
        }

        return acc;
      },
      { from: [], to: [] }
    );

    if (step.type !== 'stadium' || step.edges.from.length) continue;

    starts.push(id);
  }

  return {
    acc: {
      description: db.getAccDescription(),
      title: db.getAccTitle,
    },
    starts,
    steps,
    title: db.getDiagramTitle(),
    type: 'conversation',
  };
}
