// Read-only. Connects, prints what the switcher can do, and saves it to results/.
// Usage: npm run probe -- --ip 192.168.0.240

import { Enums } from 'atem-connection'
import { parseArgs, str } from './args'
import { writeResults } from './animate'
import { connect } from './connect'
import { onAirReason } from './safety'
import { fpsFor, fromRaw } from './units'

// Defaults from project.md (1-based, as ATEM Software Control numbers them).
const RESERVED_MACROS = { from: 80, to: 99 }
const RESERVED_STILLS = { from: 15, to: 20 }

async function main() {
  const args = parseArgs()
  const ip = str(args, 'ip')
  const atem = await connect(ip)
  const s = atem.state!
  const info = s.info
  const mode = s.settings.videoMode

  const report = {
    ip,
    model: Enums.Model[info.model] ?? info.model,
    productIdentifier: info.productIdentifier,
    protocol: Enums.ProtocolVersion[info.apiVersion] ?? info.apiVersion,
    videoMode: Enums.VideoMode[mode],
    fps: fpsFor(mode),
    capabilities: info.capabilities,
    superSources: info.superSources.map((ss, i) => ({
      index: i + 1,
      boxCount: ss?.boxCount,
      onAir: onAirReason(atem, i) ?? 'no',
      perBoxBorder: s.video.superSources[i]?.boxes.some((b) => b?.border !== undefined) ?? false,
      perSuperSourceBorder: s.video.superSources[i]?.border !== undefined,
      art: s.video.superSources[i]?.properties,
      boxes: s.video.superSources[i]?.boxes.map((b) => b && { enabled: b.enabled, source: b.source, ...fromRaw(b) }),
    })),
    mixEffects: s.video.mixEffects.map((me, i) => me && { me: i + 1, program: me.programInput, preview: me.previewInput }),
    macroCount: info.macroPool?.macroCount,
    reservedMacros: range(RESERVED_MACROS).map((n) => {
      const p = s.macro.macroProperties[n - 1]
      return { slot: n, used: !!p?.isUsed, name: p?.name ?? '' }
    }),
    stillCount: info.mediaPool?.stillCount,
    reservedStills: range(RESERVED_STILLS).map((n) => {
      const st = s.media.stillPool[n - 1]
      return { slot: n, used: !!st?.isUsed, name: st?.fileName ?? '' }
    }),
    mediaPlayers: s.media.players.map((p, i) => p && { player: i + 1, sourceType: p.sourceType, stillIndex: p.stillIndex + 1 }),
    inputs: Object.values(s.inputs)
      .filter((inp) => inp !== undefined)
      .map((inp) => ({ id: inp!.inputId, short: inp!.shortName, long: inp!.longName, type: Enums.InternalPortType[inp!.internalPortType] })),
  }

  console.log(`\n${report.model} at ${ip}`)
  console.log(`  protocol ${report.protocol}, ${report.videoMode} (${report.fps} fps for macro waits)`)
  console.log(`  M/Es ${info.capabilities?.mixEffects}, SuperSources ${info.capabilities?.superSources}, media players ${info.capabilities?.mediaPlayers}, DVEs ${info.capabilities?.DVEs}`)
  console.log(`  macros ${report.macroCount}, stills ${report.stillCount}`)
  for (const ss of report.superSources) {
    const border = ss.perBoxBorder ? 'per-box border' : ss.perSuperSourceBorder ? 'single border for all boxes' : 'no border reported'
    console.log(`  SuperSource ${ss.index}: ${ss.boxCount} boxes, ${border}, on air: ${ss.onAir}`)
  }
  const usedMacros = report.reservedMacros.filter((m) => m.used)
  console.log(`  reserved macros ${RESERVED_MACROS.from}-${RESERVED_MACROS.to}: ${usedMacros.length ? 'IN USE: ' + usedMacros.map((m) => `${m.slot} "${m.name}"`).join(', ') : 'all free'}`)
  const usedStills = report.reservedStills.filter((m) => m.used)
  console.log(`  reserved stills ${RESERVED_STILLS.from}-${RESERVED_STILLS.to}: ${usedStills.length ? 'IN USE: ' + usedStills.map((m) => `${m.slot} "${m.name}"`).join(', ') : 'all free'}`)
  console.log('\n  Inputs (use these ids for --cam and --slides):')
  for (const inp of report.inputs.filter((i) => i.type === 'External' || i.type === 'MEOutput')) {
    console.log(`    ${String(inp.id).padStart(5)}  ${inp.short.padEnd(5)} ${inp.long}`)
  }

  console.log(`\nSaved ${writeResults('probe', report)}`)
  await atem.destroy()
}

function range({ from, to }: { from: number; to: number }): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
