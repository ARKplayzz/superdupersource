// Phase 0 test 2: bake the Slide 10 animation into a switcher macro (one frame wait per step),
// then run it. Also checks that macro download and upload work, which the app needs for
// "smart macros" (project.md §5.2).
//
// Steps:
//   1. Record the macro live into --slot (the SuperSource is off air, so recording is harmless)
//   2. Download it and save the bytes to results/ (for working out the macro format later)
//   3. Upload the same bytes into --copy-slot and time the upload
//   4. Run both macros --runs times each, measuring duration and frame spacing
//   5. Optional --stress N: record an N-frame macro to look for a size limit
//   6. Delete both macros unless --keep
//
// Usage: npm run test:macro -- --ip 192.168.0.240 --cam 1 --slides 2
//        [--ss 1] [--transition in-from-cam] [--slot 99] [--copy-slot 98] [--runs 3]
//        [--stress 1500] [--keep] [--force]
// Slots are numbered from 1, as in ATEM Software Control.

import { writeFileSync } from 'node:fs'
import { Atem } from 'atem-connection'
import { flag, num, parseArgs, str } from './args'
import { EchoRecorder, boxCommands, disableBoxes, frameSpacing, round, writeResults } from './animate'
import { connect, sleep, waitForState } from './connect'
import { MACRO_PREFIX, assertMacroSlotFree, withSuperSource } from './safety'
import { TRANSITIONS, buildFrames } from './slide10'
import { BoxState, FULLSCREEN, fpsFor } from './units'

async function recordMacro(atem: Atem, index: number, name: string, ss: number, frames: BoxState[][], sources: number[]) {
  const t0 = performance.now()
  await atem.macroStartRecord(index, name, 'SuperDuperSource phase 0 test')
  await waitForState(atem, () => !!atem.state?.macro.macroRecorder.isRecording, 3000, 'macro recording to start')
  await atem.sendCommands(boxCommands(ss, frames[0], sources))
  for (let f = 1; f < frames.length; f++) {
    await atem.macroInsertTimedWait(1)
    await atem.sendCommands(boxCommands(ss, frames[f]))
  }
  await atem.macroStopRecord()
  await waitForState(atem, () => !atem.state?.macro.macroRecorder.isRecording, 3000, 'macro recording to stop')
  await waitForState(atem, () => !!atem.state?.macro.macroProperties[index]?.isUsed, 3000, 'macro slot to show as used')
  return round(performance.now() - t0)
}

async function runMacro(atem: Atem, index: number, echo: EchoRecorder, expectedMs: number) {
  const player = () => atem.state!.macro.macroPlayer
  echo.start()
  const sent = performance.now()
  await atem.macroRun(index)
  await waitForState(atem, () => player().isRunning && player().macroIndex === index, 2000, 'macro to start')
  const started = performance.now()
  await waitForState(atem, () => !player().isRunning, expectedMs + 5000, 'macro to finish')
  const finished = performance.now()
  await sleep(100)
  echo.stop()
  return { startLatencyMs: round(started - sent), durationMs: round(finished - started), boxReports: echo.timesFor(0, started) }
}

