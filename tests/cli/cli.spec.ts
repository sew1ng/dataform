import { expect } from "chai";
import { ChildProcess, execFile } from "child_process";
import { version } from "df/core/version";
import { suite, test } from "df/testing";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

suite(__filename, () => {
  const platformPath = os.platform() === "darwin" ? "nodejs_darwin_amd64" : "nodejs_linux_amd64";
  const nodePath = `external/${platformPath}/bin/node`;
  const npmPath = `external/${platformPath}/bin/npm`;
  const corePackageTarPath = "packages/@dataform/core/package.tgz";
  const cliEntryPointPath = "tests/cli/node_modules/@dataform/cli/bundle.js";

  const projectDir = path.join(process.env.TEST_TMPDIR, "project");
  const npmCacheDir = path.join(process.env.TEST_TMPDIR, "npm-cache");

  test("init and compile", async () => {
    // Initialize a project using the CLI, don't install packages.
    await getProcessResult(
      execFile(nodePath, [cliEntryPointPath, "init", "redshift", projectDir, "--skip-install"])
    );

    // Install packages manually to get around bazel sandbox issues.
    await getProcessResult(
      execFile(npmPath, [
        "install",
        "--prefix",
        projectDir,
        "--cache",
        npmCacheDir,
        corePackageTarPath
      ])
    );

    // Write a simple file to the project.
    const filePath = path.join(projectDir, "definitions", "example.sqlx");
    fs.ensureFileSync(filePath);
    fs.writeFileSync(
      filePath,
      `
config { type: "table" }
select 1 as test
`
    );

    // Compile the project using the CLI.
    const { exitCode, stdout } = await getProcessResult(
      execFile(nodePath, [cliEntryPointPath, "compile", projectDir, "--json"])
    );

    expect(exitCode).equals(0);

    expect(JSON.parse(stdout)).deep.equals({
      tables: [
        {
          name: "dataform.example",
          type: "table",
          target: {
            schema: "dataform",
            name: "example"
          },
          query: "\n\nselect 1 as test\n",
          disabled: false,
          fileName: "definitions/example.sqlx"
        }
      ],
      projectConfig: {
        warehouse: "redshift",
        defaultSchema: "dataform",
        assertionSchema: "dataform_assertions",
        useRunCache: false
      },
      graphErrors: {},
      dataformCoreVersion: version,
      targets: [
        {
          schema: "dataform",
          name: "example"
        }
      ]
    });
  });
});

async function getProcessResult(childProcess: ChildProcess) {
  let stdout = "";
  childProcess.stdout.on("data", chunk => (stdout += String(chunk)));
  const exitCode: number = await new Promise(resolve => {
    childProcess.on("close", resolve);
  });
  return { exitCode, stdout };
}