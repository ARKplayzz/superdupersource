// The Releases page: every GitHub release, newest first, with its notes and downloads.

const REPO = 'ARKplayzz/superdupersource'

interface Asset {
  name: string
  size: number
  browser_download_url: string
}

interface Release {
  tag_name: string
  name: string | null
  body: string | null
  published_at: string
  html_url: string
  prerelease: boolean
  draft: boolean
  assets: Asset[]
}

// 127.9 MB, or 21 KB for something small like the Companion module.
export const fileSize = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`)

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Inline markdown: code, bold, links and bare URLs. Runs on escaped text, so it can only add these tags.
function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
}

// Enough markdown for release notes: headings, bullet lists and paragraphs.
export function renderNotes(md: string): string {
  const out: string[] = []
  let list: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`)
    para = []
    list = []
  }
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (!line) flush()
    else if (heading) {
      flush()
      out.push(`<h3>${inline(heading[1])}</h3>`)
    } else if (bullet) {
      if (para.length) flush()
      list.push(bullet[1])
    } else if (list.length && /^\s{2,}/.test(raw)) list[list.length - 1] += ` ${line}`
    else {
      if (list.length) flush()
      para.push(line)
    }
  }
  flush()
  return out.join('\n')
}

const KIND: [RegExp, string][] = [
  [/\.exe$/i, 'Windows installer'],
  [/\.tgz$/i, 'Companion module'],
]

function releaseHtml(r: Release, latest: boolean): string {
  const version = r.tag_name.replace(/^v/, '')
  const date = new Date(r.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const assets = r.assets
    .map((a) => ({ a, k: KIND.findIndex(([re]) => re.test(a.name)) }))
    .filter((x) => x.k >= 0)
    .sort((x, y) => x.k - y.k)
    .map(({ a, k }) => ({ a, kind: KIND[k][1] }))
    .map(({ a, kind }) => `<div><a href="${escape(a.browser_download_url)}">${kind}</a> <span class="muted num">${escape(a.name)}, ${fileSize(a.size)}</span></div>`)
    .join('')
  const tag = latest ? '<span class="rel-tag latest">Latest</span>' : r.prerelease ? '<span class="rel-tag">Pre-release</span>' : ''
  return `<article class="rel" id="${escape(r.tag_name)}">
    <div class="rel-side">
      <h2 class="num">${escape(version)}</h2>
      <div class="muted">${date}</div>
      ${tag}
    </div>
    <div class="rel-notes">
      ${r.body?.trim() ? renderNotes(r.body) : '<p class="muted">No notes for this release.</p>'}
      ${assets ? `<div class="rel-assets">${assets}</div>` : ''}
      <p class="muted small"><a href="${escape(r.html_url)}">On GitHub</a></p>
    </div>
  </article>`
}

export function initReleases(): void {
  const el = document.getElementById('release-list')
  if (!el) return
  void (async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, { headers: { Accept: 'application/vnd.github+json' } })
      if (!res.ok) throw new Error(String(res.status))
      const releases = ((await res.json()) as Release[]).filter((r) => !r.draft)
      if (!releases.length) {
        el.innerHTML = '<p class="muted">No releases yet.</p>'
        return
      }
      const latest = releases.find((r) => !r.prerelease)
      el.innerHTML = releases.map((r) => releaseHtml(r, r === latest)).join('')
      // Arriving with #v0.1.0 in the address: the article exists only now, so scroll to it.
      if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()
    } catch {
      el.innerHTML = `<p>Couldn't load releases. <a href="https://github.com/${REPO}/releases">See them on GitHub</a>.</p>`
    }
  })()
}
