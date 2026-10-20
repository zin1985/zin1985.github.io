# Live Japanese Captions 0.4.1 : Edge導入と対処

1. SOURCE ZIPではなく、約8MBのPortable ZIPを完全に解凍します。
2. Edgeの edge://extensions で古い拡張機能を削除します。
3. 開発者モードをONにして、展開して読み込むから新しいextensionフォルダーを選びます。
4. 詳細 > 拡張機能のオプション > 実行ファイルを確認を押します。
5. Whisperモデルを準備を押します。初回はモデル重みをダウンロードします。
6. 翻訳を確認が downloadable なら、翻訳パックを準備を押してください。
7. 翻訳テストが成功したらYouTube Liveを開き、拡張アイコンを押します。

エラー Failed to fetch dynamically imported module : SOURCE ZIPに実行ランタイムが含まれないこと、またはファイル欠損・拡張機能の古い読み込みを確認します。
必要なファイル extension/vendor/whisper.bundle.js
現状：実配信/字幕遅延は未検証の評価版で、同時発話分離は未実装です。
