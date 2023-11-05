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