async function main() {
  const args = parseArgs()
  const ip = str(args, 'ip')
  const ss = num(args, 'ss', 1) - 1
  const sources = { A: num(args, 'slides'), B: num(args, 'cam') }
  const key = str(args, 'transition', 'in-from-cam')
  const tr = TRANSITIONS[key]
  if (!tr) throw new Error(`Unknown transition "${key}". Use one of: ${Object.keys(TRANSITIONS).join(', ')}`)
  const slot = num(args, 'slot', 99) - 1
  const copySlot = num(args, 'copy-slot', 98) - 1
  const runs = num(args, 'runs', 3)
  const stress = num(args, 'stress', 0)
  const force = flag(args, 'force')

  const atem = await connect(ip)
  const fps = fpsFor(atem.state!.settings.videoMode)
  const periodMs = 1000 / fps
  const boxCount = atem.state!.info.superSources[ss]?.boxCount ?? 4
  assertMacroSlotFree(atem, slot, force)
  assertMacroSlotFree(atem, copySlot, force)

  const frames = buildFrames(tr, fps)
  const srcs = tr.boxOrder.map((id) => sources[id])
  const expectedMs = round(((frames.length - 1) * 1000) / fps)
  console.log(`Connected. ${fps} fps. "${tr.name}" is ${frames.length - 1} frames (${expectedMs} ms).`)

  const results: Record<string, unknown> = { ip, fps, transition: tr.name, frames: frames.length - 1, expectedMs }
  const echo = new EchoRecorder(atem, ss)

  await withSuperSource(atem, ss, async (session) => {
    await atem.sendCommands(disableBoxes(ss, 2, boxCount))

    console.log(`\n1. Recording into macro ${slot + 1}...`)
    results.recordMs = await recordMacro(atem, slot, `${MACRO_PREFIX}spike ${key}`, ss, frames, srcs)
    console.log(`   took ${results.recordMs} ms`)
    if (session.aborted) return

    console.log(`2. Downloading macro ${slot + 1}...`)
    let t = performance.now()
    const data = await atem.downloadMacro(slot)
    results.downloadMs = round(performance.now() - t)
    results.macroBytes = data.length
    results.bytesPerFrame = round(data.length / (frames.length - 1), 1)
    const binFile = writeResults(`macro-${key}`, { hex: data.toString('hex') }).replace(/\.json$/, '.bin')
    writeFileSync(binFile, data)
    console.log(`   ${data.length} bytes (${results.bytesPerFrame} per frame), ${results.downloadMs} ms. Saved ${binFile}`)
    console.log(`   first 64 bytes: ${data.subarray(0, 64).toString('hex')}`)

    console.log(`3. Uploading the same bytes into macro ${copySlot + 1}...`)
    t = performance.now()
    await atem.uploadMacro(copySlot, `${MACRO_PREFIX}spike copy`, data)
    await waitForState(atem, () => !!atem.state?.macro.macroProperties[copySlot]?.isUsed, 3000, 'uploaded macro to show as used')
    results.uploadMs = round(performance.now() - t)
    console.log(`   took ${results.uploadMs} ms`)

    console.log(`4. Running each macro ${runs} times (watch the multiview)...`)
    const runResults: unknown[] = []
    for (let r = 0; r < runs && !session.aborted; r++) {
      for (const [label, index] of [['recorded', slot], ['uploaded', copySlot]] as const) {
        if (session.aborted) break
        await sleep(1500)
        const res = await runMacro(atem, index, echo, expectedMs)
        const spacing = frameSpacing(res.boxReports, periodMs)
        runResults.push({ run: r + 1, macro: label, ...res, boxReports: res.boxReports.length, spacing })
        console.log(
          `   ${r + 1} ${label.padEnd(8)} duration ${res.durationMs} ms (expected ${expectedMs}), start latency ${res.startLatencyMs} ms, ` +
            `switcher reports ${res.boxReports.length}: 1-frame gaps ${spacing.buckets['1']}, doubled ${spacing.buckets['0']}, skipped ${spacing.buckets['2+']}`,
        )
        await sleep(1000)
      }
    }
    results.runs = runResults

    if (stress > 0 && !session.aborted) {
      console.log(`5. Stress: recording a ${stress}-frame macro into ${slot + 1}...`)
      const wobble: BoxState[][] = Array.from({ length: stress + 1 }, (_, f) =>
        tr.boxOrder.map((id, i) => (i === 0 ? { ...FULLSCREEN, size: 0.5, x: 8 * Math.sin(f / 10) } : frames[frames.length - 1][i])),
      )
      try {
        const ms = await recordMacro(atem, slot, `${MACRO_PREFIX}spike stress`, ss, wobble, srcs)
        const bytes = (await atem.downloadMacro(slot)).length
        results.stress = { frames: stress, ok: true, recordMs: ms, bytes }
        console.log(`   ok: ${bytes} bytes, recorded in ${ms} ms`)
      } catch (e) {
        results.stress = { frames: stress, ok: false, error: String(e) }
        console.log(`   failed: ${e}`)
        if (atem.state?.macro.macroRecorder.isRecording) await atem.macroStopRecord()
      }
    }

    if (!flag(args, 'keep')) {
      await atem.macroDelete(slot)
      await atem.macroDelete(copySlot)
      console.log(`Deleted macros ${slot + 1} and ${copySlot + 1}.`)
    }
  })

  console.log(`\nSaved ${writeResults('macro', results)}`)
  await atem.destroy()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
