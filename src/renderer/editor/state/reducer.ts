import { OPTIONS, isVariantTool } from './catalog';
import type { EditorState, ToolId, VariantTool } from './editor-state';

export type EditorAction =
  | { type: 'select-tool'; tool: ToolId }
  | { type: 'select-variant'; tool: VariantTool; variant: string };

/** Pure reducer; returns the same object when nothing changes. */
export function reduce(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select-tool':
      return action.tool === state.tool ? state : { ...state, tool: action.tool };
    case 'select-variant': {
      if (!isVariantTool(action.tool)) return state;
      if (!OPTIONS[action.tool].some((o) => o.id === action.variant)) return state;
      if (state.variants[action.tool] === action.variant) return state;
      return { ...state, variants: { ...state.variants, [action.tool]: action.variant } };
    }
  }
}
