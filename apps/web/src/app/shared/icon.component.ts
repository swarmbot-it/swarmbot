import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";

/**
 * Inline SVG icon set used across the admin UI.
 *
 * Glyphs are stored as ready-to-use SVG inner markup so the template
 * stays tiny — the component just sanitizes & renders the cached SVG
 * for the requested name. Icons inherit `currentColor`, so they recolor
 * with whatever text container holds them.
 */

const ICONS: Record<string, string> = {
	dashboard:
		'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
	stacks: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
	services:
		'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
	tasks: '<path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
	nodes: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h8M6 8v8M18 8v8M8 18h8"/>',
	networks:
		'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
	volumes:
		'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/>',
	secrets:
		'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
	configs:
		'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/>',
	registries:
		'<path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><path d="M3 7l3-4h12l3 4"/><path d="M3 7h18M9 11h6"/>',
	users: '<circle cx="9" cy="8" r="4"/><path d="M3 21a6 6 0 0 1 12 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a6 6 0 0 0-4.5-5.8"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
	bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
	chevronDown: '<path d="M6 9l6 6 6-6"/>',
	chevronRight: '<path d="M9 18l6-6-6-6"/>',
	chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
	pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
	close: '<path d="M18 6L6 18M6 6l12 12"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
	moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
	logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
	settings:
		'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09c0 .69.4 1.31 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.82 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.69 0-1.31.4-1.51 1z"/>',
	user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
	keys: '<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L19 4l2 2-2 2-2-2-1.5 1.5L17 9l-2 2-1.5-1.5"/>',
	refresh:
		'<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
	trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
	server: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
	leader: '<path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>',
	eye: '<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/>',
	check: '<path d="M5 12l5 5L20 7"/>',
	play: '<path d="M6 4l14 8-14 8z"/>',
	activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
	trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
	download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
};

@Component({
	selector: "sb-icon",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<svg
			[attr.width]="size"
			[attr.height]="size"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			[attr.stroke-width]="strokeWidth"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			[innerHTML]="svg"
		></svg>
	`,
	host: { "[style.display]": "'inline-flex'", "[style.line-height]": "'0'" },
})
export class IconComponent {
	/** Icon glyph key from the built-in set (e.g. `dashboard`, `stacks`). */
	@Input() name: string = "";
	/** Width and height of the SVG in pixels. */
	@Input() size = 18;
	/** Stroke width for outline icons. */
	@Input() strokeWidth = 2;

	constructor(private readonly sanitizer: DomSanitizer) {}

	get svg(): SafeHtml {
		return this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name] ?? "");
	}
}
