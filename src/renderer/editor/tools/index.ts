import type { ToolId } from '../state/editor-state';
import { arrowTool } from './arrow';
import { atomTool } from './atom';
import { bondTool } from './bond';
import { chainTool } from './chain';
import { curvedTool } from './curved';
import { eraseTool } from './erase';
import { plusTool } from './plus';
import { ringTool } from './ring';
import { selectTool } from './select';
import type { Tool } from './tool';

/** The tool that runs for `id`, or null for tools that arrive with later tasks. */
export function toolFor(id: ToolId): Tool | null {
  if (id === 'select') return selectTool;
  if (id === 'erase') return eraseTool;
  if (id === 'bond') return bondTool;
  if (id === 'chain') return chainTool;
  if (id === 'ring') return ringTool;
  if (id === 'atom') return atomTool;
  if (id === 'arrow') return arrowTool;
  if (id === 'plus') return plusTool;
  if (id === 'curved') return curvedTool;
  return null;
}
