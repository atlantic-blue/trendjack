#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import { runCli } from "./run.ts";

const result = await runCli(process.argv.slice(2), process.env);
process.stdout.write(`${result.output}\n`);
process.exitCode = result.exitCode;
