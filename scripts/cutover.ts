import { runCutover } from "../lib/cutover";
import { prisma } from "../lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLYING cutover (real writes)..." : "DRY RUN — nothing will be written.");

  const result = await runCutover({ dryRun: !apply });
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok || result.errors.length) {
    console.error("Finished with errors — NOT marked complete. Fix and run again.");
    process.exitCode = 1;
  } else if (!apply) {
    console.log("Dry run OK. Re-run with mode=apply to execute for real.");
  } else {
    console.log("Cutover complete.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());