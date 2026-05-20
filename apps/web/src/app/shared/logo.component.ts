import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { NgIf } from "@angular/common";

/**
 * SwarmBoty logo: four nodes and hub links with gentle out-of-sync opacity fade.
 * Animations are disabled when the user prefers reduced motion.
 */
@Component({
	selector: "sb-logo",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<span class="sb-logo-wrap">
			<svg width="28" height="28" viewBox="0 0 32 32" class="sb-logo" fill="none">
				<path
					class="sb-logo__link sb-logo__link--1"
					d="M12.5 16 L15.5 9.5"
					stroke="var(--primary-500)"
					stroke-width="1.2"
				/>
				<path
					class="sb-logo__link sb-logo__link--2"
					d="M12.5 16 L15.5 22.5"
					stroke="var(--primary-500)"
					stroke-width="1.2"
				/>
				<path
					class="sb-logo__link sb-logo__link--3"
					d="M20.5 9 L23 14"
					stroke="var(--primary-500)"
					stroke-width="1.2"
				/>
				<path
					class="sb-logo__link sb-logo__link--4"
					d="M20.5 23 L23 18"
					stroke="var(--primary-500)"
					stroke-width="1.2"
				/>
				<circle
					class="sb-logo__dot sb-logo__dot--center"
					cx="9"
					cy="16"
					r="3.5"
					fill="var(--primary-500)"
				/>
				<circle
					class="sb-logo__dot sb-logo__dot--top"
					cx="18"
					cy="9"
					r="2.5"
					fill="var(--primary-400)"
				/>
				<circle
					class="sb-logo__dot sb-logo__dot--bottom"
					cx="18"
					cy="23"
					r="2.5"
					fill="var(--primary-400)"
				/>
				<circle
					class="sb-logo__dot sb-logo__dot--right"
					cx="25"
					cy="16"
					r="3"
					fill="var(--primary-600)"
				/>
			</svg>
			<span class="sb-logo__word" *ngIf="showWord">
				<span class="sb-logo__title"
					>swarm<span style="color: var(--primary-500)">boty</span></span
				>
				<span class="sb-logo__subtitle">v2.14.0 · prod-eu-1</span>
			</span>
		</span>
	`,
	styles: [
		`
			:host {
				display: inline-flex;
				align-items: center;
			}
			.sb-logo-wrap {
				display: inline-flex;
				align-items: center;
				gap: 10px;
			}
			.sb-logo {
				overflow: visible;
			}
			.sb-logo__dot {
				will-change: opacity;
			}
			.sb-logo__dot--center {
				animation: sb-fade-soft 5.7s ease-in-out infinite;
				animation-delay: 0s;
			}
			.sb-logo__dot--top {
				animation: sb-fade 4.3s ease-in-out infinite;
				animation-delay: 1.1s;
			}
			.sb-logo__dot--bottom {
				animation: sb-fade 6.1s ease-in-out infinite;
				animation-delay: 0.4s;
			}
			.sb-logo__dot--right {
				animation: sb-fade 3.7s ease-in-out infinite;
				animation-delay: 2.2s;
			}
			.sb-logo__link {
				animation: sb-link-fade 5s ease-in-out infinite;
			}
			.sb-logo__link--1 {
				animation-duration: 4.7s;
				animation-delay: 1.4s;
			}
			.sb-logo__link--2 {
				animation-duration: 5.9s;
				animation-delay: 0.7s;
			}
			.sb-logo__link--3 {
				animation-duration: 4.1s;
				animation-delay: 2.5s;
			}
			.sb-logo__link--4 {
				animation-duration: 6.3s;
				animation-delay: 0.2s;
			}
			.sb-logo__word {
				display: flex;
				flex-direction: column;
				line-height: 1.1;
			}
			.sb-logo__title {
				font-weight: 800;
				font-size: 16px;
				letter-spacing: -0.02em;
			}
			.sb-logo__subtitle {
				font-size: 9.5px;
				color: var(--muted);
				font-family: var(--font-mono);
				letter-spacing: 0.08em;
			}
			@keyframes sb-fade {
				0%,
				100% {
					opacity: 1;
				}
				50% {
					opacity: 0.15;
				}
			}
			@keyframes sb-fade-soft {
				0%,
				100% {
					opacity: 1;
				}
				50% {
					opacity: 0.55;
				}
			}
			@keyframes sb-link-fade {
				0%,
				100% {
					opacity: 0.55;
				}
				50% {
					opacity: 0.1;
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.sb-logo__dot,
				.sb-logo__link {
					animation: none;
				}
			}
		`,
	],
	imports: [NgIf],
})
export class LogoComponent {
	/** When true, shows the "swarmboty" wordmark and version subtitle beside the mark. */
	@Input() showWord = true;
}
