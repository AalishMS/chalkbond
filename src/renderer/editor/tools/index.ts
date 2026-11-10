import type { ToolId } from '../state/editor-state';
import { selectTool } from './select';
import type { Tool } from './tool';

/** The tool that runs for `id`, or null for tools that arrive with later tasks. */
export function toolFor(id: ToolId): Tool | null {
  return id === 'select' ? selectTool : null;
}
