/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ConversationProps, Observer } from './index.d.js';

import { describe, expect, jest, it } from '@jest/globals';

jest.unstable_mockModule('fs/promises', () => ({
  readFile: jest.fn(),
}));

const { readFile } = await import('fs/promises');
const { default: conversation } = await import('./index.js');

const createEdge = (obj?: any) => ({
  labelType: 'text',
  length: 1,
  stroke: 'normal',
  text: 'continue',
  type: 'arrow_point',
  ...obj,
});

const createGraph = (obj?: any) => ({
  edges: [],
  type: 'flowchart',
  vertices: {},
  ...obj,
});

const createVertex = (obj?: any): ConversationProps['flow'] => ({
  classes: [],
  domId: obj?.id,
  labelType: 'text',
  styles: [],
  text: obj?.id,
  ...obj,
  props: {
    ...obj?.props,
  },
});

describe('Conversation', () => {
  const listener = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fail to load if not provided with a flowchart.', async () => {
    const graph = createGraph({
      type: 'barchart',
    });

    expect(conversation({ flow: graph })).rejects.toThrow(
      'Only flowcharts are supported.'
    );
  });

  it('should fail if no starting point can be found', async () => {
    const graph = createGraph();
    const convo = await conversation({ flow: graph });

    expect(convo.isReady()).rejects.toThrow('Could not find a starting point.');
  });

  it('should try and load a module when given a string', async () => {
    const graph = createGraph({
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: './test',
          },
          type: 'stadium',
        }),
      },
    });
    const convo = await conversation({ flow: graph });

    expect(convo.isReady()).rejects.toThrow(
      `Cannot find module '${graph.vertices.start.props.module}' from 'src/index.ts'`
    );
  });

  it("should return undefined when requesting a step that doesn't exist", async () => {
    const graph = createGraph({
      vertices: {
        start: createVertex({ id: 'start', isComplete: jest.fn() }),
      },
    });
    const convo = await conversation({ flow: graph });

    expect(convo.get('foo')).resolves.toBeUndefined();
  });

  it.each([
    ['w/o a custom renderer', undefined],
    ['w/ a custom renderer', jest.fn()],
  ])(
    'should render the current step %s',
    async (_: string, renderer?: Observer) => {
      const mockRender = jest.fn();
      const mockStartMod = () =>
        jest.mocked({
          isComplete: jest
            .fn<() => Promise<boolean>>()
            .mockResolvedValue(false),
          isReady: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
          render: mockRender,
        });
      const graph = createGraph({
        vertices: {
          start: createVertex({
            id: 'start',
            props: {
              module: mockStartMod,
            },
          }),
        },
      });

      const convo = await conversation({ flow: graph });
      await convo.isReady();
      await convo.render({ renderer });

      if (!renderer) {
        expect(mockRender).toHaveBeenCalled();
      } else {
        expect(renderer).toHaveBeenCalled();
        expect(mockRender).not.toHaveBeenCalled();
      }
    }
  );

  it('should load the first step', async () => {
    const mockTestMod = jest.fn().mockReturnValueOnce({
      id: 'start',
      isComplete: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    });

    const graph = createGraph({
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: mockTestMod,
          },
          text: 'start',
        }),
      },
    });

    const convo = await conversation({ flow: graph });
    convo.subscribe(listener);
    await convo.isReady();

    ['back', 'breadcrumbs', 'continue', 'isComplete', 'isReady', 'render'].map(
      (key) => expect(convo).toHaveProperty(key)
    );
    expect(listener).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        id: 'start',
      })
    );
  });

  it('should load additional props for a given step', async () => {
    const mockTestMod = jest.fn().mockReturnValueOnce({
      isComplete: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    });

    const graph = createGraph({
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: mockTestMod,
            testProp: true,
          },
          text: 'start',
        }),
      },
    });

    const convo = await conversation({ flow: graph });
    await convo.isReady();

    expect(mockTestMod).toHaveBeenCalledWith(
      expect.objectContaining({
        testProp: true,
      })
    );
  });

  it.each([
    ['stay on the current', 'failed', false],
    ['move to the next', 'successful', true],
  ])(
    'should %s step on %s completion',
    async (...[, , isComplete]: [string, string, boolean]) => {
      const mockTestMod = jest.fn().mockReturnValueOnce({
        id: 'start',
        isComplete: jest
          .fn<() => Promise<boolean>>()
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(isComplete),
      });

      const mockNextMod = jest.fn().mockReturnValueOnce({
        id: 'next',
        isComplete: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
        isReady: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      });

      const graph = createGraph({
        edges: [
          createEdge({
            end: 'next',
            start: 'start',
          }),
        ],
        vertices: {
          start: createVertex({
            id: 'start',
            props: {
              module: mockTestMod,
            },
            text: 'start',
          }),
          next: createVertex({
            id: 'next',
            props: {
              module: mockNextMod,
            },
            text: 'Next',
          }),
        },
      });

      const convo = await conversation({ flow: graph });
      convo.subscribe(listener);
      await convo.isReady();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenNthCalledWith(
        1,
        'start',
        expect.objectContaining({
          id: 'start',
        })
      );

      await convo.continue();

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(
        2,
        'continue',
        expect.objectContaining({
          id: isComplete ? 'next' : 'start',
        })
      );
    }
  );

  it('should start the conversation on a given step', async () => {
    const mockTestMod = jest.fn().mockReturnValueOnce({
      id: 'next',
      isComplete: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    });

    const graph = createGraph({
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: mockTestMod,
          },
          text: 'start',
        }),
        other: createVertex({
          id: 'next',
          props: {
            module: jest.fn(),
          },
          text: 'next',
        }),
      },
    });

    const convo = await conversation({ flow: graph, start: 'other' });
    convo.subscribe(listener);
    await convo.isReady();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      'other',
      expect.objectContaining({
        id: 'other',
      })
    );
  });

  it('should skip steps that are not ready', async () => {
    const graph = createGraph({
      edges: [
        createEdge({
          end: 'skip',
          start: 'start',
        }),
        createEdge({
          end: 'next',
          start: 'start',
        }),
      ],
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: async () =>
              jest.mocked({
                isComplete: jest
                  .fn<() => Promise<boolean>>()
                  .mockResolvedValueOnce(false)
                  .mockResolvedValue(true),
                isReady: () => Promise.resolve(true),
              }),
          },
        }),
        next: createVertex({
          id: 'next',
          props: {
            module: async () =>
              jest.mocked({
                isComplete: () => Promise.resolve(false),
                isReady: () => Promise.resolve(true),
              }),
          },
        }),
        skip: createVertex({
          id: 'skip',
          props: {
            module: async () =>
              jest.mocked({
                isComplete: () => Promise.resolve(false),
                isReady: () => Promise.resolve(false),
              }),
          },
        }),
      },
    });
    const convo = await conversation({ flow: graph });
    await convo.isReady();

    expect(convo.continue()).resolves.toEqual(
      expect.objectContaining({
        id: 'next',
      })
    );
  });

  it('should notify with "done" for a finished conversation', async () => {
    const mockTestMod = jest.fn().mockReturnValueOnce({
      id: 'start',
      isComplete: jest
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true),
    });

    const graph = createGraph({
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: mockTestMod,
            testProp: true,
          },
          text: 'start',
        }),
      },
    });

    const convo = await conversation({ flow: graph });
    convo.subscribe(listener);
    await convo.isReady();
    await convo.continue();

    expect(listener).toHaveBeenLastCalledWith('done', undefined);
  });

  it('should check the entire history for completion', async () => {
    const crumbs = [
      jest
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true),
      jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    ];
    const graph = createGraph({
      edges: [
        createEdge({
          end: 'next',
          start: 'start',
        }),
        createEdge({
          end: 'done',
          start: 'next',
        }),
      ],
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: () =>
              jest.mocked({
                isComplete: crumbs[0],
              }),
          },
          type: 'stadium',
        }),
        next: createVertex({
          id: 'next',
          props: {
            module: () =>
              jest.mocked({
                isComplete: crumbs[1],
                isReady: () => Promise.resolve(true),
              }),
          },
        }),
        done: createVertex({
          id: 'done',
          props: {
            module: () =>
              jest.mocked({
                isComplete: () => Promise.resolve(true),
                isReady: () => Promise.resolve(true),
              }),
          },
        }),
      },
    });
    const convo = await conversation({ flow: graph });
    await convo.isReady();
    await convo.continue();

    expect(convo.isComplete()).resolves.toBe(true);
    expect(convo.breadcrumbs.length).toBe(3);
    expect(crumbs[0]).toHaveBeenCalledTimes(3);
  });

  describe('sub-conversation', () => {
    const mockNextMod = jest.fn();
    const mockSubroutineMod = jest.mocked(conversation);
    const mockSubStepMod = jest.fn();
    const mockTestMod = jest.fn();

    const graph = createGraph({
      edges: [
        createEdge({
          end: 'subconvo',
          start: 'start',
        }),
        createEdge({
          end: 'next',
          start: 'subconvo',
        }),
      ],
      vertices: {
        start: createVertex({
          id: 'start',
          props: {
            module: mockTestMod,
          },
          text: 'start',
        }),
        subconvo: createVertex({
          id: 'subconvo',
          props: {
            flow: createGraph({
              vertices: {
                subStart: createVertex({
                  id: 'sub-start',
                  props: {
                    module: mockSubStepMod,
                  },
                  text: 'sub-start',
                }),
              },
            }),
            module: mockSubroutineMod,
          },
          text: 'Sub-Conversation',
          type: 'subroutine',
        }),
        next: createVertex({
          id: 'next',
          props: {
            module: mockNextMod,
          },
          text: 'next',
        }),
      },
    });

    it('should throw an error if neither a graph or source are provided', async () => {
      const graph = createGraph({
        vertices: {
          start: createVertex({
            id: 'start',
            props: {
              module: () =>
                jest.mocked({
                  isComplete: jest
                    .fn<() => Promise<boolean>>()
                    .mockResolvedValueOnce(false)
                    .mockResolvedValue(true),
                }),
            },
            type: 'stadium',
          }),
          next: createVertex({
            id: 'next',
            type: 'subroutine',
          }),
        },
      });
      const convo = await conversation({ flow: graph });

      expect(convo.get('next')).rejects.toThrow(
        'No source provided for subroutine, next.'
      );
    });

    it('should dynamically load external graph JSON', async () => {
      jest
        .mocked(readFile)
        .mockResolvedValue(
          '{"edges": [], "type": "flowchart", "vertices": {"start": {"id": "start", "props": {}, "type": "stadium"}}}'
        );

      try {
        await conversation({
          src: 'external',
        });
      } catch (err) {
        // Do nothing
      } finally {
        expect(readFile).toHaveBeenCalled();
      }
    });

    it('should be able to navigate back to the parent conversation', async () => {
      mockTestMod.mockReturnValueOnce({
        id: 'start',
        isComplete: jest
          .fn<() => Promise<boolean>>()
          .mockResolvedValueOnce(false)
          .mockResolvedValue(true),
        isReady: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      });
      mockSubStepMod.mockReturnValueOnce({
        id: 'sub-start',
        isComplete: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
        isReady: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      });

      const convo = await conversation({ flow: graph });
      convo.subscribe(listener);
      await convo.isReady();
      await convo.continue();
      await convo.back();

      expect(listener).toHaveBeenCalledTimes(4);

      convo.unsubscribe(listener);
      await convo.continue();

      expect(listener).toHaveBeenCalledWith(
        'back',
        expect.objectContaining({
          id: 'start',
        })
      );
      expect(listener).toHaveBeenCalledTimes(4);
    });

    it('should be able to navigate forward in the parent conversation when done', async () => {
      mockTestMod.mockReturnValue({
        id: 'start',
        test: 1,
        isComplete: jest
          .fn<() => Promise<boolean>>()
          .mockResolvedValueOnce(false)
          .mockResolvedValue(true),
        isReady: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      });
      mockSubStepMod.mockReturnValueOnce({
        id: 'sub-start',
        test: 2,
        isComplete: jest
          .fn<() => Promise<boolean>>()
          .mockResolvedValueOnce(false)
          .mockResolvedValue(true),
        isReady: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      });
      mockNextMod.mockReturnValueOnce({
        id: 'next',
        test: 3,
        isComplete: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
        isReady: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      });

      const convo = await conversation({ flow: graph });
      convo.subscribe(listener);
      await convo.isReady();
      await convo.continue();
      await convo.continue();

      expect(listener).toHaveBeenCalledWith(
        'continue',
        expect.objectContaining({
          id: 'next',
        })
      );
    });
  });
});
