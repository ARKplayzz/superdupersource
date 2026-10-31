// Sets the app and Companion module to the same version, ready to tag a release.
// Usage: npm run bump 0.2.0
// Then: git commit -am "v0.2.0" && git tag v0.2.0 && git push --follow-tags

import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version ?? '')) {
  console.error('Usage: npm run bump <version>, for example npm run bump 0.2.0')
  process.exit(1)
}

for (const file of ['apps/desktop/package.json', 'apps/companion/package.json']) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  pkg.version = version
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`${file}: ${version}`)
}

// The module reports its version to the app in its hello message.
const main = 'apps/companion/src/main.ts'
const src = readFileSync(main, 'utf8')
const next = src.replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`)
if (next === src && !src.includes(`const VERSION = '${version}'`)) throw new Error(`No VERSION constant found in ${main}`)
writeFileSync(main, next)
console.log(`${main}: ${version}`)

console.log(`\nNext: git commit -am "v${version}" && git tag v${version} && git push --follow-tags`)
