// 打包擴充商店（.github/workflows/build-index.yml 每小時、登記清單合併後執行）：
//   node scripts/build-index.mjs --previous <目前的 index 分支> --out <輸出資料夾>
//
// 照 registry.json，對每個擴充：
//   1. 已經上架的版本照舊（zip 從 --previous 複製過來，不重新打包：上架後內容不會變）
//   2. 讀 repo 的版本 tag（v1.0.1），比已上架的最新版還新的：抓下來 → 檢查（id、version 要和登記、tag 一樣，
//      再用 tools/ 的檢查工具檢查）→ 通過就打包上架
//   3. 沒通過的 tag 記在 state.json，同一個 tag（同一個 commit）不會每小時重試；改好要升版本號、打新的 tag
//   4. 結果寫在 logs/<id>.txt（作者看得到為什麼沒上架）
// 登記清單拿掉、或寫了 disabled 的擴充不會出現在 index.json。
// 有變動時在 GITHUB_OUTPUT 寫 changed=true（沒變就不推，index 分支不會每小時多一個 commit）
import { existsSync } from 'node:fs'
import { appendFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildIndex,
  checkFolders,
  compareVersions,
  iconFilePath,
  indexEntry,
  packExtension,
  readFolder,
} from '../tools/obricks-market-tools.mjs'
import { capture, idProblems, option, readRegistry, versionTags, withTag } from './lib.mjs'

const PREVIOUS = option('--previous')
const OUT = option('--out') ?? 'out'
const LOG_LINES = 400 // 每個擴充的紀錄最多留幾行

const readJson = async (path, fallback) =>
  existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : fallback
const previous = {
  index: PREVIOUS ? await readJson(join(PREVIOUS, 'index.json'), null) : null,
  state: PREVIOUS ? await readJson(join(PREVIOUS, 'state.json'), {}) : {},
}
const previousEntry = id => previous.index?.extensions.find(e => e.id === id)
// failed：沒通過的 tag → commit；notes：上一次記過的狀況（一樣的不再記，紀錄才不會每小時多一行）
const state = { failed: structuredClone(previous.state.failed ?? {}), notes: {} }
const note = (id, text) => {
  state.notes[id] = text
  if (previous.state.notes?.[id] !== text) log(id, text)
}

const { list, problems } = await readRegistry('registry.json')
if (problems.length) {
  for (const p of problems) console.log(`✗ ${p}`)
  process.exit(1)
}

await rm(OUT, { recursive: true, force: true })
await mkdir(join(OUT, 'logs'), { recursive: true })
const now = new Date().toISOString()
const logs = {}
const log = (id, text) => {
  ;(logs[id] ??= []).push(...text.split('\n').map(l => `${now} ${l}`))
  console.log(`[${id}] ${text}`)
}

// lib/ 的檔名 → 擴充 id（各擴充最新版的），檢查新版本有沒有和別的擴充撞名
const libOwners = {}
for (const e of previous.index?.extensions ?? []) for (const lib of e.versions[0]?.lib ?? []) libOwners[lib] = e.id

