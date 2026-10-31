// Finds ATEM switchers on the network two ways:
//  1. Bonjour/mDNS (_blackmagic._tcp with TXT class=AtemSwitcher, the query Companion uses)
//  2. --scan: sends the ATEM protocol hello to every address on the local /24 and waits for replies
//
// Usage: npm run discover [-- --scan] [--seconds 5]

import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import Bonjour from 'bonjour-service'
import { flag, num, parseArgs } from './args'

const ATEM_PORT = 9910
// Same bytes atem-connection sends to open a session (COMMAND_CONNECT_HELLO).
const HELLO = Buffer.from([
  0x10, 0x14, 0x53, 0xab, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

async function mdns(seconds: number): Promise<void> {
  console.log(`Bonjour: listening for ${seconds}s...`)
  const bonjour = new Bonjour()
  const seen = new Set<string>()
  const browser = bonjour.find({ type: 'blackmagic', protocol: 'tcp' }, (svc) => {
    const ips = (svc.addresses ?? []).filter((a) => a.includes('.'))
    const key = `${svc.name}|${ips.join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    const cls = svc.txt?.class ?? '?'
    const tag = cls === 'AtemSwitcher' ? 'ATEM' : `other (${cls})`
    console.log(`  ${tag.padEnd(14)} ${svc.name.padEnd(36)} ${ips.join(', ') || svc.host}`)
  })
  await new Promise((r) => setTimeout(r, seconds * 1000))
  browser.stop()
  bonjour.destroy()
  if (seen.size === 0) console.log('  nothing found (multicast may be blocked on this network; try --scan)')
}

function localSubnets(): string[] {
  const out: string[] = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address.split('.').slice(0, 3).join('.'))
    }
  }
  return [...new Set(out)]
}

async function scan(seconds: number): Promise<void> {
  const subnets = localSubnets()
  console.log(`Scan: sending ATEM hello to ${subnets.map((s) => s + '.1-254').join(', ')}...`)
  const sock = createSocket('udp4')
  const found = new Set<string>()
  sock.on('message', (_msg, rinfo) => {
    if (found.has(rinfo.address)) return
    found.add(rinfo.address)
    console.log(`  ATEM replied from ${rinfo.address} (run: npm run probe -- --ip ${rinfo.address})`)
  })
  await new Promise<void>((r) => sock.bind(0, r))
  for (const s of subnets) {
    for (let i = 1; i <= 254; i++) sock.send(HELLO, ATEM_PORT, `${s}.${i}`)
  }
  await new Promise((r) => setTimeout(r, seconds * 1000))
  sock.close()
  if (found.size === 0) console.log('  no replies')
}

async function main() {
  const args = parseArgs()
  const seconds = num(args, 'seconds', 5)
  await mdns(seconds)
  if (flag(args, 'scan')) await scan(Math.min(seconds, 3))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
