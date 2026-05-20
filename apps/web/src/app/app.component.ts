import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { ThemeService } from "./core/theme.service";

/**
 * Application root. The shell + routed view live under <router-outlet>.
 * Theme service is injected eagerly so the saved theme is applied before
 * any view renders.
 */
@Component({
	selector: "app-root",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterOutlet],
	template: "<router-outlet></router-outlet>",
})
export class AppComponent {
	// ensure ThemeService is constructed so the saved theme is applied immediately
	private readonly _theme = inject(ThemeService);
}
