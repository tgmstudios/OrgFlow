export function hello(name: string): string {
  return `Hello, ${name}!`;
}

if (import.meta.main) {
  console.log(hello("world"));
}
