import { Routes } from '@angular/router';
import { LoginPageComponent } from './pages/login/login-page.component';
import { ServicesPageComponent } from './pages/services/services-page.component';
import { NodesPageComponent } from './pages/nodes/nodes-page.component';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: '', pathMatch: 'full', redirectTo: 'services' },
  { path: 'services', component: ServicesPageComponent, canActivate: [authGuard] },
  { path: 'nodes', component: NodesPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'services' }
];
