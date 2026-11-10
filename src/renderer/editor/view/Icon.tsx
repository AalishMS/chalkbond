export type IconSize = 16 | 20 | 24;

interface IconProps {
  /** Symbol id in icons.svg, for example `bond-single`. */
  name: string;
  /** 24 in the rail, 20 in the top bar and options, 16 in the status bar. */
  size?: IconSize;
}

export function Icon({ name, size = 24 }: IconProps): React.JSX.Element {
  return (
    <svg className={`icon icon-${size}`} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
