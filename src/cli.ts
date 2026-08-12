#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
import { runCli } from "./cli/run.ts";

const result = runCli(process.argv.slice(2), process.env);
process.stdout.write(`${result.output}\n`);
process.exitCode = result.exitCode;
