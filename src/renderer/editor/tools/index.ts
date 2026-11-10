import type { ToolId } from '../state/editor-state';
import { eraseTool } from './erase';
import { selectTool } from './select';
import type { Tool } from './tool';

/** The tool that runs for `id`, or null for tools that arrive with later tasks. */
export function toolFor(id: ToolId): Tool | null {
  if (id === 'select') return selectTool;
  if (id === 'erase') return eraseTool;
  return null;
}
