// Test-only pipe control; not imported or accepted by production CLI.
const cli=new URL('../../src/server/cli.mjs',import.meta.url);
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(input.includes('\n')){process.stdin.pause();process.emit('SIGTERM');}});
await import(cli);
