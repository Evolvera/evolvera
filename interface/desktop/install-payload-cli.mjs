import { installPayloadCommand } from './install-payload.mjs';

process.exitCode = await installPayloadCommand(process.argv.slice(2));
