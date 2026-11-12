import { Fragment } from 'react';
import { railFace, TOOLS } from '../state/catalog';
import type { EditorState } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import { toolTip } from '../state/tips';
import { Icon } from './Icon';
import { pressKeepsFocus } from './press';
import { tipProps } from './Tooltip';
import { useRoving } from './use-roving';

interface ToolRailProps {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
}

/** The tool rail: ten buttons in three groups. A mouse press does not take focus (K5). */
export function ToolRail({ state, dispatch }: ToolRailProps): React.JSX.Element {
  const roving = useRoving('vertical', state.tool, state.tool);
  return (
    <nav
      className="rail"
      data-testid="rail"
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Tools"
      onMouseDown={pressKeepsFocus}
      onKeyDown={roving.onKeyDown}
    >
      {TOOLS.map((tool, i) => {
        const face = railFace(state, tool);
        const newGroup = i > 0 && TOOLS[i - 1]?.group !== tool.group;
        return (
          <Fragment key={tool.id}>
            {newGroup && <div className="rail-sep" role="separator" />}
            <button
              type="button"
              className="btn btn-rail"
              data-testid={`tool-${tool.id}`}
              aria-label={tool.label}
              aria-pressed={state.tool === tool.id}
              aria-keyshortcuts={`${tool.digit} ${tool.key === '+' ? 'Plus' : tool.key}`}
              {...roving.item(tool.id)}
              {...tipProps(toolTip(tool), 'right')}
              onClick={() => {
                dispatch({ type: 'select-tool', tool: tool.id });
              }}
            >
              <span className="rail-key" aria-hidden="true">
                {tool.digit}
              </span>
              {face.glyph !== undefined ? (
                <span className="rail-glyph">{face.glyph}</span>
              ) : (
                <Icon name={face.icon ?? tool.icon} size={24} />
              )}
              <span className="rail-caption" aria-hidden="true">
                {tool.caption}
              </span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
