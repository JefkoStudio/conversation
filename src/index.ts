/**
 * A module for navigating an UML flowchartted conversation.
 *
 * @author Daniel Jeffery
 * @type module
 */

import { readFile } from 'fs/promises';

export * from './parser.js';

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

export type Flow = {
  acc?: Accessibility;
  description?: string;
  edges: Edge[];
  title?: string;
  type: string;
  vertices: Record<string, Vertex>;
};

export type Observer = (action: string, step: Step) => void;

export type StepHook = {
  isComplete: (throwOnError?: boolean) => Promise<boolean>;
  isReady: () => Promise<boolean>;
  render: <R>(props?: Record<string, unknown>) => Promise<R>;
};

export type StepProps = Record<string, unknown> & {
  context?: Record<string, unknown>;
  conversation?: ConversationHook;
};

export type Step = {
  edges?: { from: Edge[]; to: Edge[] };
  hook: StepHook;
  id: string;
};

export type ConversationHook = Required<StepHook> & {
  back: (fromChild: boolean) => Promise<Step | undefined>;
  continue: (id?: string, fromChild?: boolean) => Promise<Step | undefined>;
  subscribe: (observer: Observer) => void;
  unsubscribe: (observer: Observer) => void;
};

export type ConversationProps = StepProps & {
  flow?: Flow;
  observers?: Observer[];
  src?: string;
  start?: string;
};

/**
 * A class for containing and navigating a single UML flowchartted
 * conversation's steps.
 *
 * @class Conversation
 * @export
 * @implements {ConversationHook}
 */
export class Conversation implements ConversationHook {
  private readonly flow: Flow;
  private gen: AsyncGenerator<Step, Step, string>;
  private observers: Observer[];
  private parent: ConversationHook;
  private step: Promise<Step | undefined>;

  breadcrumbs: Step[];

  /**
   * Creates an instance of Conversation.
   *
   * @memberof Conversation
   * @param {ConversationProps} { Conversation, flow, observers = [], start =
   *   undefined, }
   */
  constructor({
    conversation,
    flow,
    observers = [],
    start = undefined,
  }: ConversationProps) {
    if (!flow?.type?.includes('flowchart'))
      throw new Error('Only flowcharts are supported.');

    this.breadcrumbs = [];
    this.flow = flow;
    this.gen = this.genContinue();
    this.observers = observers;
    this.parent = conversation;

    this.step = this.findStart(start);
  }

  // TODO: Add id param to go back to a specific vertex in history
  /**
   * Navigate to the previous step, if applicable.
   *
   * @memberof Conversation
   * @param {boolean} [fromChild=false] Default is `false`
   * @returns {Promise<Step | undefined>}
   */
  async back(fromChild: boolean = false): Promise<Step | undefined> {
    const step = await this.step;

    if (!fromChild && step?.hook instanceof Conversation)
      return step?.hook.back();

    if (!this.breadcrumbs.length) return this.parent?.back(true);

    return this.notify('back', this.breadcrumbs.pop());
  }

  /**
   * Navigate to the next step, if the step is completed.
   *
   * @memberof Conversation
   * @param {string} [id]
   * @param {boolean} [fromChild=false] Default is `false`
   * @returns {Promise<Step | undefined>}
   */
  async continue(
    id?: string,
    fromChild: boolean = false
  ): Promise<Step | undefined> {
    const step = await this.step;

    if (!fromChild && step?.hook instanceof Conversation) {
      const _next = await step?.hook.continue(id);
      if (_next) return _next;
    }

    const next = await this.gen.next(id);

    if (
      id === undefined &&
      !next.done &&
      (await next.value?.hook?.isComplete())
    ) {
      this.notify('continue', next.value);

      return this.continue(id, fromChild);
    }

    if (next.done && this.parent) {
      return this.parent.continue(id, true);
    }

    return this.notify(next.done ? 'done' : id ?? 'continue', next.value);
  }

  /**
   * Find the starting point, if possible.
   *
   * @private
   * @memberof Conversation
   * @param {string} [start]
   * @returns
   */
  private async findStart(start?: string) {
    if (start in this.flow.vertices) {
      const step = this.notify(start, await this.get(start));
      this.gen?.next(); // Start the generator
      return step;
    }

    for (const id in this.flow.vertices) {
      const {
        props: { uri },
        type,
      } = this.flow.vertices[id];

      if (type === 'stadium' || uri === start) {
        this.step = this.get(id);
        break;
      }
    }

    let vertex: Step;
    do {
      vertex = (await this.gen?.next(vertex?.id))?.value;
    } while (await vertex?.hook?.isComplete());

    if (!vertex) throw new Error('Could not find a starting point.');

    return this.notify('start', vertex);
  }

