import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { ThemeService } from "./core/theme.service";
import { ToastService } from "./core/toast.service";
import { ToastComponent } from "./shared/toast/toast.component";

/**
 * Application root. The shell + routed view live under <router-outlet>.
 * ThemeService is injected eagerly so the saved theme is applied before
 * any view renders. ToastService is injected eagerly so console.error /
 * console.warn are patched from the very first moment.
 */
@Component({
	selector: "app-root",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterOutlet, ToastComponent],
	template: `
		<router-outlet></router-outlet>
		<sb-toast></sb-toast>
	`,
})
export class AppComponent {
	private readonly _theme = inject(ThemeService);
	private readonly _toast = inject(ToastService);
}
