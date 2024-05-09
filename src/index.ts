/**
 * A module for navigating an UML flowchartted conversation.
 *
 * @author Daniel Jeffery
 * @type module
 */

import type { Flow } from 'src/parser.js';

export * from './parser.js';

export type Observer = (action: string, step: Step) => void;

export type StepHook<T = unknown> = T & {
  isComplete: (throwOnError?: boolean) => Promise<boolean>;
  isReady: () => Promise<boolean>;
  render: <R>(props?: Record<string, unknown>) => Promise<R>;
};

export type StepProps = Record<string, unknown> & {
  context?: Record<string, unknown>;
  conversation?: ConversationHook;
};

export type Step = {
  edges?: Flow['steps'][0]['edges'];
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
    if (flow?.type !== 'conversation')
      throw new Error('Only conversation flows are supported.');

    this.breadcrumbs = [];
    this.flow = flow;
    this.gen = this.genContinue();
    this.observers = observers;
    this.parent = conversation;

    this.step = this.findStart(start);
  }

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

    if (step?.id === next?.value?.id) return next.value;

    if (next.done && this.parent) {
      return this.parent.continue(id, true);
    }

    return this.notify(
      (next.done && !this.parent ? 'done' : id) ?? 'continue',
      next.value
    );
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
    let step: Step;

    if (start) {
      step = await this.get(start);
    }

    let index = 0;
    while (step || this.flow.starts[index]) {
      if (await step?.hook?.isReady?.()) break;

      step = await this.get(this.flow.starts[index++] ?? ' ');
    }

    if (!step) throw new Error('Could not find a starting point.');

    this.gen?.next(); // Start the generator
    return this.notify(step?.id === start ? start : 'start', step);
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
    let id;
    let next: Step = await this.step;

    outer: while (next) {
      if (await next?.hook?.isComplete?.()) {
        this.breadcrumbs.push(next);

        if (id) {
          next = await this.get(id);
          continue;
        } else {
          for (const { end } of next.edges.to) {
            const _next = await this.get(end);

            if (!(await _next?.hook?.isReady?.())) continue;

            next = _next;
            continue outer;
          }

          next = undefined;
          continue;
        }
      }

      id = yield next;
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

    if (!(id in this.flow.steps)) return;

    const {
      edges,
      props: { module, key, ...props },
      type,
    } = this.flow.steps[id];
    let step;

    props.conversation = this;

    switch (type) {
      case 'subroutine':
        if (!props.flow)
          throw new Error(`No source provided for subroutine, ${id}.`);

        props.observers = this.observers;
        step = conversation;
        break;
      default:
        if (typeof module === 'string') {
          // istanbul ignore next
          step = (await import(module))?.[key ?? 'default'];
        } else if (module) {
          step = module;
        }
    }

    const hook = await step?.({ ...props });

    return { edges, hook, id };
  }

  /**
   * Checks if this conversation and its steps are complete.
   *
   * @memberof Conversation
   * @param {boolean} [throwOnError=false] Default is `false`
   * @returns
   */
  async isComplete(throwOnError: boolean = false) {
    return !(
      await Promise.all(
        [await this.get(), ...this.breadcrumbs].map(
          (cur) => cur?.hook?.isComplete?.(throwOnError) ?? true
        )
      )
    ).some((pass) => !pass);
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
    const step = await this.step;

    // istanbul ignore next
    const renderProps = {
      ...props,
      actions: step.edges?.to
        ?.filter?.((edge) => edge.type === 'arrow_point')
        ?.map?.((edge) => ({
          id: edge.end,
          label: edge.text,
          type: edge.stroke === 'normal' ? 'primary' : 'secondary',
        })),
      back: async () => (await this.back())?.hook,
      continue: async (id?: string) => (await this.continue(id))?.hook,
    };

    if (typeof props?.renderer === 'function')
      return props.renderer(renderProps);

    return step?.hook?.render?.(renderProps);
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
  return new Conversation(props);
}
