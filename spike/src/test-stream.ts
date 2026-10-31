// Phase 0 test 1: stream the Slide 10 animation from the PC, one batch of box updates per frame.
// Runs on the SuperSource while it is OFF air. Watch it on the multiview (or route SuperSource to
// a recorder) and compare with test-macro.
//
// Usage: npm run test:stream -- --ip 192.168.0.240 --cam 1 --slides 2
//        [--ss 1] [--transition all|in-from-cam|in-from-slides|out-to-cam|out-to-slides]
//        [--loops 5] [--hold 1500]

import { parseArgs, num, str } from './args'
import { EchoRecorder, boxCommands, disableBoxes, frameSpacing, round, stats, writeResults } from './animate'
import { connect, sleep, waitUntil } from './connect'
import { withSuperSource } from './safety'
import { buildFrames, pickTransitions } from './slide10'
import { fpsFor } from './units'

async function main() {
  const args = parseArgs()
  const ip = str(args, 'ip')
  const ss = num(args, 'ss', 1) - 1
  const sources = { A: num(args, 'slides'), B: num(args, 'cam') }
  const transitions = pickTransitions(str(args, 'transition', 'all'))
  const loops = num(args, 'loops', 5)
  const holdMs = num(args, 'hold', 1500)

  const atem = await connect(ip)
  const fps = fpsFor(atem.state!.settings.videoMode)
  const periodMs = 1000 / fps
  const boxCount = atem.state!.info.superSources[ss]?.boxCount ?? 4
  console.log(`Connected. ${fps} fps, frame = ${round(periodMs)} ms. SuperSource ${ss + 1}, ${boxCount} boxes.`)

  const echo = new EchoRecorder(atem, ss)
  const runs: unknown[] = []

  await withSuperSource(atem, ss, async (session) => {
    await atem.sendCommands(disableBoxes(ss, 2, boxCount))
    for (let loop = 0; loop < loops && !session.aborted; loop++) {
      for (const tr of transitions) {
        if (session.aborted) break
        const frames = buildFrames(tr, fps)
        const srcs = tr.boxOrder.map((id) => sources[id])

        // Snap to the start state, then let it settle.
        await atem.sendCommands(boxCommands(ss, frames[0], srcs))
        await sleep(holdMs)

        echo.start()
        const lateMs: number[] = []
        const t0 = performance.now() + 5
        for (let f = 1; f < frames.length && !session.aborted; f++) {
          const due = t0 + (f - 1) * periodMs
          await waitUntil(due)
          lateMs.push(performance.now() - due)
          void atem.sendCommands(boxCommands(ss, frames[f]))
        }
        await sleep(300)
        echo.stop()

        // Box 1 always moves in these transitions, so its reports are the ones to judge.
        const spacing = frameSpacing(echo.timesFor(0, t0), periodMs)
        const run = {
          loop: loop + 1,
          transition: tr.name,
          frames: frames.length - 1,
          sendLateMs: stats(lateMs),
          echoReports: echo.timesFor(0, t0).length,
          echoSpacingFrames: spacing.buckets,
          echoGapMs: spacing.gapMs,
        }
        runs.push(run)
        console.log(
          `${String(loop + 1).padStart(2)} ${tr.name.padEnd(18)} sent ${run.frames} frames, ` +
            `send late p95 ${run.sendLateMs.p95} ms (max ${run.sendLateMs.max}), ` +
            `switcher reports ${run.echoReports}: 1-frame gaps ${spacing.buckets['1']}, doubled ${spacing.buckets['0']}, skipped ${spacing.buckets['2+']}`,
        )
        await sleep(holdMs)
      }
    }
  })

  console.log(`\nSaved ${writeResults('stream', { ip, fps, runs })}`)
  console.log('Now judge it by eye on the multiview: smooth, or visibly uneven?')
  await atem.destroy()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
