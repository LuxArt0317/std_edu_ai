import {runAccountPacketCli} from './run-health-counseling-preview.mjs';

runAccountPacketCli(process.argv.slice(2),{selection:['tutor-tuition']}).catch(error=>{
  console.error(error.message);process.exitCode=1;
});
