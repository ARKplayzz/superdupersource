import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import Bonjour from 'bonjour-service'

// Finds ATEM switchers on the local network, two ways at once:
// - Bonjour (_blackmagic._tcp with TXT class=AtemSwitcher, the query Companion uses)
// - a scan that sends the ATEM protocol hello to every address on each local /24, for networks
//   where multicast is blocked

export interface FoundSwitcher {
  address: string
  name: string
  via: 'bonjour' | 'scan'
}

const ATEM_PORT = 9910
// The bytes atem-connection sends to open a session.
const HELLO = Buffer.from([0x10, 0x14, 0x53, 0xab, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

function localSubnets(): string[] {
  const out = new Set<string>()
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.add(a.address.split('.').slice(0, 3).join('.'))
    }
  }
  return [...out]
}

export async function discoverSwitchers(seconds = 3): Promise<FoundSwitcher[]> {
  const found = new Map<string, FoundSwitcher>()

  const bonjour = new Bonjour()
  const browser = bonjour.find({ type: 'blackmagic', protocol: 'tcp' }, (svc) => {
    if (svc.txt?.class !== 'AtemSwitcher') return
    for (const address of (svc.addresses ?? []).filter((a) => a.includes('.'))) {
      found.set(address, { address, name: svc.name, via: 'bonjour' })
    }
  })

  const sock = createSocket('udp4')
  sock.on('message', (_msg, rinfo) => {
    if (!found.has(rinfo.address)) found.set(rinfo.address, { address: rinfo.address, name: 'ATEM switcher', via: 'scan' })
  })
  sock.on('error', () => {})
  await new Promise<void>((r) => sock.bind(0, r))
  for (const subnet of localSubnets()) {
    for (let i = 1; i <= 254; i++) sock.send(HELLO, ATEM_PORT, `${subnet}.${i}`)
  }

  await new Promise((r) => setTimeout(r, seconds * 1000))
  browser.stop()
  bonjour.destroy()
  sock.close()
  return [...found.values()].sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }))
}
