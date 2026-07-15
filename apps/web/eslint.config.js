// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = defineConfig([
	{
		files: ["**/*.ts"],
		extends: [
			eslint.configs.recommended,
			tseslint.configs.recommended,
			tseslint.configs.stylistic,
			angular.configs.tsRecommended,
		],
		processor: angular.processInlineTemplates,
		rules: {
			"@angular-eslint/directive-selector": [
				"error",
				{
					type: "attribute",
					prefix: ["sb", "app"],
					style: "camelCase",
				},
			],
			"@angular-eslint/component-selector": [
				"error",
				{
					type: "element",
					prefix: ["sb", "app"],
					style: "kebab-case",
				},
			],
			// The codebase consistently uses `type` aliases, not `interface` — a
			// deliberate existing style, not something worth a mechanical rewrite.
			"@typescript-eslint/consistent-type-definitions": "off",
			// Renaming these would change a public @Output() API used across many
			// templates (e.g. modal.component.ts `close`); flag but don't block.
			"@angular-eslint/no-output-native": "warn",
			// Modernization suggestion (constructor DI -> inject()), not a bug.
			"@angular-eslint/prefer-inject": "warn",
		},
	}
	,
	{
		files: ["**/*.html"],
		extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
		rules: {
			// The app consistently uses *ngIf/*ngFor/*ngSwitch, not the newer @if/@for
			// control-flow syntax. Migrating ~150 template sites is a real refactor,
			// not an ESLint-adoption task — tracked, not auto-flagged as an error.
			"@angular-eslint/template/prefer-control-flow": "off",
			// Legitimate a11y gaps (missing keyboard handlers, unassociated labels)
			// pre-date this config and need actual template/markup changes to fix
			// correctly — surfaced as warnings rather than failing lint outright.
			"@angular-eslint/template/click-events-have-key-events": "warn",
			"@angular-eslint/template/interactive-supports-focus": "warn",
			"@angular-eslint/template/label-has-associated-control": "warn",
		},
	},
]);
