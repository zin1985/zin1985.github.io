from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
import json
root=Path(__file__).resolve().parent
manifest=json.loads((root/'extension/manifest.json').read_text(encoding='utf-8'))
assert manifest['version']=='0.5.1'
assert 'https://streaming.assemblyai.com/*' in manifest['host_permissions']
required=['extension/manifest.json','extension/offscreen.js','extension/background.js','extension/options.js','extension/assembly-streaming.js','extension/vendor/whisper.bundle.js','extension/vendor/wasm/ort-wasm-simd-threaded.wasm','extension/vendor/wasm/ort-wasm-simd-threaded.jsep.wasm']
for name in required:
 f=root/name
 assert f.is_file() and f.stat().st_size>0,name
out=root/'LiveJapaneseCaptions-Edge-Portable-v0.5.1.zip'
files=sorted(p for p in (root/'extension').rglob('*') if p.is_file())
extras=['README.md','README_JA.txt','THIRD_PARTY_NOTICES.md','MIGRATION_V042.md']
with ZipFile(out,'w',ZIP_DEFLATED,compresslevel=6) as archive:
 for f in files:
  archive.write(f,f.relative_to(root).as_posix())
 for n in extras: archive.write(root/n,n)
with ZipFile(out,'r') as archive:
 assert archive.testzip() is None
 assert all(name in archive.namelist() for name in required)
 assert 'assemblyApiKey' not in archive.namelist()
digest=sha256(out.read_bytes()).hexdigest().upper()
(root/'SHA256SUMS.txt').write_text(digest+'  '+out.name+'\n',encoding='ascii')
print(json.dumps({'size':out.stat().st_size,'sha256':digest,'entries':len(files)+len(extras),'version':'0.5.1','archive':'PASS'},ensure_ascii=False))
