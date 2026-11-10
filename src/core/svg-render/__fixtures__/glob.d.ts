// Vite's `import.meta.glob`, as far as the golden tests use it (core compiles without vite/client).
interface ImportMeta {
  glob(
    pattern: string,
    options: { readonly query: '?raw'; readonly import: 'default'; readonly eager: true },
  ): Record<string, string>;
}
