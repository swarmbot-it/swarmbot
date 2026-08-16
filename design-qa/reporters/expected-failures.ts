import type { FullResult, Reporter, Suite, TestCase } from "@playwright/test/reporter";

/**
 * Surfaces `test.fail()` outcomes in the console.
 *
 * Playwright folds an expected failure into the "passed" count, so a tracked
 * mockup defect is invisible in terminal output and only recoverable from the
 * JSON report (`expectedStatus: "failed"`). That is fine until the defect gets
 * fixed upstream and nobody notices the annotation is now lying.
 *
 * This reporter is informational only — it never changes the exit code. Note
 * that Playwright itself already fails a run where a `test.fail()` test starts
 * passing ("Expected to fail, but passed"); this block just explains what that
 * means and what to do about it.
 */
class ExpectedFailureReporter implements Reporter {
	private root: Suite | undefined;

	onBegin(_config: unknown, suite: Suite) {
		this.root = suite;
	}

	onEnd(_result: FullResult) {
		if (!this.root) return;

		// Read the final tree rather than accumulating in onTestEnd: `test.fail()`
		// is called inside the test body, so `expectedStatus` only settles once the
		// test has run.
		const tracked = this.root.allTests().filter((t) => t.expectedStatus === "failed");
		if (tracked.length === 0) {
			// Nothing to say when the suite declares no expected failures — but if the
			// run was filtered down, stay quiet rather than implying the annotation vanished.
			return;
		}

		const lines: string[] = [];
		let regressed = 0;

		for (const test of tracked) {
			const outcome = test.outcome();
			if (outcome === "skipped") continue;

			if (outcome === "expected") {
				lines.push(`  [32mOK[0m       ${describe(test)}`);
				lines.push(
					`           nadal failuje zgodnie z oczekiwaniem — defekt makiety nieusunięty`
				);
			} else {
				regressed++;
				lines.push(`  [33mUWAGA[0m    ${describe(test)}`);
				lines.push(`           zaczął przechodzić — zaktualizuj test (usuń test.fail())`);
				lines.push(`           i zgłoś naprawę makiety w design-qa/README.md ("Findings")`);
			}
		}

		if (lines.length === 0) return;

		const heading =
			regressed > 0 ? "OCZEKIWANE PORAŻKI — WYMAGANA AKCJA" : "OCZEKIWANE PORAŻKI";

		console.log("");
		console.log(`[1m${heading}[0m`);
		console.log(lines.join("\n"));
		console.log("");
	}
}

function describe(test: TestCase): string {
	const file = test.location.file.split("/").slice(-2).join("/");
	return `${test.titlePath().slice(1).join(" > ")}  (${file}:${test.location.line})`;
}

export default ExpectedFailureReporter;
