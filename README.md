# Student Photo Cropper

生徒の顔写真を、ローカルPC上で 3cm x 4cm のJPEGへ一括トリミングします。

既定値:

- 物理サイズ: 3cm x 4cm
- DPI: 300dpi
- ピクセル: 354 x 472px
- 容量: 100KB以下
- 顔検出: OpenCV YuNet

## ブラウザ版

Pythonを入れていないWindows端末では、`web/` の静的ページを使えます。
ChromeまたはEdgeで動作します。

```bash
web/index.html
```

ブラウザ版の特徴:

- 写真はブラウザ内で処理します。
- 写真をサーバーへアップロードしません。
- MediaPipe Face Detectorを使って顔検出します。
- 3cm x 4cm / 300dpi / 100KB版を作れます。
- 3cm x 4cm / 900dpi / 500KB版を作れます。
- CSVの1列目を使った順番リネームにも対応します。
- 出力はZIPで保存されます。

注意:

- 初回読み込み時に、MediaPipe/JSZip/顔検出モデルをCDNから取得します。
- 完全オフライン運用が必要な場合は、CDNファイルとモデルを同梱する構成に変更してください。

## セットアップ

```bash
cd /Users/yuki/student-photo-cropper
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
mkdir -p models
curl -L -o models/face_detection_yunet_2023mar.onnx \
  https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
```

## 使い方

1. `input/` に元写真を入れます。
2. 次を実行します。

```bash
cd /Users/yuki/student-photo-cropper
.venv/bin/python crop_student_photos.py
```

別のフォルダを指定する場合:

```bash
.venv/bin/python crop_student_photos.py --input /path/to/photos
```

サブフォルダもまとめて処理する場合:

```bash
.venv/bin/python crop_student_photos.py --input /path/to/photos --recursive
```

`--recursive` では出力先にもフォルダ構造を維持します。

例:

```text
photos/
  1A/1101.jpg
  1B/1201.jpg

output_ok/
  1A/1101.jpg
  1B/1201.jpg
```

出力:

- `output_ok/`: 自動トリミング成功画像
- `output_review/`: 顔検出失敗・複数顔・切り抜き範囲が危険な画像
- `preview_sheet/preview.jpg`: 成功分のBefore/After一覧
- `report.csv`: 処理結果

## 調整例

顔を少し小さめにして肩を多く入れる:

```bash
.venv/bin/python crop_student_photos.py --face-height-ratio 0.38
```

顔を大きめにする:

```bash
.venv/bin/python crop_student_photos.py --face-height-ratio 0.46
```

上の余白を増やす:

```bash
.venv/bin/python crop_student_photos.py --headroom-ratio 0.65
```

顔検出を厳しめにして、曖昧な写真を要確認へ回す:

```bash
.venv/bin/python crop_student_photos.py --score-threshold 0.9
```

### 顔まわりのパラメーター

通常は変更不要です。Web版では詳細設定に入れています。

| 項目 | Python引数 | 既定値 | 変えるとどうなるか |
| --- | --- | ---: | --- |
| 顔の大きさ | `--face-height-ratio` | `0.42` | 大きくすると顔が大きく写り、肩や胸元は少なくなります。小さくすると顔が小さくなり、肩や上半身が多く入ります。目安は `0.38〜0.46`。 |
| 頭上余白 | `--headroom-ratio` | `0.55` | 大きくすると頭上の余白が増え、顔は少し下に寄ります。小さくすると頭上余白が減ります。髪が切れそうな時は `0.60〜0.65`。 |
| 検出信頼度 | `--score-threshold` | `0.85` | 大きくすると確実な顔だけ採用し、要確認が増えます。小さくすると検出しやすくなりますが、誤検出も増えます。通常は `0.80〜0.90`。 |

600 x 800pxで作りたい場合:

```bash
.venv/bin/python crop_student_photos.py --dpi 508
```

3cm x 4cmで508dpiにすると、約600 x 800pxになります。

500KB以下の高画質版を作る場合:

```bash
.venv/bin/python crop_student_photos.py --recursive \
  --output-ok output_high_500kb \
  --output-review output_high_500kb_review \
  --preview preview_sheet/high_500kb_preview.jpg \
  --report report_high_500kb.csv \
  --dpi 900 \
  --max-kb 500
```

3cm x 4cmで900dpiにすると、1063 x 1417pxになります。

## 注意

- 元画像は上書きしません。
- 生徒写真を外部サービスへ送信しません。
- `output_review/` は必ず人間が確認してください。
- `input/` や `output_*` は `.gitignore` で除外しています。生徒写真をGitHubへ公開しないでください。

## CSV順リネーム

画像をファイル名順に並べ、CSVの指定列にある名前でコピーを作る補助スクリプトです。元画像は変更しません。

```bash
python3 scripts/rename_by_csv.py \
  --input-dir /path/to/photos \
  --csv seitono.csv \
  --output-dir renamed_output
```

既定ではCSVの1列目を使います。別の列を使う場合:

```bash
python3 scripts/rename_by_csv.py --input-dir /path/to/photos --csv names.csv --column 2
```

出力フォルダには `rename_mapping.csv` も作成されます。
