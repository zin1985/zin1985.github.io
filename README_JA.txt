Live Japanese Captions Edge/Chrome v0.4.2 評価版

[導入]
1. このZIPを好きなPCで解凍する。
2. Edgeのアドレスに edge://extensions を入力する。
3. 開発者モード ON -> 「展開して読み込む」 -> extension フォルダーを選択する。
4. 拡張の詳細 -> 「拡張機能のオプション」を開く。
5. 「Whisperモデルを準備」、次に「翻訳パックを準備」を実行する。
6. 英語等のYouTube Liveを再生し、拡張アイコンを押して字幕開始。再度押すと停止する。

[重要]
・Python、Ollama、ローカルサーバー、Edge実験フラグは不要。
・モデル重みは各PCの初回起動時だけHugging Faceからダウンロードする。
・WhisperはWebGPU優先、使用不可ならWASM/CPU自動切替。
・翻訳はブラウザのTranslator APIに依存する。端末側でモデル提供がない場合は翻訳できない。
・通常の配信再生/多人数同時発話/遅延はまだ実機検証途上のため評価版。
・このZIPには拡張機能と実行ランタイムが含まれている。Node/npmは導入時に不要。
