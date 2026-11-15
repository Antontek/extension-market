// 登記清單、git、檢查工具的共用寫法（build-index.mjs、check-registry.mjs 用）
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const OFFICIAL = 'Antontek' // 官方擴充的 GitHub 組織
// 測試時可以換成本機的資料夾（例如 file:///tmp/repos/），平常是 GitHub
export const GIT_BASE = process.env.MARKET_GIT_BASE ?? 'https://github.com/'
export const repoUrl = repo => `${GIT_BASE}${repo}.git`
export const TAG = /^v?(\d+\.\d+\.\d+)$/ // 版本的 tag：v1.0.1 或 1.0.1

const ID = /^[a-z][a-z0-9-]*$/
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/

/** 讀登記清單，回傳 { list, problems } */
export async function readRegistry(path) {
  let data
  try {
    data = JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    return { list: [], problems: [`${path} 讀不到或不是正確的 JSON：${e.message}`] }
  }
  return checkRegistry(data, path)
}

export function checkRegistry(data, path = 'registry.json') {
  const problems = []
  const list = Array.isArray(data?.extensions) ? data.extensions : []
  if (!Array.isArray(data?.extensions)) problems.push(`${path} 要寫成 { "extensions": [ … ] }`)
  const ids = new Set()
  const repos = new Set()
  for (const [i, e] of list.entries()) {
    const at = `${path} 的第 ${i + 1} 個（${e?.id ?? '?'}）`
    if (!ID.test(e?.id ?? '')) problems.push(`${at}：id 要用小寫英文開頭，只能有小寫英文、數字、-`)
    if (!REPO.test(e?.repo ?? '')) problems.push(`${at}：repo 要寫 GitHub 的「帳號/repo 名稱」，例如 ${OFFICIAL}/ext-${e?.id ?? 'xxx'}`)
    for (const key of Object.keys(e ?? {}))
      if (!['id', 'repo', 'disabled'].includes(key)) problems.push(`${at}：不認得的欄位 ${key}（只有 id、repo、disabled）`)
    if (e?.disabled != null && typeof e.disabled !== 'string') problems.push(`${at}：disabled 要寫下架的原因（文字）`)
    if (ids.has(e?.id)) problems.push(`${at}：id 重複`)
    if (repos.has(e?.repo?.toLowerCase())) problems.push(`${at}：repo 重複`)
    ids.add(e?.id)
    repos.add(e?.repo?.toLowerCase())
  }
  return { list, problems }
}

export const isOfficial = repo => repo.split('/')[0].toLowerCase() === OFFICIAL.toLowerCase()

/**
 * id 的保留字：ob（O Bricks 自己的積木用 ob_ 開頭）不能用；obricks、antontek 開頭的只給官方擴充
 */
export function idProblems(id, repo) {
  if (id === 'ob' || id.startsWith('ob-')) return [`id 不能是 ob 或 ob- 開頭：積木要用 id 開頭（${id.replace(/-/g, '_')}_…），會和 O Bricks 自己的 ob_ 積木撞名`]
  if (!isOfficial(repo) && /^(obricks|antontek)/.test(id)) return [`id 不能用 obricks、antontek 開頭（留給官方擴充）`]
  return []
}

/** repo 上的版本 tag：[{ tag, version, commit }]，版本舊的在前。讀不到丟出 Error */
export async function versionTags(repo) {
  const { stdout } = await run('git', ['ls-remote', '--tags', repoUrl(repo)], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 60_000,
  })
  const tags = {}
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    const [sha, ref] = line.split('\t')
    const name = ref.replace('refs/tags/', '')
    const peeled = name.endsWith('^{}')
    const tag = peeled ? name.slice(0, -3) : name
    if (!TAG.test(tag)) continue
    // 有註解的 tag：^{} 那一行才是 commit
    if (peeled || !tags[tag]) tags[tag] = { tag, version: TAG.exec(tag)[1], commit: sha }
  }
  return Object.values(tags).sort((a, b) => compare(a.version, b.version))
}

const compare = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** 把 repo 的某個 tag 抓到暫存資料夾，執行 fn(資料夾)，結束後刪掉 */
export async function withTag(repo, tag, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'obricks-ext-'))
  try {
    await run('git', ['clone', '--quiet', '--depth', '1', '--branch', tag, repoUrl(repo), dir], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 120_000,
    })
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** 執行 fn，把它印在主控台的字收起來：回傳 { result, lines } */
export async function capture(fn) {
  const lines = []
  const log = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try {
    return { result: await fn(), lines }
  } finally {
    console.log = log
  }
}

export const option = name =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null
