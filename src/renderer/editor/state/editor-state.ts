/** Tool ids in rail order (SPEC-editor.md "Tool rail"). */
export const TOOL_IDS = [
  'select',
  'erase',
  'bond',
  'chain',
  'ring',
  'atom',
  'arrow',
  'plus',
  'curved',
  'text',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** Tools whose options bar chooses a variant (bond order, ring size, element, arrow, head). */
export type VariantTool = 'bond' | 'ring' | 'atom' | 'arrow' | 'curved';

export interface EditorState {
  tool: ToolId;
  /** Chosen option id per variant tool (ids from catalog `OPTIONS`). */
  variants: Readonly<Record<VariantTool, string>>;
}

/** Decision 5: Bond (single) is the active tool at launch. */
export function initialState(): EditorState {
  return {
    tool: 'bond',
    variants: { bond: 'single', ring: 'benzene', atom: 'C', arrow: 'forward', curved: 'full' },
  };
}
