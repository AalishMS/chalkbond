import { Icon } from './Icon';

/** The compound-name field. Static for now: typing, suggestions and insert come later (E13). */
export function NameField(): React.JSX.Element {
  return (
    <label className="namefield" data-testid="namefield">
      <Icon name="search" size={20} />
      <input type="text" aria-label="Compound name" placeholder="Type a compound name…" />
    </label>
  );
}
