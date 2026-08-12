/**
 * What the Lambda runtime loads.
 *
 * The runtime resolves a handler by file extension and looks for JavaScript. It will not find
 * handler.ts however the file is named, so this is the entry it can see. Node strips the types
 * from the import at load, which is why there is still no build step.
 */
export { handler } from "./handler.ts";
