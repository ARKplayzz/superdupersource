// Phase 0 test 3: confirm the box value ranges, the unit scale, how crop scales, and which box
// draws on top. Part automatic (read-back after setting out-of-range values), part visual
// (press Enter between steps and note what the multiview shows).
//
// Usage: npm run test:ranges -- --ip 192.168.0.240 --cam 1 --slides 2 [--ss 1]

import { createInterface } from 'node:readline/promises'
import { Atem } from 'atem-connection'
import { num, parseArgs, str } from './args'
import { boxCommands, disableBoxes, writeResults } from './animate'
import { connect, sleep } from './connect'
import { withSuperSource } from './safety'
import { box } from './units'

async function readBack(atem: Atem, ss: number, i: number) {
  await sleep(300)
  const b = atem.state!.video.superSources[ss]!.boxes[i]!
  return { x: b.x, y: b.y, size: b.size, cropTop: b.cropTop, cropBottom: b.cropBottom, cropLeft: b.cropLeft, cropRight: b.cropRight }
}

async function main() {
  const args = parseArgs()
  const ip = str(args, 'ip')
  const ss = num(args, 'ss', 1) - 1
  const cam = num(args, 'cam')
  const slides = num(args, 'slides')
  const atem = await connect(ip)
  const boxCount = atem.state!.info.superSources[ss]?.boxCount ?? 4
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const results: Record<string, unknown> = { ip }
  const notes: Record<string, string> = {}

  await withSuperSource(atem, ss, async (session) => {
    await atem.sendCommands(disableBoxes(ss, 0, boxCount))

    console.log('Automatic: setting out-of-range raw values on box 1 and reading back what the switcher keeps...')
    const probes = {
      max: { x: 32000, y: 32000, size: 5000, cropTop: 30000, cropBottom: 30000, cropLeft: 30000, cropRight: 30000 },
      min: { x: -32000, y: -32000, size: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 },
    }
    for (const [name, raw] of Object.entries(probes)) {
      await atem.setSuperSourceBoxSettings({ enabled: true, source: cam, cropped: true, ...raw }, 0, ss)
      results[`clamp_${name}`] = await readBack(atem, ss, 0)
      console.log(`  ${name}: switcher kept`, results[`clamp_${name}`])
    }
    if (session.aborted) return

    const steps: { key: string; prompt: string; apply: () => Promise<void> }[] = [
      {
        key: 'quadrant',
        prompt: 'Box 1 should exactly fill the TOP-RIGHT quarter of the frame. Does it? (y/n, or describe)',
        apply: () => atem.sendCommands(boxCommands(ss, [box({ x: 8, y: 4.5, size: 0.5 })], [cam])),
      },
      {
        key: 'crop_scale',
        prompt:
          'Box 1: size 0.5, centred, crop left 16. If crop scales with size, the box shows the RIGHT HALF of the image and spans from the centre line to 1/4 of the frame width right of centre. What do you see?',
        apply: () => atem.sendCommands(boxCommands(ss, [box({ x: 0, y: 0, size: 0.5, cropL: 16 })], [cam])),
      },
      {
        key: 'slide10_final',
        prompt: 'Slide 10 final layout (slides left at 75%, presenter strip right). Do the edges line up with the Slide_10 template? (y/n, or describe)',
        apply: () =>
          atem.sendCommands(boxCommands(ss, [box({ x: 12, y: 0, size: 0.5, cropL: 8, cropR: 8 }), box({ x: -4, y: 0, size: 0.75 })], [cam, slides])),
      },
      {
        key: 'stacking',
        prompt: `Box 1 (camera, input ${cam}) and box 2 (slides, input ${slides}) overlap in the middle. Which one is on top?`,
        apply: () => atem.sendCommands(boxCommands(ss, [box({ x: -3, y: 0, size: 0.5 }), box({ x: 3, y: 0, size: 0.5 })], [cam, slides])),
      },
    ]

    for (const step of steps) {
      if (session.aborted) break
      await atem.sendCommands(disableBoxes(ss, 0, boxCount))
      await step.apply()
      notes[step.key] = await rl.question(`\n${step.prompt}\n> `)
    }
  })

  rl.close()
  results.visual = notes
  console.log(`\nSaved ${writeResults('ranges', results)}`)
  await atem.destroy()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
