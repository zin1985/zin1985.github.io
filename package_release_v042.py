from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import hashlib,json
root=Path(r"C:\Users\zin\Documents\AI-Work\LiveJapaneseCaptions-Edge-v0.4.0")
out=root/"LiveJapaneseCaptions-Edge-Portable-v0.4.2.zip"
manifest=json.loads((root/"extension/manifest.json").read_text(encoding="utf-8"))
assert manifest["version"]=="0.4.2",manifest["version"]
required=[
 "extension/manifest.json",
 "extension/options.js",
 "extension/offscreen.js",
 "extension/vendor/whisper.bundle.js",
 "extension/vendor/wasm/ort-wasm-simd-threaded.wasm",
 "extension/vendor/wasm/ort-wasm-simd-threaded.jsep.wasm"
]
for rel in required:
 f=root/rel
 assert f.is_file() and f.stat().st_size>0,rel
files=sorted([f for f in (root/"extension").rglob("*") if f.is_file()])
extras=["README_JA.txt","THIRD_PARTY_NOTICES.md","MIGRATION_V042.md","INSTALL_AND_TROUBLESHOOT_JA.md"]
with ZipFile(out,'w',ZIP_DEFLATED,compresslevel=6) as z:
 for f in files: z.write(f,f.relative_to(root).as_posix())
 for rel in extras: z.write(root/rel,rel)
with ZipFile(out,'r') as z:
 bad=z.testzip()
 assert bad is None,bad
 names=set(z.namelist())
 assert all(rel in names for rel in required)
 assert len(names)==len(files)+len(extras)
digest=hashlib.sha256(out.read_bytes()).hexdigest().upper()
report={"zip":str(out),"bytes":out.stat().st_size,"entries":len(files)+len(extras),"sha256":digest,"runtime_size":(root/"extension/vendor/whisper.bundle.js").stat().st_size,"manifest_version":manifest["version"],"archive_test":"PASS"}
(root/"RELEASE_V042.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(report,ensure_ascii=False))
