/**
 * Browser entry point. Bootstraps the standalone root component with {@link appConfig}.
 */
import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app/app.config";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
