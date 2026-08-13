/**
 * What the Lambda runtime loads for the trends run.
 *
 * The runtime resolves a handler by file extension and looks for JavaScript. It will not find
 * trends.ts however the file is named, so this is the entry it can see.
 */
export { handler } from "./trends.ts";
