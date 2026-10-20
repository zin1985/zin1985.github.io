import {build} from 'esbuild';
import {copyFileSync, mkdirSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ext=path.join(root,'extension');
const dir=path.join(root,'node_modules','onnxruntime-web','dist');
const files=readdirSync(dir).filter(n => /^ort-wasm.*\.(wasm|mjs)$/.test(n));
if (!files.length) throw Error('ONNX WASM runtime files not found');
mkdirSync(path.join(ext,'vendor','wasm'),{recursive:true});
for(const name of files) copyFileSync(path.join(dir,name),path.join(ext,'vendor','wasm',name));
await build({
 entryPoints:[path.join(root,'build','whisper-runtime.js')],
 bundle:true,minify:true,format:'esm',target:['chrome139'],platform:'browser',
 outfile:path.join(ext,'vendor','whisper.bundle.js'),
 logLevel:'info',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'}
});
console.log('Whisper runtime bundle and local ONNX assets ready: '+files.length);
