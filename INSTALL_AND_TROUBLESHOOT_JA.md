# Live Japanese Captions 0.4.2 : Edge導入と対処

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


## Edge翻訳器が作れない場合（0.4.2から対応）

症状： Unable to create translator for the given source and target language.

原因： Translator API が downloadable と返しても、Edge のモデル作成が失敗することがあるためです。

対応：
1. 配信言語を「英語」に設定します。
2. 「ローカル英日翻訳を準備」ボタンを押します。
3. 初回は FuguMT の翻訳モデルを取得します。数百MBになることがあります。
4. 「翻訳テスト」を押して日本語が表示されることを確認します。
5. YouTube Live再生中に拡張アイコンを押して開始します。

Edge翻訳APIが失敗した場合、英語→日本語に限り自動でローカルモデルに切り替えます。
他言語のローカル翻訳は未対応です。
G83/HVでの連続推論の処理速度は実測中です。
