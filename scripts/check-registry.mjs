// 檢查登記的 PR（.github/workflows/check-pr.yml）：
//   node scripts/check-registry.mjs --base-ref origin/main [--index <目前的 index 分支>] [--summary <輸出的 Markdown>]
//
//   1. registry.json 的格式（id、repo、不重複）
//   2. 新登記、換了 repo 的擴充：id 的保留字、repo 讀得到、有版本 tag；
//      抓最新的 tag：extension.json 的 id、version 要和登記、tag 一樣，用 tools/ 的檢查工具檢查（和上架時一樣）
//   3. 這個 PR 改了 registry.json 以外的檔案時提醒（第三方登記只能改 registry.json）
// 結果印在主控台，也寫成 Markdown（GitHub 的檢查結果頁）；有問題時結束碼是 1。
// 檢查通過不會自動合併：第一次登記要維護的人看過內容再合併
import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { checkFolders, marketLibOwners, readFolder } from '../tools/obricks-market-tools.mjs'
import { capture, checkRegistry, idProblems, isOfficial, option, readRegistry, versionTags, withTag } from './lib.mjs'

const BASE_REF = option('--base-ref')
const INDEX = option('--index')
const SUMMARY = option('--summary')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

const out = []
const say = line => {
  out.push(line)
  console.log(line.replace(/<\/?(details|summary)>/g, ''))
}
let failed = 0

const head = await readRegistry('registry.json')
let base = { list: [], problems: [] }
if (BASE_REF) {
  try {
    base = checkRegistry(JSON.parse(git('show', `${BASE_REF}:registry.json`)))
  } catch {
    // 第一次建立 registry.json
  }
}

say('## 擴充商店的登記檢查\n')
if (head.problems.length) {
  failed++
  say('### ✗ registry.json 的格式')
  for (const p of head.problems) say(`- ${p}`)
  say('')
}

if (BASE_REF) {
  const files = git('diff', '--name-only', `${BASE_REF}...HEAD`).trim().split('\n').filter(Boolean)
  const others = files.filter(f => f !== 'registry.json')
  if (others.length) say(`> ⚠ 這個 PR 還改了 registry.json 以外的檔案：${others.join('、')}。第三方登記只能改 registry.json，請維護的人特別確認。\n`)
}

const before = Object.fromEntries(base.list.map(e => [e.id, e]))
const after = Object.fromEntries(head.list.map(e => [e.id, e]))
const added = head.list.filter(e => !before[e.id])
const moved = head.list.filter(e => before[e.id] && before[e.id].repo.toLowerCase() !== e.repo.toLowerCase())
const removed = base.list.filter(e => !after[e.id])
const disabled = head.list.filter(e => e.disabled && !before[e.id]?.disabled)

const libOwners = await marketLibOwners(INDEX ?? null)

for (const e of [...added, ...moved]) {
  const problems = idProblems(e.id, e.repo)
  const kind = before[e.id] ? `換 repo（原本是 ${before[e.id].repo}，請確認是同一個作者）` : '新登記'
  let detail = []
  let tag = null
  if (!problems.length && !e.disabled) {
    try {
      const tags = await versionTags(e.repo)
      tag = tags.at(-1)
      if (!tag) problems.push(`https://github.com/${e.repo} 沒有版本 tag：在 repo 打一個和 extension.json 的 version 一樣的 tag（例如 v1.0.0）`)
    } catch {
      problems.push(`讀不到 https://github.com/${e.repo}：repo 要是公開的`)
    }
  }
  if (tag) {
    try {
      await withTag(e.repo, tag.tag, async dir => {
        const files = await readFolder(dir)
        const manifest = files['extension.json'] ? JSON.parse(new TextDecoder().decode(files['extension.json'])) : null
        if (!manifest) return problems.push(`${tag.tag} 的最上層沒有 extension.json`)
        if (manifest.id !== e.id) problems.push(`extension.json 的 id 是 ${manifest.id}，登記的是 ${e.id}`)
        if (manifest.version !== tag.version) problems.push(`extension.json 的 version 是 ${manifest.version}，tag 是 ${tag.tag}`)
        const owners = Object.fromEntries(Object.entries(libOwners).filter(([, owner]) => owner !== e.id))
        const { result, lines } = await capture(() => checkFolders([dir], { libOwners: owners }))
        detail = lines
        if (!result.ok) problems.push('檢查工具沒有通過（見下面的檢查結果）')
      })
    } catch (err) {
      problems.push(`抓不到 ${tag.tag}：${String(err.stderr || err.message).trim().split('\n').pop()}`)
    }
  }
  if (problems.length) failed++
  say(`### ${problems.length ? '✗' : '✓'} ${e.id} — ${kind}`)
  say(`- repo：https://github.com/${e.repo}${isOfficial(e.repo) ? '（官方）' : ''}`)
  if (tag) say(`- 檢查的版本：${tag.tag}（commit ${tag.commit.slice(0, 7)}）`)
  for (const p of problems) say(`- ✗ ${p}`)
  if (detail.length) say(`\n<details><summary>檢查結果</summary>\n\n\`\`\`\n${detail.join('\n')}\n\`\`\`\n</details>`)
  if (!problems.length && !isOfficial(e.repo)) say('\n維護的人請看過：README、積木的文字、範例、lib/ 的程式適不適合小朋友使用，再合併。')
  say('')
}
for (const e of removed) say(`- 從登記清單拿掉：${e.id}（${e.repo}）——合併後會從擴充商店拿掉，id 可以再被別人登記；只是要下架的話改寫 disabled`)
for (const e of disabled) say(`- 下架：${e.id}（${e.disabled}）`)
if (!added.length && !moved.length && !removed.length && !disabled.length && !head.problems.length) say('（沒有新登記或換 repo 的擴充）')

say(`\n${failed ? `✗ ${failed} 項有問題` : '✓ 檢查通過'}`)
if (SUMMARY) await appendFile(SUMMARY, `${out.join('\n')}\n`)
process.exitCode = failed ? 1 : 0