const entries = []
for (const reg of list) {
  const { id, repo } = reg
  if (reg.disabled) {
    if (previousEntry(id)) log(id, `已下架：${reg.disabled}`)
    continue
  }
  const old = previousEntry(id)
  const versions = (old?.versions ?? []).map(release => ({ release }))
  if (versions.length) versions[0].listing = pickListing(old) // 沒有新版時，說明用上一次的
  let icon = old?.icon ?? null
  for (const path of [...versions.map(v => v.release.file), icon].filter(Boolean)) {
    await mkdir(join(OUT, path, '..'), { recursive: true })
    await cp(join(PREVIOUS, path), join(OUT, path))
  }

  let tags = []
  try {
    tags = await versionTags(repo)
  } catch (e) {
    note(id, `✗ 讀不到 https://github.com/${repo} 的 tag：${firstLine(e)}`)
  }
  for (const t of tags) {
    const latest = versions[0]?.release.version
    if (versions.some(v => v.release.version === t.version)) continue
    if (state.failed[id]?.[t.tag] === t.commit) continue // 已經檢查過、沒通過
    const fail = reason => {
      log(id, `✗ ${t.tag}（${t.commit.slice(0, 7)}）沒有上架：${reason}`)
      ;(state.failed[id] ??= {})[t.tag] = t.commit
    }
    if (latest && compareVersions(t.version, latest) <= 0) {
      fail(`版本要比已上架的 ${latest} 新`)
      continue
    }
    const idProblem = idProblems(id, repo)[0]
    if (idProblem) {
      fail(idProblem)
      continue
    }
    try {
      await withTag(repo, t.tag, async dir => {
        const files = await readFolder(dir)
        const manifest = files['extension.json'] ? JSON.parse(new TextDecoder().decode(files['extension.json'])) : null
        if (!manifest) return fail('repo 的最上層沒有 extension.json')
        if (manifest.id !== id) return fail(`extension.json 的 id 是 ${manifest.id}，登記的是 ${id}`)
        if (manifest.version !== t.version) return fail(`extension.json 的 version 是 ${manifest.version}，tag 是 ${t.tag}`)
        const owners = Object.fromEntries(Object.entries(libOwners).filter(([, owner]) => owner !== id))
        const { result, lines } = await capture(() => checkFolders([dir], { libOwners: owners }))
        if (!result.ok) return fail(`檢查沒有通過：\n${lines.join('\n')}`)
        const pack = packExtension(files)
        await mkdir(join(OUT, `packages/${id}`), { recursive: true })
        await writeFile(join(OUT, pack.release.file), pack.zip)
        if (pack.icon) {
          icon = iconFilePath(id, pack.icon.name)
          await writeFile(join(OUT, icon), pack.icon.data)
        }
        versions.unshift({ listing: pack.listing, release: { ...pack.release, commit: t.commit } })
        for (const lib of pack.release.lib) libOwners[lib] = id
        delete state.failed[id]?.[t.tag]
        log(id, `✓ ${t.tag}（${t.commit.slice(0, 7)}）已上架`)
      })
    } catch (e) {
      fail(`抓不到這個 tag：${firstLine(e)}`)
    }
  }
  if (!versions.length) {
    if (!logs[id]) note(id, '還沒有上架的版本：repo 要有版本 tag（例如 v1.0.0），而且檢查通過')
    continue
  }
  entries.push(indexEntry(id, versions, { icon, source: { github: { repo } } }))
}
for (const e of previous.index?.extensions ?? [])
  if (!list.some(r => r.id === e.id)) console.log(`[${e.id}] 不在登記清單裡了，從擴充商店拿掉`)

// 紀錄：上一次的接上這一次的（只留登記清單裡的）
for (const { id } of list) {
  const path = `logs/${id}.txt`
  const before = PREVIOUS && existsSync(join(PREVIOUS, path)) ? (await readFile(join(PREVIOUS, path), 'utf8')).split('\n').filter(Boolean) : []
  const all = [...before, ...(logs[id] ?? [])].slice(-LOG_LINES)
  if (all.length) await writeFile(join(OUT, path), `${all.join('\n')}\n`)
}

// index.json：內容沒變就保留原本的 updatedAt
const index = buildIndex(entries)
const same = previous.index && JSON.stringify(previous.index.extensions) === JSON.stringify(index.extensions)
if (same) index.updatedAt = previous.index.updatedAt
await writeFile(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
await writeFile(join(OUT, 'state.json'), `${JSON.stringify(state, null, 2)}\n`)
await writeFile(
  join(OUT, 'README.md'),
  `# 擴充商店（自動產生）\n\n這個分支由 main 分支的 \`scripts/build-index.mjs\` 產生，每次整個換掉，**不要手改**。\n\n- \`index.json\`：擴充商店的清單（網站讀這個）\n- \`packages/<id>/\`：每個版本的 zip、圖示\n- \`logs/<id>.txt\`：每個擴充上架的紀錄（沒上架的原因也在這裡）\n`,
)

const changed =
  !same ||
  JSON.stringify(state) !== JSON.stringify({ failed: previous.state.failed ?? {}, notes: previous.state.notes ?? {} }) ||
  Object.keys(logs).length > 0
console.log(`\n${entries.length} 個擴充上架（${entries.map(e => `${e.id} ${e.versions[0].version}`).join('、')}）${changed ? '' : '，沒有變動'}`)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`)

function pickListing(entry) {
  const { name, description, author, category, readme, samples } = entry
  return { name, description, author, category, readme, samples }
}

function firstLine(e) {
  return String(e.stderr || e.message).trim().split('\n').pop()
}
