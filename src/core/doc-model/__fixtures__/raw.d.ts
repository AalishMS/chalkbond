// Vite/Vitest `?raw` imports: file contents as a string (tests load .chalk fixtures this way).
declare module '*?raw' {
  const text: string;
  export { text as default };
}
