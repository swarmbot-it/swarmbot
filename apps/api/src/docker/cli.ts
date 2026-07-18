import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import type { SwarmbotConfig } from "../config.js";

const STACK_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export function validateStackName(name: string): void {
	if (!STACK_NAME.test(name)) {
		throw new Error("invalid_stack_name");
	}
}

function stackFilePath(workDir: string, name: string): string {
	return join(workDir, `stack-${name}-${process.pid}.yml`);
}

export async function stackDeploy(
	cfg: SwarmbotConfig,
	name: string,
	composeYaml: string,
	opts?: { skipResolveImage?: boolean }
): Promise<void> {
	validateStackName(name);
	const file = stackFilePath(cfg.workDir, name);
	await mkdir(cfg.workDir, { recursive: true });
	await writeFile(file, composeYaml, "utf8");
	const args = ["stack", "deploy", "--compose-file", file, name];
	if (opts?.skipResolveImage) {
		args.splice(2, 0, "--resolve-image", "never");
	}
	await dockerCli(args);
	await rm(file, { force: true });
}

export async function stackRemove(_cfg: SwarmbotConfig, name: string): Promise<void> {
	validateStackName(name);
	await dockerCli(["stack", "rm", name]);
}

function dockerCli(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
		let err = "";
		child.stderr?.on("data", (c) => {
			err += String(c);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(err || `docker exited ${code}`));
		});
	});
}
