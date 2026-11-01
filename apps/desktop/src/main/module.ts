import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type { ModuleDownload } from '../shared/api'

// Fetches the Companion module package from the latest GitHub release into Downloads and shows it.
// Companion has no way to install a module from outside, so the last step (Modules, Import module
// package) is done in Companion.

const REPO = 'ARKplayzz/superdupersource'

interface Release {
  tag_name: string
  assets: { name: string; browser_download_url: string }[]
}

export async function downloadModule(): Promise<ModuleDownload> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.status === 404) return { ok: false, error: 'No release on GitHub yet' }
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` }
    const release = (await res.json()) as Release
    const asset = release.assets.find((a) => a.name.endsWith('.tgz'))
    if (!asset) return { ok: false, error: `Release ${release.tag_name} has no Companion module` }
    const file = await fetch(asset.browser_download_url)
    if (!file.ok) return { ok: false, error: `Download failed (${file.status})` }
    const path = join(app.getPath('downloads'), asset.name)
    await writeFile(path, Buffer.from(await file.arrayBuffer()))
    shell.showItemInFolder(path)
    return { ok: true, version: release.tag_name.replace(/^v/, ''), path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
