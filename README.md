# O Bricks 擴充商店

O Bricks 編輯器「擴充商店」的登記清單和自動打包。做法和 Arduino 的函式庫管理員一樣：

- 每個擴充功能是**作者自己的 GitHub repo**
- 第一次在這裡的 `registry.json` **登記一次**（發 PR）
- 之後作者在自己的 repo **打 tag 就是發新版**，這裡每小時自動抓新的 tag、檢查、上架

網站讀的是這個 repo 的 `index` 分支（自動產生的 `index.json` 和每個版本的 zip）。

| 位置 | 內容 |
|---|---|
| `registry.json` | 登記清單：有哪些擴充、各自在哪個 repo |
| `tools/` | 檢查、打包工具（自動產生，不要手改） |
| `scripts/` | 打包程式（`build-index.mjs`）、檢查登記的程式（`check-registry.mjs`） |
| `action.yml` | 給擴充的 repo 用的檢查（見「在 GitHub 上自動檢查」） |
| `index` 分支 | 擴充商店的清單 `index.json`、`packages/`、每個擴充的紀錄 `logs/<id>.txt` |

官方的擴充可以當範例：[ext-ultrasonic](https://github.com/Antontek/ext-ultrasonic)（超音波感測器，有 `lib/`）、
[ext-neopixel](https://github.com/Antontek/ext-neopixel)（LED 燈條）、[ext-mqtt](https://github.com/Antontek/ext-mqtt)（MQTT）。

---

## 一、擴充功能的 repo

repo 的**最上層**就是擴充功能的檔案（不要再包一層資料夾）：

```
ext-ultrasonic/
├─ extension.json        擴充的設定（見下面）
├─ blocks/
│  ├─ definitions.json   積木長什麼樣子（Blockly 的 JSON 格式）
│  ├─ toolbox.json       積木清單、預設值
│  ├─ generator/
│  │  └─ python.json     積木 → MicroPython 的樣板
│  └─ msg/               積木上的文字，一個語言一個檔案：zh-hant.json、zh-hans.json、en.json、ja.json
├─ lib/                  上傳到主機的函式庫（選用）
├─ samples/              範例（選用）：samples.json 加上 .obk
├─ icon.svg              擴充商店的圖示（也可以用 icon.png）
├─ README.md             說明、接線方式（繁體中文，擴充商店的詳細頁顯示）
└─ README.<語言>.md       其他語言的說明（選用）：README.zh-hans.md、README.en.md、README.ja.md
```

`.` 開頭的檔案和資料夾（`.git`、`.github`、`.gitignore`）不會放進擴充商店的 zip。

### extension.json

```json
{
  "id": "ultrasonic",
  "version": "1.0.1",
  "name": { "zh-hant": "超音波感測器", "zh-hans": "超声波传感器", "en": "Ultrasonic sensor", "ja": "超音波センサー" },
  "description": { "zh-hant": "HC-SR04 超音波測距模組，量測前方物體的距離（公分）。", "en": "…" },
  "author": "O Bricks",
  "category": "sensor",
  "app": ">=1.0.0",
  "codeTypes": ["micropython"],
  "boards": ["rp2040", "rp2350"]
}
```

| 欄位 | 說明 |
|---|---|
| `id` | 小寫英文開頭，只能有小寫英文、數字、`-`。登記後**不能改**。積木、文字代號都要用它開頭（見「命名」） |
| `version` | `主版號.次版號.修訂號`。內容改了（包括只改翻譯）要升版本，已經安裝的人才會看到更新 |
| `name`、`description` | 名稱、簡介：`{ "zh-hant": …, "zh-hans": …, "en": …, "ja": … }`。只寫繁體中文也可以 |
| `author` | 作者 |
| `category` | `sensor`（感測器）、`display`（顯示）、`motor`（馬達）、`communication`（通訊）、`other`（其他） |
| `app` | 需要的平台版本。一般寫 `">=1.0.0"`；平台加了新寫法時，用到新寫法的擴充寫 `">=1.1.0"`。條件可以用空白隔開：`">=1.1.0 <2.0.0"`。擴充商店只列出網站能用的版本 |
| `codeTypes` | 適用的程式碼類型：`["micropython"]` |
| `boards` | 適用的板子：`rp2040`、`rp2350` |

原始碼在哪裡不用寫：擴充商店照登記清單填。

### 命名

- 積木的 type 用 id 開頭：`ultrasonic_distance`（id 裡的 `-` 換成 `_`）
- 文字代號用大寫的 id 開頭：`ULTRASONIC_DISTANCE`；分類名稱是 `CAT_ULTRASONIC`
- 範例的 id 用 id 加 `-` 開頭：`ultrasonic-print`
- `lib/` 的檔名不能和別的擴充一樣（主機上都放在專案資料夾的 `lib/`，會互相覆蓋），建議也用 id 開頭

### 積木：blocks/

`definitions.json` 是 [Blockly 的 JSON 積木定義](https://developers.google.com/blockly/guides/create-custom-blocks/define/structure)，文字寫成 `%{BKY_代號}`：

```json
[
  {
    "type": "ultrasonic_distance",
    "message0": "%{BKY_ULTRASONIC_DISTANCE}",
    "args0": [
      { "type": "field_dropdown", "name": "TRIG", "options": [["GP2", "2"], ["GP4", "4"]] },
      { "type": "field_dropdown", "name": "ECHO", "options": [["GP3", "3"], ["GP5", "5"]] }
    ],
    "output": "Number",
    "colour": "#0EA5A4"
  }
]
```

`msg/zh-hant.json`（其他語言同一組代號）：

```json
{ "CAT_ULTRASONIC": "超音波", "ULTRASONIC_DISTANCE": "超音波距離（公分） Trig %1 Echo %2" }
```

`toolbox.json` 是積木清單，每個積木都要放進去，使用者才找得到：

```json
[{ "kind": "block", "type": "ultrasonic_distance" }]
```

### 產生程式碼：blocks/generator/python.json

擴充只能用 JSON 樣板描述，不能放 JavaScript。每個積木一個樣板：

```json
{
  "ultrasonic_distance": {
    "imports": ["from hcsr04 import HCSR04"],
    "setup": { "sonar_{TRIG}": "sonar_{TRIG} = HCSR04(trigger_pin={TRIG}, echo_pin={ECHO})" },
    "code": "sonar_{TRIG}.distance_cm()",
    "output": true
  }
}
```

| 欄位 | 說明 |
|---|---|
| `code` | 產生的程式碼。可以上下接的積木會自動在結尾換行；可以寫好幾行（`\n`） |
| `output` | `true`：取值的積木（積木定義有 `output`） |
| `order` | 取值積木的運算優先順序，決定放進其他運算時要不要加括號，預設 `FUNCTION_CALL`。名稱照 Blockly 官方 Python 產生器的 Order：`ATOMIC`、`FUNCTION_CALL`、`MEMBER`、`MULTIPLICATIVE`、`ADDITIVE`、`RELATIONAL`、`LOGICAL_NOT`、`LOGICAL_AND`、`LOGICAL_OR`、`NONE`… |
| `imports` | 需要的 import，放到程式最上面，同一行只出現一次 |
| `setup` | 只建立一次的物件 `{ 名稱: 程式 }`，放在 import 下面，同一個名稱只出現一次 |
| `inputs` | 接其他積木的輸入：`{ 名稱: { "order": …, "default": … } }`。`order` 是放進這裡的運算優先順序（預設 `NONE`），`default` 是沒接積木時用的程式碼（預設 `None`） |
| `map` | 下拉選項的值換成別的程式碼：`{ "DIR": { "left": "LEFT", "right": "RIGHT" } }` |

佔位符（`code`、`imports`、`setup` 都可以用）：

| 寫法 | 換成 |
|---|---|
| `{名稱}` | 積木上欄位的值，或接在輸入上的積木產生的程式碼 |
| `{名稱\|str}` | 欄位的值寫成字串（加上引號） |
| `{名稱}`（包積木的地方） | 包在裡面的積木（`input_statement`），只能用在 `code`，會自動縮排；裡面沒有積木時補 `pass` |
| `{{`、`}}` | 大括號本身（例如 Python 的 dict） |

### lib/

`lib/` 裡的檔案會上傳到主機上專案資料夾的 `lib/`，程式可以直接 `from hcsr04 import HCSR04`。`.py` 檔會檢查語法。

### 範例：samples/

範例在 O Bricks 編輯器裡做好、匯出成 `.obk`，放進 `samples/`，再寫 `samples.json`：

```json
[
  {
    "id": "ultrasonic-print",
    "file": "print-distance.obk",
    "level": "basic",
    "name": { "zh-hant": "輸出距離", "en": "Print the distance" },
    "desc": { "zh-hant": "每 0.2 秒把量到的距離輸出到主控台。", "en": "Print the measured distance to the console every 0.2 seconds." }
  }
]
```

### 多語言

介面有繁體中文（`zh-hant`）、简体中文（`zh-hans`）、English（`en`）、日本語（`ja`）。缺翻譯不算錯，檢查只會提醒：
README 缺的語言顯示 `README.md`，其他文字依序改用其他語言。腳位名稱（GP2）、型號（HC-SR04）不用翻譯。

---

## 二、自己檢查

和登記、上架時的檢查一樣：格式、命名、每塊適用的板子上把每個積木建立一次、產生程式碼、Python 語法、範例打開一次。
需要 [Node.js](https://nodejs.org/) 22 以上和 git。

```bash
git clone https://github.com/Antontek/market.git
cd market
npm ci --prefix tools
node tools/obricks-market-tools.mjs check ../ext-你的擴充 --market https://raw.githubusercontent.com/Antontek/market/index/index.json
```

`--market` 會和擴充商店上已經有的擴充比對 `lib/` 的檔名，`--verbose` 會印出產生的程式碼。

### 在 GitHub 上自動檢查

在你的擴充 repo 加 `.github/workflows/check.yml`，每次推送都會檢查：

```yaml
name: 檢查
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: Antontek/market@main
```

---

## 三、登記（第一次）

1. 擴充的 repo 要是**公開的**，最上層有 `extension.json`。
2. 打一個和 `version` 一樣的 tag，推上去：`git tag v1.0.0 && git push origin v1.0.0`。
3. Fork 這個 repo，在 `registry.json` 的最後面加一行，發 PR：
   ```json
   { "id": "你的擴充 id", "repo": "你的帳號/repo 名稱" }
   ```
   PR **只改 `registry.json`**。
4. PR 會自動檢查最新的 tag，結果在 PR 的「Checks」頁。第一次發 PR 的人，要等維護的人按下執行才會開始檢查。
5. 檢查通過後，維護的人會看過內容（說明、積木、範例、`lib/` 的程式適不適合小朋友使用）再合併。
6. 合併後幾分鐘內上架。

id 的規則：

- 不能和已經登記的重複
- 不能是 `ob` 或 `ob-` 開頭：會和 O Bricks 自己的 `ob_` 積木撞名
- `obricks`、`antontek` 開頭的留給官方擴充

## 四、發新版

1. 改好內容，`extension.json` 的 `version` 升版（`1.0.1` → `1.0.2`）。
2. 推上去，打一樣的 tag：`git tag v1.0.2 && git push origin v1.0.2`。
3. 每小時檢查一次新的 tag，通過就上架，不用再發 PR。

規則：

- tag 是 `v1.0.2` 或 `1.0.2`，要和 `extension.json` 的 `version` 一樣，`id` 也要和登記的一樣
- 版本要比已上架的最新版新
- 上架的版本**不會再變**：已上架的 tag 被移動或刪除，擴充商店還是原本的內容。要修正就升版本號、打新的 tag
- 沒通過的 tag 不會重試：改好之後一樣要升版本號、打新的 tag

為什麼沒上架，看 `index` 分支的紀錄：`https://github.com/Antontek/market/blob/index/logs/<id>.txt`

---

## 五、維護

- **合併登記的 PR 前**：PR 只能改 `registry.json`（改了別的檔案，檢查結果會提醒）；檢查通過；看過內容。
- **下架**：在那一筆加 `"disabled": "原因"`，合併後就從擴充商店拿掉，id 還保留著。直接刪掉那一筆的話，id 可以再被別人登記。
- **重新打包**：在 Actions 頁執行「打包擴充商店」（平常每小時自動執行，`registry.json`、`tools/`、`scripts/` 合併進 main 時也會執行）。
- **`tools/`** 是產生的：平台改了擴充的格式、板子、積木時更新，不要手改。
- GitHub 會停用超過 60 天沒有任何變動的公開 repo 的排程，到時要在 Actions 頁重新啟用。
