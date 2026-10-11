export function hello(name: string): string {
  return `Hello, ${name}!`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(hello("world"));
}
