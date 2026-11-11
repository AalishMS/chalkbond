/** W3 / F4: the session name as the title and the save prompt show it (`.chalk` hidden). */
export function displayName(name: string): string {
  return name.replace(/\.chalk$/i, '');
}

/** W3: only the drawing extension is hidden; pictures retain theirs. */
export function windowTitle(name: string, dirty: boolean): string {
  return `${dirty ? '*' : ''}${displayName(name)} - Chalkbond`;
}
