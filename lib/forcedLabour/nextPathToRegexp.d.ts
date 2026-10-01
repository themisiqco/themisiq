// The two functions lib/forcedLabour/redirects.test.ts uses from Next's bundled path-to-regexp, which ships no
// types. The same matcher Next uses for next.config.ts redirects.
declare module 'next/dist/compiled/path-to-regexp' {
  export function match(path: string): (url: string) => false | { params: Record<string, unknown> }
  export function compile(path: string): (params: Record<string, unknown>) => string
}
