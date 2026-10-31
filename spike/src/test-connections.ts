// Phase 0 test 4: how many control connections the switcher accepts at once.
// Opens connections one by one until one fails, then closes them all. Read-only otherwise.
// Companion, ATEM Software Control and panels already connected count towards the limit,
// so note what else is connected when you run it.
//
// Usage: npm run test:connections -- --ip 192.168.0.240 [--max 12]

import { Atem } from 'atem-connection'
import { num, parseArgs, str } from './args'
import { writeResults } from './animate'
import { connect } from './connect'

async function main() {
  const args = parseArgs()
  const ip = str(args, 'ip')
  const max = num(args, 'max', 12)
  const open: Atem[] = []
  let failure: string | null = null

  for (let i = 1; i <= max; i++) {
    try {
      open.push(await connect(ip, 4000))
      console.log(`  connection ${i}: ok`)
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e)
      console.log(`  connection ${i}: failed (${failure})`)
      break
    }
  }

  for (const a of open) await a.destroy()
  const summary = { ip, accepted: open.length, triedUpTo: max, failure }
  console.log(failure ? `\nThe switcher accepted ${open.length} more connections from this PC.` : `\nAll ${max} connections were accepted.`)
  console.log(`Saved ${writeResults('connections', summary)}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
