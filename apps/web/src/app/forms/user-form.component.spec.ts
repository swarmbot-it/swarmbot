import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach } from "vitest";
import { Apollo } from "apollo-angular";
import { TranslocoTestingModule } from "@jsverse/transloco";
import { UserFormComponent } from "./user-form.component";

describe("UserFormComponent validation", () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [
				UserFormComponent,
				TranslocoTestingModule.forRoot({
					langs: { en: {} },
					translocoConfig: { availableLangs: ["en"], defaultLang: "en" },
				}),
			],
			providers: [{ provide: Apollo, useValue: {} }],
		});
	});

	it("is invalid when required fields are empty", () => {
		const fixture = TestBed.createComponent(UserFormComponent);
		fixture.detectChanges();
		expect(fixture.componentInstance.userForm().valid()).toBe(false);
	});

	it("flags a password shorter than 8 characters", () => {
		const fixture = TestBed.createComponent(UserFormComponent);
		fixture.detectChanges();
		fixture.componentInstance.model.set({
			username: "alice",
			password: "short",
			email: "alice@example.com",
			phone: "",
			role: "Editor",
		});
		fixture.detectChanges();
		expect(fixture.componentInstance.userForm.password().valid()).toBe(false);
		expect(fixture.componentInstance.userForm().valid()).toBe(false);
	});

	it("is valid once username/password/email are all filled in", () => {
		const fixture = TestBed.createComponent(UserFormComponent);
		fixture.detectChanges();
		fixture.componentInstance.model.set({
			username: "alice",
			password: "correct-horse",
			email: "alice@example.com",
			phone: "",
			role: "Editor",
		});
		fixture.detectChanges();
		expect(fixture.componentInstance.userForm().valid()).toBe(true);
	});

	it("resets the form model when the modal is closed", () => {
		const fixture = TestBed.createComponent(UserFormComponent);
		fixture.detectChanges();
		fixture.componentInstance.model.set({
			username: "alice",
			password: "correct-horse",
			email: "alice@example.com",
			phone: "",
			role: "Administrator",
		});
		fixture.componentInstance.onClose();
		expect(fixture.componentInstance.model()).toEqual({
			username: "",
			password: "",
			email: "",
			phone: "",
			role: "Editor",
		});
	});
});
