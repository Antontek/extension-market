# O Bricks 擴充商店的工具

檢查、打包 O Bricks 擴充功能的工具。由 obricks-platform-kit 產生，**不要手改**。

```bash
npm ci                                            # 第一次：安裝用到的套件
node obricks-market-tools.mjs check <擴充資料夾>   # 檢查一個（或好幾個）擴充
node obricks-market-tools.mjs check . --market https://raw.githubusercontent.com/Antontek/market/index/index.json
```

需要 Node.js 22 以上。`--market` 會和擴充商店上已經有的擴充比對 `lib/` 的檔名有沒有撞名，`--verbose` 會印出產生的程式碼。