  /**
   * Continuation generator for determining if the current step is complete and
   * what the next step would be, if any.
   *
   * @private
   * @memberof Conversation
   * @returns {AsyncGenerator<Step, Step, string>}
   */
  private async *genContinue(): AsyncGenerator<Step, Step, string> {
    let next: Step = await this.step;

    while (next) {
      const id = yield next;
      const step = await this.get(id);

      if (!(await step?.hook?.isComplete())) {
        next = step;
        continue;
      }

      next = undefined;
      this.breadcrumbs.push(step);

      if (step) {
        for (const { end } of step.edges.to) {
          const _next = await this.get(end);

          if (!(await _next?.hook.isReady())) continue;

          next = _next;
        }
      }
    }

    return next;
  }

  /**
   * Get a step from the conversation, if it exists.
   *
   * @memberof Conversation
   * @param {string} [id]
   * @returns {Promise<Step | undefined>}
   */
  async get(id?: string): Promise<Step | undefined> {
    if (!id) return this.step;

    if (!(id in this.flow.vertices)) return;

    const {
      props: { module, key, src, ...props },
      type,
    } = this.flow.vertices[id];
    let step;

    props.conversation = this;

    switch (type) {
      case 'subroutine':
        if (!src && !props.flow)
          throw new Error(`No source provided for subroutine, ${id}.`);

        props.observers = this.observers;
        step = conversation;
        break;
      default:
        // TODO: Add hook for custom import
        if (typeof module === 'string') {
          // istanbul ignore next
          step = (await import(module))?.[key ?? 'default'];
        } else if (module) {
          step = module;
        }
    }

    const hook = await step?.({ ...props });

    return {
      edges: this.flow.edges.reduce(
        (acc, cur) => {
          if (cur.end === id) {
            acc.from.push(cur);
          }

          if (cur.start === id) {
            acc.to.push(cur);
          }

          return acc;
        },
        { from: [], to: [] }
      ),
      hook,
      id,
    };
  }

  /**
   * Checks if this conversation and its steps are complete.
   *
   * @memberof Conversation
   * @param {boolean} [throwOnError=false] Default is `false`
   * @returns
   */
  async isComplete(throwOnError: boolean = false) {
    return Boolean(
      await Promise.all(
        this.breadcrumbs.map((cur) => cur.hook.isComplete(throwOnError))
      )
    );
  }

  /**
   * Checks if the current step meets pre-requisites and is ready for rendering
   * to be started.
   *
   * @memberof Conversation
   * @returns
   */
  async isReady() {
    return Boolean(await this.step);
  }

  /**
   * Notify observers of navigation updates.
   *
   * @private
   * @memberof Conversation
   * @param {string} action
   * @param {Step} step
   * @returns {Promise<Step | undefined>}
   */
  private async notify(action: string, step: Step): Promise<Step | undefined> {
    if (action !== 'start' || !this.parent)
      this.observers.forEach((observer) => observer(action, step));

    return (this.step = Promise.resolve(step));
  }

  /**
   * Render the current step.
   *
   * @memberof Conversation
   * @param {unknown} [props]
   * @returns {Promise<unknown>}
   */
  async render<R>(props?: Record<string, unknown>): Promise<R> {
    // istanbul ignore next
    const renderProps = {
      // TODO: Add related edges as specific actions
      ...props,
      back: async () => (await this.back())?.hook,
      continue: async (id?: string) => (await this.continue(id))?.hook,
    };

    if (typeof props?.renderer === 'function')
      return props.renderer(renderProps);

    return (await this.step)?.hook.render(renderProps);
  }

  /**
   * Subscribe to conversation events.
   *
   * @memberof Conversation
   * @param {Observer} observer
   */
  subscribe(observer: Observer) {
    this.observers.push(observer);
    this.parent?.subscribe(observer);
  }

  /**
   * Unsubscribe from conversation events.
   *
   * @memberof Conversation
   * @param {Observer} observer
   */
  unsubscribe(observer: Observer) {
    this.observers.splice(
      this.observers.findIndex((itm) => itm === observer),
      1
    );
    this.parent?.unsubscribe(observer);
  }
}

/**
 * Create a new conversation from a given flowchart.
 *
 * @param {ConversationProps} props
 * @returns {Promise<Conversation>}
 * @export
 */
export default async function conversation(
  props: ConversationProps
): Promise<Conversation> {
  if (props.src) {
    props.flow = JSON.parse(await readFile(props.src, 'utf8'));
  }

  return new Conversation(props);
}
